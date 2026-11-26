#!/usr/bin/env node
// Machine-wide gate for memory-heavy jobs, shared by every project and agent on this machine.
//
//   node ~/.agents/tools/machine/heavy.mjs --class test -- pnpm vitest run
//   node ~/.agents/tools/machine/heavy.mjs --wait-free            (memory admission only, no slot)
//   node ~/.agents/tools/machine/heavy.mjs --status
//
// A job runs only when (1) a slot of its class is free and (2) the machine has enough available
// RAM and commit charge. It blocks (one call, no polling by the agent) until both hold, runs the
// command, passes its exit code through, and frees the slot. Slots held by dead processes are reclaimed.
// While it runs, the job's own process tree is capped (memCapGB per class, --mem-cap <GB>): past it the tree is killed,
// "[heavy] KILLED ..." is printed, kills.log gets a line and the exit is 137. Test jobs get NODE_OPTIONS --max-old-space-size=4096.
// Exit 75 = gave up after --max-wait-min. Limits come from budget.json beside this file, if present.
import { mkdirSync, rmSync, renameSync, writeFileSync, utimesSync, readFileSync, readdirSync, existsSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import os from 'node:os';
import { startSampler, descendants, treeBytes, killPids, logKill, GB } from './proctree.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULTS = {
  // slots per class, machine-wide (all projects together)
  slots: { test: 2, browser: 2, build: 1, blender: 1, render: 1, any: 3 },
  minFreeGB: 6,        // available physical RAM required before a heavy job starts
  maxCommitPct: 88,    // commit charge (RAM + page file) must be below this
  // 2026-11-13: commit hit 93% when C:\pagefile.sys grew to 22.6 GB and left C: 14.4 GB free. A page file
  // counts on growing only into its drive's free space beyond this reserve, and nothing heavy starts while
  // the system drive has less than minSystemFreeGB free (growth there starves builds, caches and Windows).
  pagefileReserveGB: 20,
  minSystemFreeGB: 20,
  maxWaitMin: 60,
  // Heavy jobs at once over every class (0 = no limit). The laptop sets 1 (2026-11-23: a test job and a browser job
  // each got their own class's slot, and the laptop paged until layout tests took 10 minutes each).
  maxTotal: 0,
  // With maxTotal set: jobs start in the order they queued, not by who polls first (the laptop, 2026-11-24: with seven
  // lanes the branch nearest landing was passed by newer jobs for 16 min). `--first <worktree>` puts one worktree's jobs ahead.
  fifo: false,
  // 2026-11-24 (user: "freezing mid game, that needs to be solved"; 36 of 41 freezes in a night overlapped agent jobs):
  // the play watcher's log (budget.json, the PC the user plays on). While its last line is fresh and not "detached" the
  // user is playing and no new heavy job starts.
  playLog: '', playFreshMin: 10,
  // 2026-11-25: a node test's tree grew to 63 GB and the PC fell to 0.1 GB free. The job's own process tree (private
  // bytes of it and every descendant, every 2 s while it runs) may not pass its class's cap; past it the tree is killed,
  // logged to kills.log and the job exits 137. `--mem-cap <GB>` overrides (0 = no cap).
  memCapGB: { test: 10, browser: 8, build: 6, blender: 12, render: 12, any: 12 },
};
let cfg = DEFAULTS;
try { const b = JSON.parse(readFileSync(join(HERE, 'budget.json'), 'utf8')); cfg = { ...DEFAULTS, ...b, slots: { ...DEFAULTS.slots, ...(b.slots || {}) }, memCapGB: { ...DEFAULTS.memCapGB, ...(b.memCapGB || {}) } }; } catch {}

