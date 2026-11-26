---
name: diagnosing-bugs
description: Diagnosis loop for any failing test, bug, crash, stutter or perf regression. Build one fast red-capable command first, minimise, rank 3-5 falsifiable hypotheses, change one thing per probe, write the regression test before the fix, clean up. Use when a test is red, something is broken, slow or flaky, or a fix has failed once.
---

# Diagnosing bugs

Adapted from Matt Pocock's `diagnosing-bugs` (github.com/mattpocock/skills, MIT).

## 1. One red-capable command
No command, no theory. Write down one command you have already run, with its output, that is:
- red-capable: asserts the exact symptom, not "didn't crash";
- deterministic (fixed seed, step, time), fast (seconds to minutes) and unattended.

Sources, cheapest first: the failing test narrowed by its filter; a script with a fixture diffed against known-good output; a headless script asserting on the screen or log; a captured trace replayed; `git bisect run` between good and bad commits; a differential run of two versions or configs.
- Tighten it: narrower scope, sharper assert, more determinism.
- Flaky: raise the repro rate (loop, stress, narrow the timing) until it fails often.
- No loop possible: write what you tried in the handoff and ask the Lead for the missing environment or capture.

## 2. Reproduce and minimise
Confirm it fails with the symptom, not a nearby one. Cut inputs, steps, actors and config one at a time, re-running after each, until every piece left is needed.

## 3. 3-5 ranked, falsifiable hypotheses
Write them in the handoff before testing: "If X, then changing Y makes it pass." No prediction, no hypothesis. Test in your order.

## 4. One variable per probe
Debugger or a targeted readback first; logs only at boundaries that separate hypotheses, each tagged `[DEBUG-<4 hex>]`. Perf: measure on the real target first, then bisect.

## 5. Regression test, then the fix
Turn the minimised case into a failing test at a seam on the real call path (no seam is a finding for the handoff). Watch it fail, fix, watch it pass, rerun the step 1 command. Never weaken, skip or re-label a check to get green; a wrong test is fixed with a mutant proving it still catches the fault.

## 6. Before "done"
- [ ] step 1 command green on the original case
- [ ] regression test passes (or the missing seam written down)
- [ ] no `[DEBUG-` left; throwaway harnesses deleted
- [ ] the commit message states the proven cause; a known-reds entry removed in the same commit

## A fix failed twice
Stop changing code. Back to step 1: the loop probably doesn't assert the real symptom, or a hypothesis was never falsified. Write what's ruled out. Still stuck after 20 minutes of this: `delegation-routing`, Hand-offs.
