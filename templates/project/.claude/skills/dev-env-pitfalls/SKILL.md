---
name: dev-env-pitfalls
description: Known traps in {{NAME}}'s machines and toolchain ({{STACK}}) - shells, servers and ports, scripted edits, git worktrees and pushes - and their fixes. Use before running shell commands, editing files from scripts, starting servers, pushing or committing, and when a tool misbehaves.
---

# {{NAME}}: known traps

Add each trap the first time it costs time: the symptom, the cause, the fix.

## Git
- One worktree per session; commit by path. A file another live lane owns is never edited; ask the Lead.
- Windows checkouts may use CRLF: a scripted find-and-replace must match `\r\n` or normalise first.

## Servers and ports
- One dev server per worktree, on a port no other lane uses (the roster lists ports). Stop it by PID at the end.
