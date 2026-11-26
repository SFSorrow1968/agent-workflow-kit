#!/usr/bin/env node
// Installs the kit on this machine. Run again after every `git pull`; it changes only what differs.
//   node install.mjs          install
//   node install.mjs --dry    print what it would write, write nothing
// 1. skills/* -> <claude dir>/skills for ~/.claude, CLAUDE_CONFIG_DIR and the config's extra claudeDirs.
// 2. templates/CLAUDE.global.md (with "Your setup" from ~/.agents/kit/config.json) -> between the kit's markers in
//    each <claude dir>/CLAUDE.md. Anything outside the markers is the user's and is kept.
// 3. tools/machine -> ~/.agents/tools/machine (budget.json there is never touched);
//    tools/skill-triggers + skills/triggers.json -> ~/.agents/skill-triggers.
// 4. Registers the skill-trigger hook (and, with T3 Code, the send-mode hook) in each <claude dir>/settings.json.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const KIT = dirname(fileURLToPath(import.meta.url)), HOME = os.homedir(), DRY = process.argv.includes('--dry');
const AGENTS = join(HOME, '.agents'), CFG_FILE = join(process.env.AGENT_KIT_DIR || join(AGENTS, 'kit'), 'config.json');
const fwd = p => p.replace(/\\/g, '/');
let cfg = {}; try { cfg = JSON.parse(readFileSync(CFG_FILE, 'utf8')); } catch {}
let wrote = 0, kept = 0;
function put(dst, data) {
  if (existsSync(dst) && readFileSync(dst).equals(Buffer.from(data))) { kept++; return; }
  wrote++; console.log((DRY ? 'would write ' : 'wrote ') + dst);
  if (!DRY) { mkdirSync(dirname(dst), { recursive: true }); writeFileSync(dst, data); }
}
const copyDir = (src, dst, skip = () => false) => { for (const f of readdirSync(src)) {
  const s = join(src, f); if (skip(f)) continue;
  if (statSync(s).isDirectory()) copyDir(s, join(dst, f), skip); else put(join(dst, f), readFileSync(s));
} };

// The Claude config folders to install into.
const seen = new Set();
const claudeDirs = [join(HOME, '.claude'), process.env.CLAUDE_CONFIG_DIR, ...(cfg.claudeDirs || [])].filter(Boolean)
  .filter(d => { const k = fwd(d).replace(/\/$/, '').toLowerCase(); return !seen.has(k) && seen.add(k); });

// 1. Skills
for (const d of claudeDirs) for (const s of readdirSync(join(KIT, 'skills')))
  if (existsSync(join(KIT, 'skills', s, 'SKILL.md'))) copyDir(join(KIT, 'skills', s), join(d, 'skills', s));

// 2. Global CLAUDE.md block
function setup() {
  const L = [];
  L.push(`- Main model: ${cfg.model || 'the Claude Code default'}, medium effort for most work.`);
  L.push(cfg.reviewer ? `- Read-only reviewer: ${cfg.reviewer} (\`codex-review\`).` : '- No second-model reviewer: land on tests and gates.');
  L.push(cfg.t3 ? '- T3 Code runs the threads: lanes are top-level threads (`t3_thread_launch`), messages `t3_thread_send` mode steer.'
               : '- Plain Claude Code: each lane is its own session in its own worktree; it reports through its handoff file and docs/status.md.');
  L.push(cfg.accounts > 1 ? `- ${cfg.accounts} Claude accounts: fill the one whose week resets soonest; on a usage limit move the thread to the next one at once.` : '- One Claude account.');
  const m = cfg.machines || [];
  L.push(m.length > 1 ? `- Machines (\`~/.agents/kit/config.json\`): ${m.map(x => `${x.name}${x.ssh ? ` (ssh ${x.ssh})` : ' (this one)'}${x.note ? ': ' + x.note : ''}`).join('; ')}.`
                      : '- One machine (this one).');
  if (cfg.notify) L.push(`- Progress for the user: ${cfg.notify}.`);
  for (const r of cfg.rules || []) L.push(`- ${r}`);
  return L.join('\n');
}
const START = '<!-- agent-workflow-kit:start -->', END = '<!-- agent-workflow-kit:end -->';
const block = `${START}\n${readFileSync(join(KIT, 'templates', 'CLAUDE.global.md'), 'utf8').replace('{{SETUP}}', setup()).trim()}\n${END}\n`;
for (const d of claudeDirs) {
  const f = join(d, 'CLAUDE.md'); let cur = ''; try { cur = readFileSync(f, 'utf8'); } catch {}
  const i = cur.indexOf(START), j = cur.indexOf(END);
  const next = i >= 0 && j > i ? cur.slice(0, i) + block + cur.slice(j + END.length).replace(/^\r?\n/, '') : (cur ? cur.trimEnd() + '\n\n' : '') + block;
  put(f, next);
}

// 3. Tools
copyDir(join(KIT, 'tools', 'machine'), join(AGENTS, 'tools', 'machine'), f => f === 'budget.json');
copyDir(join(KIT, 'tools', 'skill-triggers'), join(AGENTS, 'skill-triggers'));
put(join(AGENTS, 'skill-triggers', 'triggers.json'), readFileSync(join(KIT, 'skills', 'triggers.json')));

// 4. Hooks
const node = fwd(process.execPath), cmd = f => `"${node}" "${fwd(join(AGENTS, 'skill-triggers', f))}"`;
for (const d of claudeDirs) {
  const f = join(d, 'settings.json'); let s = {};
  try { s = JSON.parse(readFileSync(f, 'utf8')); } catch (e) { if (existsSync(f)) { console.error(`skip ${f}: not valid JSON`); continue; } }
  s.hooks ||= {};
  const add = (ev, file, timeout, matcher) => {
    const list = (s.hooks[ev] ||= []);
    if (JSON.stringify(list).includes(`skill-triggers/${file}`)) return;
    list.push({ ...(matcher ? { matcher } : {}), hooks: [{ type: 'command', command: cmd(file), timeout }] });
  };
  for (const ev of ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'Stop']) add(ev, 'hook.mjs', 15);
  if (cfg.t3) for (const ev of ['PreToolUse', 'PostToolUse']) add(ev, 'sendmode.mjs', 60, 'mcp__t3-code__t3_thread_send');
  put(f, JSON.stringify(s, null, 2) + '\n');
}
console.log(`${DRY ? 'dry run: ' : ''}${wrote} written, ${kept} unchanged (${claudeDirs.length} Claude folder(s))`);
