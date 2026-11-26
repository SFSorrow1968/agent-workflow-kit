#!/usr/bin/env node
// Skill triggers for every Claude account on this machine (set up 2026-11-13 at the user's request:
// "how do agents know when to use skills ... for all skills").
// One hook for SessionStart, UserPromptSubmit, PreToolUse and Stop. Rules: triggers.json beside this file.
// - Reminds the agent to open a relevant skill (only skills that exist in this session), at most twice
//   per context, never after the agent opened it with the Skill tool.
// - Skills come from Skill-tool dirs (.claude/skills) and from file skills in <repo>/.agents/skills (shared with Codex
//   through AGENTS.md): a file skill's reminder says to read its SKILL.md, and that Read opens it.
// - Stop: blocks once if heavy processes this session started are still running (resource-optimizer),
//   or a LESSONS.md was edited without method-check.
// It must never break a session: every failure exits 0 silently.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, statSync, unlinkSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import os from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const MAX_REMINDERS = 2;

function main() {
  let input = {};
  try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { return; }
  const cfg = JSON.parse(readFileSync(join(HERE, 'triggers.json'), 'utf8'));
  const event = input.hook_event_name || '';
  const sid = String(input.session_id || 'none').replace(/[^\w.-]/g, '_');
  const stateDir = join(process.env.LOCALAPPDATA || os.tmpdir(), 'skill-triggers', 'state');
  mkdirSync(stateDir, { recursive: true });
  const stateFile = join(stateDir, sid + '.json');
  let st = { opened: {}, reminded: {}, edits: [] };
  try { st = { ...st, ...JSON.parse(readFileSync(stateFile, 'utf8')) }; } catch {}
  const save = () => { try { writeFileSync(stateFile, JSON.stringify(st)); } catch {} };

  const have = availableSkills(input.cwd || process.cwd());
  const pick = (kind, text) => {
    const out = [];
    for (const r of cfg.rules) {
      if (r.kind !== kind) continue;
      if (r.re && !(text && new RegExp(r.re, 'i').test(text))) continue;
      for (const s of r.skills) if (have.has(s) && !st.opened[s] && (st.reminded[s] || 0) < MAX_REMINDERS && !out.some(o => o.s === s)) out.push({ s, why: r.why });
    }
    return out;
  };
  const say = (hookEventName, hits, lead) => {
    if (!hits.length) return;
    for (const h of hits) st.reminded[h.s] = (st.reminded[h.s] || 0) + 1;
    const tools = hits.filter(h => !have.get(h.s)), files = hits.filter(h => have.get(h.s));
    let text = lead;
    if (tools.length) text += `\n${tools.map(h => `- \`${h.s}\` (${h.why})`).join('\n')}\nOpen each with the Skill tool unless you already follow it in this context.`;
    if (files.length) text += `\n${files.map(h => `- read \`${have.get(h.s)}\` (${h.why})`).join('\n')}\nThese are file skills, not Skill-tool skills: read each with the Read tool unless you already follow it in this context.`;
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName, additionalContext: text } }));
  };

  if (event === 'SessionStart') {
    const src = input.source || 'startup';
    if (src === 'compact' || src === 'clear') st = { opened: {}, reminded: {}, edits: [] };
    const hits = pick(src === 'compact' ? 'compact' : 'start', '');
    say('SessionStart', hits, src === 'compact' ? 'Skill reminder (context was summarized):' : 'Skill reminder (session start):');
    prune(stateDir);
  } else if (event === 'UserPromptSubmit') {
    say('UserPromptSubmit', pick('prompt', ownWords(String(input.prompt || ''))).slice(0, cfg.maxPerPrompt || 3), 'Skill reminder (this request matches):');
  } else if (event === 'PreToolUse') {
    const tool = input.tool_name || '';
    const ti = input.tool_input || {};
    if (tool === 'Skill' && ti.skill) { st.opened[String(ti.skill).split(/[:/]/).pop()] = 1; save(); return; }
    // Reading a file skill's SKILL.md counts as opening it.
    // (The whole path must match, ignoring case: a same-named copy elsewhere doesn't count.)
    if (tool === 'Read' && ti.file_path) { const rp = String(ti.file_path).replace(/\\/g, '/').toLowerCase(); for (const [n, p] of have) if (p && p.toLowerCase() === rp) { st.opened[n] = 1; save(); break; } }
    let hits = pick('tool', tool);
    // Match the command itself, not text it writes: drop heredoc bodies and PowerShell here-strings.
    if (/^(Bash|PowerShell)$/.test(tool)) hits = hits.concat(pick('bash', String(ti.command || '')
      .replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2\s*(?=\n|$)/g, '<<heredoc')
      .replace(/@(['"])\r?\n[\s\S]*?\r?\n\1@/g, '@here@')));
    const fp = ti.file_path || ti.notebook_path;
    if (/^(Edit|Write|NotebookEdit|MultiEdit)$/.test(tool) && fp) {
      hits = hits.concat(pick('edit', String(fp)));
      if (/LESSONS\.md$/i.test(fp) && !st.edits.includes('LESSONS')) st.edits.push('LESSONS');
    }
    const seen = new Set(); hits = hits.filter(h => !seen.has(h.s) && seen.add(h.s));
    say('PreToolUse', hits, 'Skill reminder (before this tool call):');
  } else if (event === 'Stop') {
    if (input.stop_hook_active) return;
    const reasons = [];
    const left = leftovers(cfg.stop);
    if (left.length && have.has('resource-optimizer')) reasons.push(`These processes started in this session are still running:\n${left.slice(0, 12).map(p => `  - pid ${p.pid} ${p.name}: ${p.cmd.slice(0, 160)}`).join('\n')}\nFollow \`resource-optimizer\`: stop the ones no longer needed (Stop-Process -Id <pid>), or say in one line why each must keep running.`);
    if (st.edits.includes('LESSONS') && have.has('method-check') && !st.opened['method-check']) reasons.push(`You edited a LESSONS.md this session: ${have.get('method-check') ? `read \`${have.get('method-check')}\`` : 'open `method-check`'} and fold lessons into skills if it is due.`);
    if (reasons.length) {
      if (st.edits.includes('LESSONS')) st.opened['method-check'] = 1; // ask once
      process.stdout.write(JSON.stringify({ decision: 'block', reason: 'Before ending (skill-triggers hook):\n' + reasons.join('\n\n') }));
    }
  }
  save();
}

// Only the user's own words: drop quoted assistant text, pasted material and quote lines, but keep the
// user's comments on citations (2026-11-13: a quoted reply fired 9 reminders).
function ownWords(p) {
  const comments = [...p.matchAll(/"comment":\s*"((?:[^"\\]|\\.)*)"/g)].map(m => m[1]);
  p = p.replace(/<assistant_citations>[\s\S]*?<\/assistant_citations>/g, ' ')
    .replace(/<pasted_content[\s\S]*?<\/pasted_content[^>]*>/g, ' ')
    .replace(/\[assistant-quote-\d+\]/g, ' ')
    .replace(/^>.*$/gm, ' ');
  return (p + ' ' + comments.join(' ')).slice(0, 4000);
}

function availableSkills(cwd) {
  const dirs = new Set();
  const home = os.homedir();
  if (process.env.CLAUDE_CONFIG_DIR) dirs.add(join(process.env.CLAUDE_CONFIG_DIR, 'skills'));
  dirs.add(join(home, '.claude', 'skills'));
  let d = cwd;
  const fileDirs = new Set();   // <repo>/.agents/skills: file skills shared with Codex through AGENTS.md
  for (let i = 0; i < 12 && d; i++) { dirs.add(join(d, '.claude', 'skills')); fileDirs.add(join(d, '.agents', 'skills')); const p = dirname(d); if (p === d) break; d = p; }
  // A git worktree may lack .claude/skills (T3 worktrees); Claude Code still loads the main checkout's.
  try {
    const g = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd, encoding: 'utf8', timeout: 3000 });
    const common = (g.stdout || '').trim();
    if (common) { dirs.add(join(dirname(common), '.claude', 'skills')); fileDirs.add(join(dirname(common), '.agents', 'skills')); }
  } catch {}
  // name -> null for a Skill-tool skill, or the SKILL.md path to read for a file skill. A Skill-tool skill of the same name wins.
  // (~/.agents/skills is never a file-skill dir: the home dir is skipped, those are installed copies of Skill-tool skills.)
  const names = new Map();
  for (const dir of dirs) { try { for (const n of readdirSync(dir)) if (existsSync(join(dir, n, 'SKILL.md'))) names.set(n, null); } catch {} }
  const homeAgents = join(home, '.agents', 'skills').toLowerCase();
  for (const dir of fileDirs) { if (dir.toLowerCase() === homeAgents) continue; try { for (const n of readdirSync(dir)) { const p = join(dir, n, 'SKILL.md'); if (!names.has(n) && existsSync(p)) names.set(n, p.replace(/\\/g, '/')); } } catch {} }
  return names;
}

function leftovers(stopCfg) {
  if (process.platform !== 'win32') return [];
  const r = spawnSync('powershell', ['-NoProfile', '-Command', 'Get-CimInstance Win32_Process | select ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress'], { encoding: 'utf8', timeout: 12000, maxBuffer: 64 << 20 });
  let procs; try { procs = JSON.parse(r.stdout); } catch { return []; }
  const by = new Map(procs.map(p => [p.ProcessId, p]));
  // Climb from this hook to the agent session's process (claude.exe, or node running claude).
  const chain = new Set(); let cur = by.get(process.pid) || { ParentProcessId: process.ppid }; let root = null;
  for (let i = 0; i < 12 && cur; i++) {
    chain.add(cur.ProcessId);
    const nm = (cur.Name || '').toLowerCase(), cl = (cur.CommandLine || '').toLowerCase();
    if (nm === 'claude.exe' || (nm === 'node.exe' && /claude/.test(cl) && !/skill-triggers/.test(cl))) { root = cur.ProcessId; break; }
    cur = by.get(cur.ParentProcessId);
  }
  if (!root) return [];
  const kids = new Map(); for (const p of procs) { if (!kids.has(p.ParentProcessId)) kids.set(p.ParentProcessId, []); kids.get(p.ParentProcessId).push(p); }
  const heavy = new RegExp(`^(${stopCfg.heavyProcess})(\\.exe)?$`, 'i'), nodeCmd = new RegExp(stopCfg.heavyNodeCmd, 'i'), ignore = new RegExp(stopCfg.ignoreCmd, 'i');
  const out = [], stack = [...(kids.get(root) || [])], seen = new Set();
  while (stack.length) {
    const p = stack.pop(); if (seen.has(p.ProcessId)) continue; seen.add(p.ProcessId);
    stack.push(...(kids.get(p.ProcessId) || []));
    if (chain.has(p.ProcessId)) continue;
    const cmd = p.CommandLine || '', nm = p.Name || '';
    if (ignore.test(cmd)) continue;
    const isHeavy = heavy.test(nm) || (/^node(\.exe)?$/i.test(nm) && nodeCmd.test(cmd));
    // Report only the top heavy process of a tree (Chrome spawns many renderers).
    if (isHeavy && !(out.some(o => o.pid === p.ParentProcessId))) out.push({ pid: p.ProcessId, name: nm, cmd });
  }
  return out.filter(o => !out.some(x => x.pid === (by.get(o.pid) || {}).ParentProcessId));
}

function prune(dir) {
  try { const cut = Date.now() - 7 * 864e5; for (const n of readdirSync(dir)) { const f = join(dir, n); if (statSync(f).mtimeMs < cut) unlinkSync(f); } } catch {}
}

try { main(); } catch { /* never break a session */ }
process.exit(0);
