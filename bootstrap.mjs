#!/usr/bin/env node
// Sets up the kit by asking a few questions.
//   node bootstrap.mjs            first time: set up this machine, then (optionally) a project
//   node bootstrap.mjs machine    redo the machine questions, then install
//   node bootstrap.mjs project    set up a project folder (new or existing)
//   --answers <file.json>         take the answers from a file instead of asking (keys: the ids below)
// The answers live in ~/.agents/kit/config.json (machine) and the project's own files. Existing files are never
// overwritten: they are listed as skipped.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import readline from 'node:readline/promises';
import os from 'node:os';

const KIT = dirname(fileURLToPath(import.meta.url));
const CFG_DIR = process.env.AGENT_KIT_DIR || join(os.homedir(), '.agents', 'kit'), CFG_FILE = join(CFG_DIR, 'config.json');
const args = process.argv.slice(2), mode = args.find(a => !a.startsWith('--') && a !== args[args.indexOf('--answers') + 1]) || 'first';
const preset = args.includes('--answers') ? JSON.parse(readFileSync(args[args.indexOf('--answers') + 1], 'utf8')) : null;
const rl = preset ? null : readline.createInterface({ input: process.stdin, output: process.stdout });

async function ask(id, q, def = '') {
  if (preset) return String(preset[id] ?? def);
  const a = (await rl.question(`${q}${def ? ` [${def}]` : ''}: `)).trim();
  return a || def;
}
const yes = s => /^y(es)?$/i.test(s);
const list = s => s.split(/[;,]/).map(x => x.trim()).filter(Boolean);
const readCfg = () => { try { return JSON.parse(readFileSync(CFG_FILE, 'utf8')); } catch { return {}; } };

async function machine() {
  const old = readCfg();
  console.log('\n== This machine (answers go to ' + CFG_FILE + ')');
  const model = await ask('model', 'Main Claude model the agents use', old.model || 'Claude Opus');
  const t3 = yes(await ask('t3', 'Do you run agents in T3 Code (visible threads)? y/n', old.t3 ? 'y' : 'n'));
  const reviewer = await ask('reviewer', 'Second model for read-only code reviews (e.g. Codex), or none', old.reviewer || 'none');
  const accounts = Math.max(1, parseInt(await ask('accounts', 'How many Claude accounts do the agents share?', String(old.accounts || 1)), 10) || 1);
  console.log('Other machines the agents may use over ssh, as name=sshAlias pairs, comma separated (blank: just this one).');
  const others = list(await ask('machines', 'Other machines', (old.machines || []).filter(m => m.ssh).map(m => `${m.name}=${m.ssh}`).join(', ')));
  const host = os.hostname();
  const machines = [{ name: await ask('thisName', 'A short name for this machine', old.machines?.find(m => !m.ssh)?.name || host.toLowerCase()),
    ssh: null, hostnameRe: `^${host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$` },
    ...others.map(p => { const [name, ssh] = p.split('=').map(x => x.trim()); return { name, ssh: ssh || name, hostnameRe: `^${name}$` }; })];
  const notify = await ask('notify', 'How should agents send you progress (a command, e.g. a chat bot script), or none', old.notify || 'none');
  const cfg = { ...old, model, t3, reviewer: /^none$/i.test(reviewer) ? null : reviewer, accounts, machines,
    notify: /^none$/i.test(notify) ? null : notify };
  mkdirSync(CFG_DIR, { recursive: true }); writeFileSync(CFG_FILE, JSON.stringify(cfg, null, 2) + '\n');
  console.log('saved ' + CFG_FILE + '\n\n== Installing');
  const r = spawnSync(process.execPath, [join(KIT, 'install.mjs')], { stdio: 'inherit' });
  if (r.status) process.exit(r.status);
  if (machines.length > 1) console.log(`\nOn each other machine: clone this kit, run \`node bootstrap.mjs machine\` with the same answers, and make sure \`ssh <alias> node -v\` works from here.`);
}

const fill = (s, v) => s.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in v ? v[k] : m));
function writeTree(src, dst, v, out) {
  for (const f of readdirSync(src)) {
    const s = join(src, f), d = join(dst, f);
    if (statSync(s).isDirectory()) { writeTree(s, d, v, out); continue; }
    if (existsSync(d)) { out.skipped.push(d); continue; }
    mkdirSync(dirname(d), { recursive: true }); writeFileSync(d, fill(readFileSync(s, 'utf8'), v)); out.wrote.push(d);
  }
}

async function project() {
  const cfg = readCfg();
  console.log('\n== A project (new or existing folder)');
  const dir = resolve(await ask('dir', 'Project folder', process.cwd()));
  const name = await ask('name', 'Project name', basename(dir));
  const what = await ask('what', 'In one sentence, what is it?', 'A software project.');
  const stack = await ask('stack', 'Language, engine or framework', 'not decided yet');
  const test = await ask('test', 'Command that runs the tests (blank if none yet)', '') || '(none yet: the first lane writes one)';
  const build = await ask('build', 'Command that builds it (blank if none)', '') || '(none)';
  const run = await ask('run', 'How to run it to check a change (a command or URL)', '') || '(not set yet)';
  const names = (cfg.machines || []).map(m => m.name);
  const machines = names.length > 1 ? await ask('projectMachines', `Machines this project may use (${names.join(', ')})`, names.join(', ')) : 'this machine';
  const style = await ask('style', 'Your taste for it in a line or two (look, feel, tone), or blank', '') || '(not written yet: add the user\'s taste rules as they come)';
  const goals = list(await ask('goals', 'First goals, separated by semicolons', 'Get it running end to end'));
  const date = new Date().toISOString().slice(0, 10);
  const v = { NAME: name, WHAT: /[.!?]$/.test(what) ? what : what + '.', STACK: stack, DIR: dir.replace(/\\/g, '/'), TEST: test, BUILD: build, RUN: run,
    MACHINES: machines, STYLE: style, DATE: date, QUEUE: goals.map((_, i) => `G${i + 1}`).join(', '),
    GOALS: goals.map((g, i) => `## G${i + 1}. ${g}\n- Done: (a measurable bar: what a test, script or the user sees)\n- State: not started (added ${date})`).join('\n\n') };
  const out = { wrote: [], skipped: [] };
  mkdirSync(dir, { recursive: true });
  writeTree(join(KIT, 'templates', 'project'), dir, v, out);
  if (!existsSync(join(dir, '.git'))) {
    const g = spawnSync('git', ['init', '-b', 'main'], { cwd: dir, encoding: 'utf8' });
    console.log(g.status === 0 ? 'git: new repo on main' : 'git init failed: ' + (g.stderr || g.error?.message));
  }
  for (const f of out.wrote) console.log('wrote   ' + f);
  for (const f of out.skipped) console.log('skipped ' + f + ' (exists)');
  console.log(`\nNext: open ${dir} in ${cfg.t3 ? 'T3 Code and start a thread titled "Lead"' : 'Claude Code'} and say:\n` +
    `  "You are the Lead. Read CLAUDE.md and docs/goals.md, fill in each goal's Done bar, start the Merge lane, then staff G1."`);
}

if (mode === 'machine') await machine();
else if (mode === 'project') await project();
else {
  if (!existsSync(CFG_FILE)) await machine(); else console.log('this machine is set up (' + CFG_FILE + '); `node bootstrap.mjs machine` to redo it');
  if (yes(await ask('newProject', '\nSet up a project now? y/n', 'y'))) await project();
}
rl?.close();
