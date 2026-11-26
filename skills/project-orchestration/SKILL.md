---
name: project-orchestration
description: Runs a project with agents as one Lead the user types in, lane threads it launches for separate areas, and a Merge lead that lands branches one at a time. Covers roles, briefs, the roster, messages, goals and status files, landings, fast merges, accounts, audits and machine use. Use as a Lead or lane, when launching, messaging or ending lanes, landing work, after a context summary, or when work seems stalled.
---

# Project orchestration

Works best in T3 Code, where every lane is a visible thread the user can type in (`t3_thread_launch`, `t3_thread_send`). With Claude Code alone, a lane is a separate session in its own git worktree, and the messages below go in its handoff file and the Lead's status file instead.

## Roles
- **Lead** (`Lead`): the thread the user types in. Keeps the goals, status and roster; decides (assume yes, `scope-check`); launches lanes; sends ready branches to Merge; reports to the user, with a screenshot or clip for anything visible; owns machine and account use. One per project.
- **Lane**: one area (sound, a menu, frame rate) in its own worktree from `origin/main`, inside its own files. Pushes its branch, never merges to main. Titled in one to three plain words ("Sound", "Frame rate"); a successor adds a number ("Frame rate 2").
- **Merge** (`Merge`): always exists. Lands READY branches one at a time (Landing). The Lead checks for it at every start, wake-up and context summary and starts it first when missing. The Lead lands only while Merge can't, and says so in the status.
- Lanes are visible threads, not hidden subagents, so the user can see and steer every one.

## Files
- **Goals** (`docs/goals.md`): numbered goals, each with `Done:` (a measurable bar) and `State:`; queue order at the top; every user order added with its date and words.
- **Status** (`docs/status.md`): under 20 lines for the user: running now, landed, needs you. Written only when something changed.
- **Roster** (in the status): every live lane with thread, machine, account, files, branch, ports and state.
- **Handoff** (`docs/handoffs/<lane>.md`): what works, what's next, the commands. Kept current at each milestone.
- **Bug list** (`docs/buglist.md`): review findings that don't hold a landing, worked worst first on a regular bug day.

## Launching a lane
- Parallel lanes only in completely separate areas: no shared files, shared module or system the other changes. Shared plumbing gets one owner lane that lands first. The Lead refuses a launch or edit that overlaps a live lane.
- Pick the account and machine right before the launch (`delegation-routing`, `machine-resources`): the machine with the most free seats and memory, not the Lead's own by habit.
- The first message is the whole brief:
  - the goal and its Done bar (gates, a look checklist, or "the user judges feel"; `checks-not-scores`);
  - the files it owns and must not touch, the other live lanes, its ports;
  - "heavy jobs through your machine's gate (`heavy.mjs`)";
  - the model, effort and commit trailer;
  - "name your hardest open problem in your first message";
  - "every message ends with MACHINES, FAST and STUCK, acted on first";
  - "at your 2nd context summary, push, write a handoff and end".
- Check the launched thread is really running.

## Messages
- Lanes message only the Lead, never each other: at start (the files and systems it will touch), before editing outside them, when blocked, and READY or PARKED.
- A message that changes what a lane does now interrupts it (T3 `mode: "steer"`); never let it sit in a queue behind a long job.
- READY reports stay under 200 words: branch head, gate numbers, review result.
- Tokens, passwords and personal details never go in messages, briefs or boards.

### The three closing lines
Every lane message to the Lead ends with these, and the lane fixes what is its own first:
- `MACHINES:` the output of `node ~/.agents/tools/machine/audit.mjs`. Before sending, it moves its own long-queued job to a machine with a free seat, stops its own overrun run, and releases seats it holds while editing.
- `FAST:` whether the branch meets the fast-merge rules today, or why not.
- `STUCK:` whether something minor holds back real progress, and why. Real progress is a landing the user can use, or a newly met Done item. Minor is anything the Done bar doesn't need (a rare edge case, a low review finding, wording, a refactor, a wait). Crashes, data loss, security or privacy faults and regressions are never minor. A minor item past 2 rounds or 30 minutes is split off, switched off or listed as a follow-up, and the rest lands.

The Lead reads all three on every message and acts at once on what the lane couldn't fix.

## The Lead's loop (every message, report and wake-up)
1. **Land first.** READY branches go to Merge, oldest first. No new lane in an area while one of its built branches waits. After each landing, tell the other lanes to merge `origin/main` and update the roster.
2. **Review lightly** (`codex-review`): one review per branch of product code; only a confirmed crash, hang, data loss, security or privacy fault or plainly visible fault holds a landing.
3. **Staff the queue.** The top unstaffed goal whose files don't clash gets a lane when an account has room and a machine has seats. At most 3 working lanes per machine.
4. **Fill the machines.** Read every project machine's gate (`audit.mjs`). A job queued on one machine while another has a free seat, or a machine idle while goals are unstaffed, is fixed at once.
5. **No thread sits snoozed.** A thread that hit a usage limit moves to the next account with room right away and gets a "continue where you left off" message; only when every account is spent does it wait, with one wake-up at the reset.
6. **Hygiene.** Settle finished lanes; remove clean, merged worktrees; stop orphans only after their owner has ended.
7. **Audit** about every 2 hours of live work: `AUDIT <time>: OUTPUT <changes the user can use>; lanes n; idle seats; stuck <items or none>`. Nothing landed in 4 hours: land something first.
8. **Lessons.** After a user correction, add it to `docs/LESSONS.md` and put the rule where it will be used (`method-check`).

## Every lane
- Own worktree; commit by path (`git commit -- <paths>`) with the project's trailer; never `git add -A`, stash, `reset --hard` or force-push.
- Cleans up after itself (`resource-optimizer`); one blocking wait per job, never a poll.
- Runs its gates every round; asks for a review or judge only when they're green.
- Ends at 2 context summaries: push, write the handoff, end. The Lead starts a successor from it only if the goal still needs one.

## Landing
- **The train.** Merge takes READY branches one at a time: merge `origin/main` in, run the project's tests and gates, push main, CI green. Related branches may land as one group with one check run; a red drops only the branch it points at.
- **Fast merge.** A branch that touches nothing the shipped product loads at runtime (docs, skills, its own tools and tests, unreferenced assets), merges cleanly and has green gates lands with unit tests and CI only, between train landings. Shared plumbing (build config, package files, launch scripts, the main loop, shared modules) never is. CI red after a fast merge: revert with a new commit and send it through the train.
- One check runner per seat; a lane never holds a seat while it edits.
