---
name: trustworthy-checks
description: Rules for checks that can fail and see what the user sees (tests, probes, gates, pixel or screenshot checks, benchmarks). Red first, absence checks that prove the subject is there, counting cases actually run, driving the user's inputs, probes that agree with the real product case by case, determinism, one-setup before and after, and scalar asserts only. Use when writing a test, probe or gate, and when a check disagrees with the product or the user.
---

# Trustworthy checks

A project's own kit skill (`project-checks`) adds its harness and API.

## A check must be able to fail
- Run every new check once against the known-bad case (old code switched back on, or a mutant) and see it fail. Mutants go in a throwaway worktree.
- A regression test is red before the fix and green after, in the same commit (`diagnosing-bugs`).
- A check of an absence ("no error", "no bright pixels", "nothing overlaps") first asserts its subject is there and ready; it passes on an empty screen otherwise. Look at one real output while writing it.
- Assert identity, not presence: the item shown is the one named. Run a new case twice in one session and once after a case that leaves state behind.
- A case that fakes a state touches only what it made, never shared objects.
- Look at a golden (snapshot, screenshot, recording) when it is taken: its subject must be in it.
- Define outcomes as the user reads them: "seen" is in view, unobstructed, long enough; "fast" is time to usable.

## Count what ran
- Before a run made for one number, confirm the number reaches the report.
- Print the count of cases run and compare it with the count expected; zero run is a failure.
- A gate that failed on a starved machine is no evidence: rerun through the gate on a free one. Time a slow case alone before changing it.

## Drive the user's inputs
- Sweep the parameters that change the output (sizes, ranges, paths through a flow), or prove they don't matter. Two checks that each see half of one thing run on the same cases.
- Gate outcomes from the user's side (reached the end, saw it), counting every refusal by reason.
- For "sometimes" complaints, list the states tests never enter (error, mid-action, interrupted, offline, empty, full, slow device) and measure there first.
- Every screen size, aspect ratio and input method the user uses.
- Rare outcomes: a seeded share check over hundreds of trials, inputs distributed as in real use.

## Probes and the real product
- A headless or offline number counts only after the same case ran in the real product and agreed case by case, step by step. Where they differ the product is right: route the probe through the product's own path.
- Name the subject by what it is, never a proxy ("the biggest element", "the first match").
- Start each action from the state real use reaches it in; record at the point of decision.

## Determinism and comparisons
- A seeded case proves only the path it replays; keep a many-seed run beside it, counted by kind.
- To reproduce a failure, run the cases before it in the runner's order. When two runs differ, record the state before guessing; a fix that doesn't remove the difference means the cause isn't found.
- Before and after: one setup, one seed, one switch flipped in the same session, clocks pinned, the difference printed at the first compared step.
- Compare against the same thing without the change, never a fixed level; turn off only the one thing the check is about.
- A timing measures the product, not the harness: check instrumentation and mocks aren't the cost; warm what the product warms.
- A failing compound number is split into its parts before anything is touched.

## Assert scalars, never live objects
Assert booleans or scalars (`assert.equal(contact === null, true)`, `assert.equal(hits.length, 2)`), never `equal`, `deepEqual` or `match` on an object that can reach a scene, mesh, map or renderer: a failing assert diffs everything it reaches (one grew to 63 GB). To compare several fields, pick them into a small plain object first. Run tests through `heavy.mjs`; a memory kill there is still your leak.
