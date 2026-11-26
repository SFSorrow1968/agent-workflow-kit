#!/usr/bin/env node
// One-line machine audit per machine, for the MACHINES line of every lane message to the Lead.

//
//   node ~/.agents/tools/machine/audit.mjs           this machine, then the config's other machines over ssh
//   node ~/.agents/tools/machine/audit.mjs --local   this machine only
//
// Reads heavy.mjs's slot folders (running jobs) and its _wait records (jobs queued at the gate), with ages and the
// worktree each runs from, plus free RAM and the memory kills of the last 24 h (kills.log). Read-only apart from dropping stale queue records.
import { readFileSync, readdirSync, existsSync, rmSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import { KILLS_LOG } from './proctree.mjs';
import { machines, selfMachine } from './profile.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(process.env.LOCALAPPDATA || os.tmpdir(), 'AgentSlots');
const DEF = { test: 2, browser: 2, build: 1, blender: 1, render: 1, any: 3 };
let slots = DEF;
try { const b = JSON.parse(readFileSync(join(HERE, 'budget.json'), 'utf8')); slots = { ...DEF, ...(b.slots || {}) }; } catch {}
const alive = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const read = f => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };
const age = iso => { const m = Math.round((Date.now() - Date.parse(iso)) / 60e3); return Number.isFinite(m) ? `${m}m` : '?'; };
// A seat held past its class's limit, or a job queued 10+ min, is flagged LONG.
// Its owner explains or stops it.
const LONG = { test: 25, browser: 30, build: 15, blender: 45, render: 45, any: 30 };
const mins = iso => (Date.now() - Date.parse(iso)) / 60e3;
const where = cwd => basename(cwd || '?').replace(/^t3-/, '').replace(/-[0-9a-f]{12,}$/, '');

// Memory kills by heavy.mjs (a job past its cap) and guard.mjs (2026-11-25), last 24 h: time, pid, GB, worktree.
// A kill line means that job leaked: its owner fixes the leak before rerunning.
function kills() {
  let lines = []; try { lines = readFileSync(KILLS_LOG, 'utf8').trim().split(/\r?\n/); } catch {}
  const recent = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(k => k && Date.now() - Date.parse(k.at) < 864e5);
  if (!recent.length) return 'kills 0 (24h)';
  const t = iso => new Date(iso).toTimeString().slice(0, 5);
  return `KILLS ${recent.length} (24h): ` + recent.slice(-3).reverse().map(k => `${t(k.at)} ${k.by} pid ${k.pid} ${k.gb} GB ${where(k.cwd || k.cmd)}`).join(', ');
}

function local() {
  const parts = [`${os.hostname()}: RAM ${(os.freemem() / 2 ** 30).toFixed(1)} GB free`];
  for (const c of Object.keys(slots)) {
    const d = join(ROOT, c);
    const run = existsSync(d) ? readdirSync(d).map(n => read(join(d, n, 'owner.json'))).filter(o => o?.pid && alive(o.pid)) : [];
    parts.push(`${c} ${run.length}/${slots[c]}` + (run.length ? ` (${run.map(o => `${where(o.cwd)} ${age(o.started)}${mins(o.started) > (LONG[c] ?? 30) ? ' LONG' : ''}`).join(', ')})` : ''));
  }
  const wd = join(ROOT, '_wait');
  const wait = existsSync(wd) ? readdirSync(wd).map(n => ({ f: join(wd, n), o: read(join(wd, n)) })) : [];
  const q = [];
  // (a live waiter touches its record every 5-15 s; one untouched for 2 min is stale even if its pid was reused)
  for (const { f, o } of wait) { let fresh = false; try { fresh = Date.now() - statSync(f).mtimeMs < 120000; } catch {} if (o?.pid && alive(o.pid) && fresh) q.push(o); else try { rmSync(f, { force: true }); } catch {} }
  parts.push(q.length ? `QUEUED ${q.map(o => `${o.cls} ${where(o.cwd)} ${age(o.since)}${mins(o.since) > 10 ? ' LONG' : ''}`).join(', ')}` : 'queued 0');
  parts.push(kills());
  return parts.join(' | ');
}

console.log(local());
if (!process.argv.includes('--local')) {
  // The config's other machines, over ssh (each runs its own installed audit with its own budget.json).
  const self = selfMachine();
  const others = machines().filter(m => m !== self && m.ssh);
  for (const m of others) {
    const o = m.ssh, script = `${(m.agentsDir || '%USERPROFILE%/.agents').replace(/[\\/]$/, '')}/tools/machine/audit.mjs`;
    const r = spawnSync('ssh', ['-o', 'ConnectTimeout=8', '-o', 'LogLevel=ERROR', o, `node "${script}" --local`], { encoding: 'utf8', timeout: 30000, windowsHide: true });
    const line = (r.stdout || '').split(/\r?\n/).find(l => /RAM .* free/.test(l));
    console.log(line || `${o}: unreachable (${(r.stderr || r.error?.message || 'no answer').trim().split(/\r?\n/).pop()})`);
  }
}