const argv = process.argv.slice(2);
const dd = argv.indexOf('--');
const opts = dd >= 0 ? argv.slice(0, dd) : argv;
const cmd = dd >= 0 ? argv.slice(dd + 1) : [];
const opt = (k, d) => { const i = opts.indexOf(k); return i >= 0 ? opts[i + 1] : d; };
const flag = k => opts.includes(k);
const cls = opt('--class', 'any');
const nSlots = +opt('--slots', cfg.slots[cls] ?? cfg.slots.any);
// A limit from budget.json or the command line: a number in [lo, hi], else the default (null, '', true,
// "bad" or a negative never turns a safeguard off or blocks every reading).
const num = (v, d, lo, hi = Infinity) => {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return d;
  const n = +v; return Number.isFinite(n) && n >= lo && n <= hi ? n : d;
};
const minFree = num(opt('--min-free-gb', cfg.minFreeGB), DEFAULTS.minFreeGB, 0);
const maxCommit = num(opt('--max-commit-pct', cfg.maxCommitPct), DEFAULTS.maxCommitPct, 1, 100);
const maxWaitMs = +opt('--max-wait-min', cfg.maxWaitMin) * 60e3;
const pfReserveMB = Math.round(num(cfg.pagefileReserveGB, DEFAULTS.pagefileReserveGB, 0) * 1024);
const minSysFree = num(opt('--min-system-free-gb', cfg.minSystemFreeGB), DEFAULTS.minSystemFreeGB, 0);
const memCap = num(opt('--mem-cap', cfg.memCapGB[cls] ?? cfg.memCapGB.any), DEFAULTS.memCapGB[cls] ?? DEFAULTS.memCapGB.any, 0);
const maxTotal = num(opt('--max-total', cfg.maxTotal), DEFAULTS.maxTotal, 0);
// A job started inside a slot's own job is part of it: it isn't counted against maxTotal (it would wait for its parent).
// The variable names the wrapper holding that slot, so a worker that outlives its job is counted again.
let inSlot = false; try { const p = +process.env.HEAVY_IN_SLOT; if (p > 0) { process.kill(p, 0); inSlot = true; } } catch {}
const ROOT = join(process.env.LOCALAPPDATA || os.tmpdir(), 'AgentSlots');

