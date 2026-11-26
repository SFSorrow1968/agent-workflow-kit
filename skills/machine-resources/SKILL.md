---
name: machine-resources
description: The user's machines, which projects may use each, memory budgets, and the machine-wide heavy-job gate (heavy.mjs) with its slots, memory admission, per-job memory caps and quiet windows. Use before launching any agent or heavy job (tests, browsers, builds, game engines, Blender, renders), when a machine goes offline or returns, and when processes fail to start, a job is killed for memory, or a machine is slow.
---

# Machines and memory

Memory, not tokens, limits parallel work: one agent session costs about 0.5 GB even idle, a test runner or headless browser 0.2-2 GB, a game engine editor or Blender 1-3 GB. A machine past about 90% of its memory stops starting processes and every build stalls. The gate prevents that.

The user's machines, their ssh names and which projects use each are in `~/.agents/kit/config.json` (written by `node bootstrap.mjs`) and summarised in the global CLAUDE.md under "Your setup".

## The heavy-job gate
Every test run, browser session, build, engine or Blender job goes through it. Slots are machine-wide across all projects.
```
node ~/.agents/tools/machine/heavy.mjs --class test -- npm test
node ~/.agents/tools/machine/heavy.mjs --class browser -- node tools/check-page.mjs
node ~/.agents/tools/machine/heavy.mjs --class build -- <build command>
node ~/.agents/tools/machine/heavy.mjs --status        # memory, every slot's owner, the queue
node ~/.agents/tools/machine/heavy.mjs --quiet 20 --why "perf run"   # this worktree measures alone (60 min max; --quiet 0 ends it)
node ~/.agents/tools/machine/audit.mjs                 # this machine, then the others in the config over ssh
```
- Classes: test, browser, build, blender, render, any. Default slots: test 2, browser 2, build 1, blender 1, render 1, any 3. Override per machine in `~/.agents/tools/machine/budget.json`, for example `{"slots":{"test":3},"minFreeGB":4}`; the installer never overwrites it.
- A job starts only when its slot is free, at least `minFreeGB` (6) of RAM is available and commit is under `maxCommitPct`. It blocks in one call until then: run it in the background and wait once. Exit 75 means it gave up waiting: write a handoff and end.
- Each job's process tree has a memory cap per class; past it the tree is killed, `[heavy] KILLED` is printed and the exit is 137. A kill means a leak: fix it before rerunning.
- A quiet window holds every other worktree's new jobs (nested ones too) so one measurement runs on an idle machine. Keep it short.
- Run the installed copy (`~/.agents/tools/...`), never a repo copy: only the installed one reads the machine's `budget.json`.

## Rules
- Launch agent sessions a minute apart, and nothing heavy while `--status` shows under 6 GB available.
- A lane's heavy jobs run on its own machine's gate first; another machine only when its own has been full for over 10 minutes and the other shows a free seat. A job queued on one machine while another has a free seat is waste: move it.
- One dev server per worktree, stopped when the task ends.
- Bulky output (builds, frames, clips, caches) goes off the system drive when there is another drive, under one cache folder per project.
- An agent that expects to wait more than about 30 minutes writes its handoff and ends, freeing its memory.
- A machine below its memory floor: stop only your own orphans; name the user's apps to the user, never close them.

## Running things in a desktop session (Windows)
A scheduled task that runs `powershell.exe` or `cmd.exe` directly opens a console window that stays. Start such tasks through `C:\Windows\System32\conhost.exe --headless <command>`, write output to a log file, and delete a one-off task once it has run.

## When a machine is missing
Everything moves to the machines that are up, through their gates. Agents on a machine that vanishes stop with it; the Lead relaunches successors from their handoffs, which is why every lane keeps its handoff current.
