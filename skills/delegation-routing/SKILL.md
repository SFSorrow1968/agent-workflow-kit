---
name: delegation-routing
description: Picks the model, effort and account for every lane, successor, judge and reviewer, with hand-offs when stuck and automatic escalation. Use before launching, resuming or replacing any lane, successor, judge or reviewer, and when work stalls.
---

# Model, effort and account

Don't ask the user; apply this and state the choice in one line at launch. The user's own choices (main model, reviewer, accounts) are in the global CLAUDE.md under "Your setup".

## Model and effort
- The main model at **medium** effort for the Lead, lanes, successors, judges and reviewers: building, fixes, verifying, re-runs, docs.
- **High** only when the task itself is deep analysis or artwork; **xhigh** only after high failed at that exact task. A task being important is no reason to go up.
- A reviewer from another vendor (for example Codex) only reviews: it never builds, diagnoses or judges look and feel (`codex-review`).
- UI, names, copy, look, feel and balance are decided by the main model with the user, never by a reviewer.

## Account and machine
- With several accounts: take the one with room whose weekly window resets soonest and fill it until a window is spent; no pacing. A judge never uses its builder's account.
- A thread that hits a usage limit moves at once to the next account with room (T3: `t3_thread_configure`, then a "continue" message). Nothing waits for a reset unless every account is spent.
- The machine: the one with most room among the project's machines (`machine-resources`).
- A running thread keeps its model and effort; changes apply to its successor.
- Each brief names the model, effort and the commit trailer.

## Hand-offs
1. The main model builds; the reviewer reviews each branch of product code once, in the background (`codex-review`).
2. Stuck: a bug resisting 20 minutes goes through `diagnosing-bugs`; still stuck, a fresh lane at high diagnoses it; then xhigh.
3. Done claims carry each check's command and result at that commit; a judge reruns the gates first (`checks-not-scores`).
4. Reviewer reports are verified and restated in plain words, never forwarded as is.

## Escalation
- Stalled (two rounds, the same gate red or checklist items failing): the successor gets one effort step up, recorded in the status. After 2 rounds of one approach the item lands behind a switch or is parked.
- Calm (gates green): follow-ups go back to medium.
- Never race two builders or compare approaches on one goal; pick one and build it.
