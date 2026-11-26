# {{NAME}}: project instructions

{{WHAT}} Built with {{STACK}}. Repo `{{DIR}}`, branch `main`. Goals: `docs/goals.md`; status and roster: `docs/status.md`.

## Commands
- Test: `{{TEST}}` (through the gate: `node ~/.agents/tools/machine/heavy.mjs --class test -- {{TEST}}`)
- Build: `{{BUILD}}`
- Run it to check a change: `{{RUN}}`

## Rules
- The global workflow applies (`project-orchestration`, `checks-not-scores`, `delegation-routing`). This file adds only what is particular to this project.
- Machines this project may use: {{MACHINES}}.
- Style and taste: `art-direction`. Gates and the check kit: `project-checks`. Known traps: `dev-env-pitfalls`.
- One worktree per agent session. Commit only your own files by path (`git commit -m "[<lane>] ..." -- <paths>`) with your model's trailer. Never `git add -A`, stash, `reset --hard` or force-push. Never commit on `main` yourself; Merge lands branches.
- Start and end every task with `resource-optimizer`: stop what you started, delete your temp output.
- After any user correction: a dated entry in `docs/LESSONS.md` (`method-check`).