const alive = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
function memory() {
  const availGB = os.freemem() / 2 ** 30;
  let commitPct = null, sysFreeGB = null, unread = '';
  if (process.platform === 'win32') {
    // Free and current commit limit (KB); how far the online page files can still grow (KB), each capped
    // by its drive's free space minus pagefileReserveGB (a drive already under the reserve adds nothing);
    // and the system drive's free space (MB). A drive that can't be read adds no growth.
    const ps = `$o=Get-CimInstance Win32_OperatingSystem; $g=0; $set=@{}; ` +
      `Get-CimInstance Win32_PageFileSetting | % { $set[$_.Name.ToLower()]=$_.MaximumSize }; ` +
      `Get-CimInstance Win32_PageFileUsage | % { $mx=$set[$_.Name.ToLower()]; if ($mx -gt $_.AllocatedBaseSize) { ` +
      `$d=Get-PSDrive $_.Name.Substring(0,1) -ErrorAction SilentlyContinue; if ($d -and $d.Free -ne $null) { ` +
      `$room=[math]::Max(0,[math]::Floor($d.Free/1MB)-${pfReserveMB}); ` +
      `$g+=[math]::Min($mx-$_.AllocatedBaseSize,$room)*1024 } } }; ` +
      `$s=Get-PSDrive $env:SystemDrive.Substring(0,1) -ErrorAction SilentlyContinue; ` +
      `$sf=$(if ($s -and $s.Free -ne $null) { [math]::Floor($s.Free/1MB) } else { -1 }); ` +
      `"HEAVYMEM $($o.FreeVirtualMemory) $($o.TotalVirtualMemorySize) $g $sf"`;
    // windowsHide: a caller without a console (T3, a scheduled task) would otherwise get a Terminal window
    // flashed up on every poll (every 5-15 s while waiting). 2026-11-20.
    const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8', timeout: 20000, windowsHide: true });
    // Only the marked line counts (warnings or other output can't shift the fields). On Windows an
    // unreadable commit or system-drive reading blocks the job: safety that can't be established isn't assumed.
    const mm = /HEAVYMEM (\d+(?:\.\d+)?) (\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/.exec(r.stdout || '');
    const [free, total, grow, sf] = mm ? mm.slice(1).map(Number) : [NaN, NaN, NaN, NaN];
    // 2026-11-13: measured against the limit the page files can actually reach. Gating on the current
    // limit blocked jobs at 91% commit while 11 GB of RAM sat free and the page file was 9% used.
    if (total > 0 && free >= 0 && free <= total) commitPct = 100 * (total - free) / (total + (grow > 0 ? grow : 0));
    else unread = 'no commit reading';
    if (Number.isFinite(sf) && sf >= 0) sysFreeGB = sf / 1024;
    else unread = (unread ? unread + ', ' : '') + 'no system drive reading';
  }
  return { availGB, commitPct, sysFreeGB, unread };
}
const memOk = m => !m.unread && m.availGB >= minFree && (m.commitPct == null || m.commitPct < maxCommit) &&
  (m.sysFreeGB == null || m.sysFreeGB >= minSysFree);
const fmt = m => `available RAM ${m.availGB.toFixed(1)} GB (need ${minFree}), commit ${m.commitPct == null ? '?' : m.commitPct.toFixed(0) + '%'} (limit ${maxCommit}%), ` +
  `system drive free ${m.sysFreeGB == null ? '?' : m.sysFreeGB.toFixed(1) + ' GB'} (need ${minSysFree})` + (m.unread ? ` [${m.unread}: waiting]` : '');

function slotsOf(c) {
  const d = join(ROOT, c); if (!existsSync(d)) return [];
  return readdirSync(d).filter(n => !n.includes('.dead-')).map(n => { let o = {}; try { o = JSON.parse(readFileSync(join(d, n, 'owner.json'), 'utf8')); } catch {} return { n, dir: join(d, n), ...o }; });
}
// (a slot dir with no owner.json yet may be one another process is taking this instant: left alone for 30 s)
const young = d => { try { return Date.now() - statSync(d).mtimeMs < 30000; } catch { return true; } };
const ownerOf = d => { try { return JSON.parse(readFileSync(join(d, 'owner.json'), 'utf8')); } catch { return {}; } };
const stale = (o, d) => o.pid ? !alive(o.pid) : !young(d);
// A dead slot is first renamed aside (atomic), then its owner read again from the moved copy: if two cleaners read the
// same dead owner and the first already reclaimed it and a new job took the name, the second has moved a live claim,
// sees that, and puts it back instead of deleting it.
function reclaim(c) {
  for (const s of slotsOf(c)) {
    if (!stale(s, s.dir)) continue;
    const t = `${s.dir}.dead-${process.pid}-${Date.now()}`;
    try { renameSync(s.dir, t); } catch { continue; }
    if (!stale(ownerOf(t), t)) { try { renameSync(t, s.dir); } catch {} continue; }
    try { rmSync(t, { recursive: true, force: true }); } catch {}
  }
}
function tryTake(c, n) {
  mkdirSync(join(ROOT, c), { recursive: true }); reclaim(c);
  for (let i = 0; i < n; i++) {
    const dir = join(ROOT, c, String(i));
    try { mkdirSync(dir); } catch { continue; } // mkdir is atomic: EEXIST means taken
    writeFileSync(join(dir, 'owner.json'), JSON.stringify({ pid: process.pid, cwd: process.cwd(), cmd: cmd.join(' ').slice(0, 200), started: new Date().toISOString() }));
    return dir;
  }
  return null;
}

// Live slots of every class; the claim is made first and counted after, so two jobs can't both slip under the limit.
function liveTotal() {
  let dirs = []; try { dirs = readdirSync(ROOT).filter(d => d !== '_wait' && !d.endsWith('.json')); } catch {}
  return dirs.reduce((n, c) => { reclaim(c); return n + slotsOf(c).length; }, 0);
}

// A quiet window: one worktree measures on an otherwise idle machine. heavy.mjs --quiet <min> [--why text] from that
// worktree opens it (60 min at most; --quiet 0 ends it); every other worktree's new jobs wait until it ends.
const QUIET = join(ROOT, 'quiet.json');
const here = () => process.cwd().split(String.fromCharCode(92)).join("/").toLowerCase();
function quiet() {
  try { const q = JSON.parse(readFileSync(QUIET, 'utf8')); return Date.parse(q.until) > Date.now() ? q : null; } catch { return null; }
}
function playing() {
  if (!cfg.playLog) return false;
  try {
    const st = statSync(cfg.playLog); if (Date.now() - st.mtimeMs > 60e3 * num(cfg.playFreshMin, 10, 0)) return false;
    const fd = openSync(cfg.playLog, 'r'), n = Math.min(st.size, 8192), b = Buffer.alloc(n);
    try { readSync(fd, b, 0, n, st.size - n); } finally { closeSync(fd); }
    const last = b.toString('utf8').trimEnd().split('\n').pop();
    return !/"k":"(detached|watcher-start)"/.test(last);
  } catch { return false; }
}
// A job nested inside another lane's running job waits for a quiet window too (2026-11-26: 8 nested jobs ran through
// one, so its perf numbers came from a loaded PC); its parent keeps its slot meanwhile. Only the play check is skipped.
// The window's owner, in its worktree or any folder under it, runs.
const ownsQuiet = q => (here() + '/').startsWith(q.cwd.replace(/\/$/, '') + '/');
function held() {
  const q = quiet();
  if (q && !ownsQuiet(q)) return `quiet window for ${q.cwd} until ${q.until}${q.why ? ' (' + q.why + ')' : ''}`;
  if (inSlot) return '';
  if (playing()) return 'the user is playing on this PC';
  return '';
}
if (flag('--quiet')) {
  const min = num(opt('--quiet'), 0, 0, 60), q = quiet();
  if (q && !ownsQuiet(q)) { console.error(`[heavy] already a quiet window for ${q.cwd} until ${q.until}`); process.exit(75); }
  mkdirSync(ROOT, { recursive: true });
  if (min > 0) writeFileSync(QUIET, JSON.stringify({ cwd: here(), until: new Date(Date.now() + min * 60e3).toISOString(), why: opt('--why', '') }));
  else rmSync(QUIET, { force: true });
  console.log(min > 0 ? `[heavy] quiet for ${min} min; jobs already running still run (see --status)` : '[heavy] quiet window ended');
  process.exit(0);
}

// Turn order (fifo): is another live waiter ahead of this job? The worktree named by --first (4 h at most; --first off ends
// it) goes ahead of the rest; otherwise the one that has waited longest.
const FIRST = join(ROOT, 'first.json');
const norm = p => String(p || '').split(String.fromCharCode(92)).join('/').toLowerCase();
function firstCwd() { try { const q = JSON.parse(readFileSync(FIRST, 'utf8')); return Date.parse(q.until) > Date.now() ? q.cwd : ''; } catch { return ''; } }
function ahead() {
  if (!cfg.fifo || !maxTotal || inSlot) return null;
  const fc = firstCwd(), rank = w => (fc && (norm(w.cwd) + '/').startsWith(fc + '/') ? 0 : 1);
  let all = [];
  try { all = readdirSync(join(ROOT, '_wait')).map(n => { try { const f = join(ROOT, '_wait', n); return Date.now() - statSync(f).mtimeMs < 120000 ? JSON.parse(readFileSync(f, 'utf8')) : null; } catch { return null; } }).filter(w => w && w.pid && !w.inSlot && alive(w.pid)); } catch {}
  const me = all.find(w => w.pid === process.pid); if (!me) return null;
  // A waiter of another class whose own slots are all taken can't start, so it holds nobody back.
  const full = c => c !== cls && cfg.slots[c] && slotsOf(c).length >= cfg.slots[c];
  return all.find(w => w.pid !== me.pid && !full(w.cls) && (rank(w) - rank(me) || Date.parse(w.since) - Date.parse(me.since) || w.pid - me.pid) < 0) || null;
}
if (flag('--first')) {
  const v = opt('--first', 'off'); mkdirSync(ROOT, { recursive: true });
  if (v === 'off' || !v) rmSync(FIRST, { force: true }); else writeFileSync(FIRST, JSON.stringify({ cwd: norm(v).replace(/[/]$/, ""), until: new Date(Date.now() + 4 * 3600e3).toISOString() }));
  console.log(v === 'off' || !v ? '[heavy] no worktree goes first' : `[heavy] ${v} goes first for 4 h`); process.exit(0);
}

if (flag('--status')) {
  console.log(fmt(memory())); if (held()) console.log('held: ' + held());
  for (const c of Object.keys(cfg.slots)) { reclaim(c); const s = slotsOf(c); console.log(`${c}: ${s.length}/${cfg.slots[c]} in use` + s.map(x => `\n  pid ${x.pid} since ${x.started} in ${x.cwd}: ${x.cmd}`).join('')); }
  // Queued jobs. Records of dead or stale waiters (untouched 2 min: a live waiter touches its record every 5-15 s, so a
  // reused pid can't keep one alive) are removed.
  const wd = join(ROOT, '_wait'), q = [];
  try { for (const n of readdirSync(wd)) { const f = join(wd, n); let o = null; try { o = Date.now() - statSync(f).mtimeMs < 120000 ? JSON.parse(readFileSync(f, 'utf8')) : null; } catch {} if (o && o.pid && alive(o.pid)) q.push(o); else rmSync(f, { force: true }); } } catch {}
  console.log(`queued: ${q.length}` + q.map(w => `\n  pid ${w.pid} ${w.cls} since ${w.since} in ${w.cwd}: ${w.cmd}`).join(''));
  process.exit(0);
}

let t0 = Date.now(); let said = '';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let slot = null;
// [wait-record] (2026-11-22) a job waiting at the gate leaves a record that audit.mjs shows as QUEUED, so a job
// queued here while the other PC has a free seat is seen at once. Removed when the slot is taken or the job exits.
const WAITF = join(ROOT, '_wait', `${process.pid}.json`);
const unwait = () => { try { rmSync(WAITF, { force: true }); } catch {} };
if (cmd.length && !flag('--wait-free')) { try { mkdirSync(join(ROOT, '_wait'), { recursive: true }); writeFileSync(WAITF, JSON.stringify({ pid: process.pid, cls, cwd: process.cwd(), cmd: cmd.join(' ').slice(0, 200), inSlot, since: new Date().toISOString() })); } catch {} process.on('exit', unwait); }
for (;;) {
  const m = memory(), hold = held();
  if (hold) {
    if (hold !== said) { console.error(`[heavy] waiting: ${hold}`); said = hold; }
  } else if (memOk(m)) {
    if (flag('--wait-free') || !cmd.length) { console.error(`[heavy] ok: ${fmt(m)}`); process.exit(0); }
    const next = ahead();
    if (next) {
      const msg = `[heavy] waiting its turn (${next.cwd} is ahead)`; if (msg !== said) { console.error(msg); said = msg; }
    } else {
    slot = tryTake(cls, nSlots);
    if (slot && (!maxTotal || inSlot || liveTotal() <= maxTotal)) break;
    const full = !!slot;
    if (slot) { try { rmSync(slot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {} slot = null; await sleep(Math.random() * 3000); }
    const msg = full ? `[heavy] waiting for another heavy job to end (${maxTotal} at a time on this machine)` : `[heavy] waiting for a free "${cls}" slot (${nSlots} machine-wide)`; if (msg !== said) { console.error(msg); said = msg; }
    }
  } else {
    const msg = `[heavy] waiting for memory: ${fmt(m)}`; if (msg.split('(')[0] !== said.split('(')[0]) { console.error(msg); said = msg; }
  }
  if (hold) t0 += 15000; // time held isn't waiting
  if (Date.now() - t0 > maxWaitMs) { console.error(`[heavy] gave up after ${Math.round(maxWaitMs / 60e3)} min. Write a handoff and end, or retry later.`); process.exit(75); }
  // (the waiter's record touched every poll: ahead() skips records untouched for 2 min. A record left by a job that died
  //  without its exit handler kept the head of the queue whenever its pid was reused - pc2 2026-11-26: pid 4284 from 06:14,
  //  reused by a Logitech service after a reboot, held every heavy job on the machine for hours)
  try { utimesSync(WAITF, new Date(), new Date()); } catch {}
  await sleep(!hold && memOk(m) ? 5000 : 15000); // slot waits re-check fast; memory waits slowly (the check itself costs a PowerShell call)
}
unwait();
const waited = Math.round((Date.now() - t0) / 1000);
if (waited > 5) console.error(`[heavy] started after ${waited}s`);
const release = () => { try { rmSync(slot, { recursive: true, force: true }); } catch {} };
const q = a => (/[\s"&|<>^]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
const env = { ...process.env, HEAVY_IN_SLOT: String(process.pid) };
// A test's heap leak fails fast at 4 GB instead of growing the tree to the cap (unless the caller chose its own size).
if (cls === 'test' && !/--max-old-space-size/.test(env.NODE_OPTIONS || '')) env.NODE_OPTIONS = `${env.NODE_OPTIONS || ''} --max-old-space-size=4096`.trim();
const child = spawn(cmd.map(q).join(' '), { stdio: 'inherit', shell: true, windowsHide: true, env });
let killed = false, peak = 0;
const sampler = memCap > 0 && child.pid ? startSampler({ intervalMs: 2000, onSample({ procs }) {
  if (killed) return;
  const tree = descendants(procs, child.pid), bytes = treeBytes(procs, tree);
  peak = Math.max(peak, bytes);
  if (bytes <= memCap * GB) return;
  killed = true;
  const gb = +(bytes / GB).toFixed(1);
  console.error(`[heavy] KILLED ${cls} job: tree ${gb} GB > cap ${memCap} GB (${process.cwd()})`);
  console.error(`[heavy] your job leaked: find and fix the leak before rerunning (kills.log has the record)`);
  logKill({ by: 'heavy', class: cls, pid: child.pid, gb, capGB: memCap, cwd: process.cwd(), cmd: cmd.join(' ').slice(0, 300), why: 'tree over cap' });
  killPids(tree); release(); process.exit(137);
}, onError: e => console.error(`[heavy] memory watch: ${e.message}`) }) : { stop() {} };
process.on('exit', () => sampler.stop());
for (const s of ['SIGINT', 'SIGTERM', 'SIGBREAK']) process.on(s, () => { try { child.kill(); } catch {} release(); process.exit(130); });
// Agents' jobs give way to the user's own programs (children inherit it). A quiet window's owner runs at normal.
try { if (!quiet() && process.env.HEAVY_PRIO !== 'normal') os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch {}
child.on('exit', code => {
  if (killed) return;
  if (memCap > 0 && peak > memCap * GB / 2) console.error(`[heavy] peak tree ${(peak / GB).toFixed(1)} GB (cap ${memCap} GB)`);
  release(); process.exit(code ?? 1);
});
child.on('error', e => { console.error(`[heavy] ${e.message}`); release(); process.exit(1); });
