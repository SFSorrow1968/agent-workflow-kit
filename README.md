# Agent workflow kit

A ready-made way to run a software project with Claude Code agents: one **Lead** you talk to, **lanes** (one agent per separate area of work, each in its own git worktree), and a **Merge** lane that lands finished branches one at a time. It comes with skills that tell the agents how to check their work, debug, clean up after themselves and share a machine without running it out of memory.

It is not tied to any language or engine. The bootstrap asks about your project and writes its files.

## What you need
- Windows 10/11 (macOS and Linux mostly work; the memory gate's commit reading and the Stop hook's process check are Windows-first)
- [Node.js](https://nodejs.org) 20 or newer, and git
- [Claude Code](https://docs.claude.com/en/docs/claude-code)
- Optional: [T3 Code](https://t3.codes), so every lane is a visible thread you can type in; a second model for read-only reviews (for example Codex); ssh between your machines if you have more than one

## Getting started
```bash
git clone <this repo> agent-workflow-kit
cd agent-workflow-kit
node bootstrap.mjs
```
It asks a few questions about this machine (your model, whether you use T3 Code, a reviewer, how many accounts, other machines), installs, then offers to set up a project: its folder, what it is, the stack, the test, build and run commands, your taste for it, and the first goals.

Then open the project in T3 Code (a thread titled "Lead") or Claude Code and say:

> You are the Lead. Read CLAUDE.md and docs/goals.md, fill in each goal's Done bar, start the Merge lane, then staff G1.

Later:
- `node bootstrap.mjs project`: another project
- `node bootstrap.mjs machine`: change this machine's answers
- `git pull && node install.mjs`: update (it only rewrites what changed)

## What gets installed
| Where | What |
|---|---|
| `~/.claude/skills/` | the shared skills (below) |
| `~/.claude/CLAUDE.md` | the global rules, between `agent-workflow-kit` markers; anything of yours outside them is kept |
| `~/.claude/settings.json` | the skill-reminder hook (and, with T3 Code, the send-mode hook) |
| `~/.agents/tools/machine/` | `heavy.mjs` (the memory-aware job gate) and `audit.mjs` (one line per machine) |
| `~/.agents/skill-triggers/` | the hook and its rules (`triggers.json`) |
| `~/.agents/kit/config.json` | your answers |

A project gets `CLAUDE.md`, `docs/goals.md`, `docs/status.md`, `docs/LESSONS.md`, `.claude/settings.json` and three project skills to grow: `project-checks` (its gates), `art-direction` (your taste) and `dev-env-pitfalls` (its traps). Existing files are never overwritten.

## The skills
| Skill | What it does |
|---|---|
| `project-orchestration` | Lead, lanes and Merge: briefs, messages, the roster, landing, fast merges, audits |
| `delegation-routing` | model, effort and account for each agent; escalation when stuck |
| `checks-not-scores` | every check is measurable (automatic gates), look (one checklist judge) or feel (you); no 0-100 scores; two rounds, then park it |
| `trustworthy-checks` | checks that can fail: red first, count what ran, drive real inputs |
| `diagnosing-bugs` | one red-capable command first, ranked hypotheses, one change per probe, test before fix |
| `method-check` | question the method, turn every correction into a rule where it will be used |
| `scope-check` | assume yes on decisions; only passwords, physical actions and purchases go to you |
| `resource-optimizer` | each agent stops what it started and deletes its temp output |
| `machine-resources` | the heavy-job gate, memory budgets, several machines |
| `token-economy` | fewer turns and smaller context: one blocking wait, ranged reads, batched calls |
| `codex-review` | an optional read-only review of each branch by a second model |

The hook reminds an agent to open a skill when its message or tool call matches a rule in `triggers.json`; rules naming a skill the session doesn't have are skipped.

## The heavy-job gate
```bash
node ~/.agents/tools/machine/heavy.mjs --class test -- npm test
node ~/.agents/tools/machine/heavy.mjs --status
```
A job waits until a slot of its class is free and the machine has memory to spare, and its process tree is killed if it passes its memory cap. Slots per machine go in `~/.agents/tools/machine/budget.json`, for example `{"slots":{"test":3,"browser":2}}`.

## Credits
`diagnosing-bugs` is adapted from Matt Pocock's skills (github.com/mattpocock/skills, MIT). MIT licence, see LICENSE.
