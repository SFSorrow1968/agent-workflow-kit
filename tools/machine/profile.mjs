// The kit's machine config (machines and their ssh names), read from ~/.agents/kit/config.json, which
// bootstrap.mjs writes. AGENT_KIT_DIR overrides the folder.
// Every reader falls back to an empty config: this machine only.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';

export const PROFILE_DIR = process.env.AGENT_KIT_DIR || join(os.homedir(), '.agents', 'kit');
let cache = null;
export function profile() {
  if (cache) return cache;
  try { cache = JSON.parse(readFileSync(join(PROFILE_DIR, 'config.json'), 'utf8')); } catch { cache = {}; }
  return cache;
}
export const machines = () => (Array.isArray(profile().machines) ? profile().machines : []);
// This machine's entry (first hostnameRe that matches), or null.
export function selfMachine(host = os.hostname()) {
  return machines().find(m => { try { return new RegExp(m.hostnameRe, 'i').test(host); } catch { return false; } }) || null;
}
// %VAR% expansion for Windows-style paths in the config.
export const expand = p => String(p || '').replace(/%([^%]+)%/g, (_, v) => process.env[v] ?? `%${v}%`);
