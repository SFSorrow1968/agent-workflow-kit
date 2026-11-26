#!/usr/bin/env node
// Sets the mode of every t3_thread_send (T3 Code only): a message to a running thread steers it instead of queueing
// behind its long job. Its own hook, not part of hook.mjs: that one
// has 5 s and timed out on a loaded PC. Installed by install.mjs on the tool's own matcher, 60 s.
// PreToolUse: `auto` queues on a running thread, so the target's runs decide: running -> steer, not running -> auto, never queue.
//   Threads of another machine (or T3's database unreadable): steer first; auto only within 3 minutes of a steer to that thread
//   (the refused one). `restart` is left alone.
// PostToolUse: a message that still came back "queued" is sent back to the agent to promote at once.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';

const out = o => process.stdout.write(JSON.stringify(o));
const pre = o => out({ hookSpecificOutput: { hookEventName: 'PreToolUse', ...o } });
const deny = permissionDecisionReason => pre({ permissionDecision: 'deny', permissionDecisionReason });

function main() {
  const input = JSON.parse(readFileSync(0, 'utf8') || '{}'), ti = input.tool_input || {};
  if (!/t3_thread_send$/.test(input.tool_name || '') || !ti.threadId) return;
  if (input.hook_event_name === 'PostToolUse') {
    const r = JSON.stringify(input.tool_response ?? '');
    const run = r.match(/runId[\\":\s]+(run:[^\\"]+)/)?.[1];
    if (/delivery[\\":\s]+queued/.test(r)) out({ decision: 'block', reason: `That message was QUEUED, which is never allowed. Promote it now: t3_queue {action:"list", threadId:"${ti.threadId}"${ti.environmentId ? `, environmentId:"${ti.environmentId}"` : ''}}, then action "promote_to_steer" with queuedRunId "${run || '<that run>'}" and targetRunId the thread's activeRunId (t3_thread_read limit 1).` });
    return;
  }
  if (ti.mode === 'restart') return;
  const set = mode => { if (ti.mode !== mode) pre({ permissionDecision: 'allow', updatedInput: { ...ti, mode } }); };
  const running = threadRunning(ti);
  if (running && (ti.freshContext || ti.outputSchema)) return deny('That thread is running, and freshContext or outputSchema never steer: the message would be queued. Send it without them (it will steer), or after that run ends.');
  if (running === true) return set('steer');
  if (running === false) return set('auto');
  // Another machine's thread: remember the steer, allow auto only after it.
  const dir = join(process.env.LOCALAPPDATA || os.tmpdir(), 'skill-triggers', 'state');
  const file = join(dir, `steered-${String(input.session_id || 'none').replace(/[^\w.-]/g, '_')}.json`), now = Date.now();
  let seen = {}; try { seen = JSON.parse(readFileSync(file, 'utf8')); } catch {}
  if (ti.mode === 'steer') { try { mkdirSync(dir, { recursive: true }); writeFileSync(file, JSON.stringify({ ...seen, [ti.threadId]: now })); } catch {} return; }
  if (ti.mode === 'auto' && now - (seen[ti.threadId] || 0) < 180000) return;
  deny('Send with mode "steer" first. Only if that is refused because the thread has no running turn, resend with "auto". Never "queue" (a hard rule).');
}

// true / false from T3's own database (read-only); null when it can't tell.
function threadRunning(ti) {
  try {
    const dir = process.env.SENDMODE_T3 || join(os.homedir(), '.t3', 'userdata');
    if (ti.environmentId && ti.environmentId !== readFileSync(join(dir, 'environment-id'), 'utf8').trim()) return null;
    const { DatabaseSync } = process.getBuiltinModule('node:sqlite');
    const db = new DatabaseSync(join(dir, 'statev2.sqlite'), { readOnly: true });
    const rows = db.prepare('select status from orchestration_v2_projection_runs where thread_id=?').all(ti.threadId);
    db.close();
    return rows.length ? rows.some(r => r.status === 'running') : null;
  } catch { return null; }
}

try { main(); } catch { /* never break a session */ }
process.exit(0);
