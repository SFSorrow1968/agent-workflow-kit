// Process sampling shared by heavy.mjs (a job's own tree cap) and guard.mjs (the always-on watcher). 2026-11-25: a node
// test grew to 63 GB and the main PC fell to 0.1 GB free; the gate had only checked free RAM before the job started.
//
// One long-lived, hidden PowerShell per caller prints a sample of every process (pid, parent, name, private bytes,
// creation time, and with `cmdline` the command line) every `intervalMs`, so a 2-5 s watch doesn't start a new
// PowerShell each time. For processes over `cwdOverGB` it also reads the working directory from the process's PEB
// (command lines like `node --test tests/x.test.js` don't name the worktree). It exits on its own when its owner dies.
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createInterface } from 'node:readline';
import os from 'node:os';

export const GB = 2 ** 30;
export const KILLS_LOG = process.env.AGENT_KILLS_LOG || join(os.homedir(), '.agents', 'tools', 'machine', 'kills.log');

const CWD_READER = `
using System; using System.Runtime.InteropServices; using System.Text;
public static class AgentCwd {
  [DllImport("ntdll.dll")] static extern int NtQueryInformationProcess(IntPtr h, int c, IntPtr[] info, int len, out int ret);
  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(int a, bool i, int pid);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll")] static extern bool IsWow64Process(IntPtr h, out bool w);
  [DllImport("kernel32.dll")] static extern bool ReadProcessMemory(IntPtr h, IntPtr a, byte[] b, int n, out IntPtr r);
  public static string Get(int pid) {
    IntPtr h = OpenProcess(0x0410, false, pid); if (h == IntPtr.Zero) return null;
    try {
      bool wow; if (!IsWow64Process(h, out wow) || wow) return null;
      IntPtr[] pbi = new IntPtr[6]; int ret; IntPtr r;
      if (NtQueryInformationProcess(h, 0, pbi, IntPtr.Size * 6, out ret) != 0) return null;
      byte[] b = new byte[8];
      if (!ReadProcessMemory(h, IntPtr.Add(pbi[1], 0x20), b, 8, out r)) return null;
      IntPtr pp = new IntPtr(BitConverter.ToInt64(b, 0));
      byte[] us = new byte[16];
      if (!ReadProcessMemory(h, IntPtr.Add(pp, 0x38), us, 16, out r)) return null;
      int len = BitConverter.ToUInt16(us, 0); IntPtr buf = new IntPtr(BitConverter.ToInt64(us, 8));
      if (len <= 0 || len > 8192) return null;
      byte[] s = new byte[len]; if (!ReadProcessMemory(h, buf, s, len, out r)) return null;
      return Encoding.Unicode.GetString(s);
    } catch { return null; } finally { CloseHandle(h); }
  }
}`;

function script({ intervalMs, cmdline, cwdOverBytes, owner }) {
  const props = 'ProcessId,ParentProcessId,Name,PrivatePageCount,CreationDate' + (cmdline ? ',CommandLine' : '');
  return `$ErrorActionPreference='SilentlyContinue'; [Console]::OutputEncoding=[Text.Encoding]::UTF8
${Number.isFinite(cwdOverBytes) ? `Add-Type -TypeDefinition @'\n${CWD_READER}\n'@` : ''}
while ($true) {
  if (-not (Get-Process -Id ${owner} -ErrorAction SilentlyContinue)) { exit }
  $o = foreach ($p in (Get-CimInstance Win32_Process -Property ${props})) {
    $m = [int64]$p.PrivatePageCount; $d = $null
    ${Number.isFinite(cwdOverBytes) ? `if ($m -gt ${Math.round(cwdOverBytes)}) { $d = [AgentCwd]::Get([int]$p.ProcessId) }` : ''}
    [pscustomobject]@{ i=[int]$p.ProcessId; p=[int]$p.ParentProcessId; n=$p.Name; m=$m; t=$(if ($p.CreationDate) { $p.CreationDate.ToFileTimeUtc() } else { 0 }); c=${cmdline ? '$p.CommandLine' : '$null'}; d=$d }
  }
  $f = (Get-CimInstance Win32_OperatingSystem -Property FreePhysicalMemory).FreePhysicalMemory
  [Console]::Out.WriteLine('SAMPLE ' + [string]$f + ' ' + (ConvertTo-Json -InputObject @($o) -Compress -Depth 2))
  [Console]::Out.Flush()
  Start-Sleep -Milliseconds ${intervalMs}
}`;
}

// onSample({ procs: [{pid, ppid, name, bytes, created, cmd, cwd}], freeGB })
export function startSampler({ intervalMs = 2000, cmdline = false, cwdOverGB = Infinity, onSample, onError = () => {} }) {
  if (process.platform !== 'win32') { onError(new Error('process sampling is Windows-only')); return { stop() {} }; }
  const enc = Buffer.from(script({ intervalMs, cmdline, cwdOverBytes: cwdOverGB * GB, owner: process.pid }), 'utf16le').toString('base64');
  const ps = spawn('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', enc], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  createInterface({ input: ps.stdout }).on('line', line => {
    const m = /^SAMPLE (\d+) (.*)$/.exec(line); if (!m) return;
    let raw; try { raw = JSON.parse(m[2]); } catch (e) { onError(e); return; }
    const procs = (Array.isArray(raw) ? raw : [raw]).filter(Boolean).map(r => ({ pid: r.i, ppid: r.p, name: String(r.n || ''), bytes: +r.m || 0, created: +r.t || 0, cmd: r.c || '', cwd: r.d || '' }));
    try { onSample({ procs, freeGB: +m[1] / 2 ** 20 }); } catch (e) { onError(e); }
  });
  ps.on('error', onError);
  return { stop() { try { ps.kill(); } catch {} } };
}

// The pids of `root` and everything below it. A child counts only if it started after its parent (a reused parent
// pid would otherwise adopt an unrelated process).
export function descendants(procs, root) {
  const byPid = new Map(procs.map(p => [p.pid, p])), kids = new Map();
  for (const p of procs) { if (p.pid === p.ppid) continue; (kids.get(p.ppid) || kids.set(p.ppid, []).get(p.ppid)).push(p); }
  const out = new Set(), stack = [root];
  while (stack.length) {
    const pid = stack.pop(); if (out.has(pid)) continue; out.add(pid);
    const me = byPid.get(pid);
    for (const k of kids.get(pid) || []) if (!me || !k.created || !me.created || k.created >= me.created) stack.push(k.pid);
  }
  return out;
}
export const treeBytes = (procs, pids) => procs.reduce((s, p) => s + (pids.has(p.pid) ? p.bytes : 0), 0);

// Kill each pid outright (not `taskkill /T` from the root: a tree whose middle process already exited leaves orphans).
export function killPids(pids) {
  const list = [...pids].filter(p => p > 4 && p !== process.pid);
  for (let i = 0; i < list.length; i += 40) {
    const args = ['/F']; for (const p of list.slice(i, i + 40)) args.push('/PID', String(p));
    spawnSync('taskkill', args, { stdio: 'ignore', windowsHide: true, timeout: 15000 });
  }
}

// One JSON line per kill: { at, host, by, class?, pid, gb, capGB, cwd, cmd, why }.
export function logKill(rec) {
  try { mkdirSync(dirname(KILLS_LOG), { recursive: true }); appendFileSync(KILLS_LOG, JSON.stringify({ at: new Date().toISOString(), host: os.hostname(), ...rec }) + '\n'); } catch {}
}
