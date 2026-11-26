---
name: codex-review
description: Gets a read-only review of a change from a second model (for example Codex), once per branch of product code, never for docs, tools or tests. Covers the brief, the report contract, what holds a landing and the bug list. Use when a branch of product code needs its review, when writing a review brief, when a report arrives, or when acting as the reviewer.
---

# Read-only review

Only if the user set up a reviewer (global CLAUDE.md, "Your setup"). Without one, land on the tests and gates.

## Rules
- The reviewer only reviews a change (a diff, a branch before merge) and reports defects. It never edits, builds, researches, diagnoses or judges look, feel or design.
- One review per branch of product code, in the background while the builder carries on. No second round, no review per push.
- High effort by default; the highest for installers, saves and user data, start-up, security. None for docs, tools, tests or skills.
- No review while a gate is red, and never for a bug without a known cause (`diagnosing-bugs`).

## Launch (Codex example)
```bash
codex exec -s read-only -C "$checkout" - < "$brief_file"
```
Run it from a shell in the background; a good run exits 0 with a nonempty report.

## The brief
- First line: "You are a REPORTER ONLY: never edit, create, stage or commit any file, never start servers or browsers, make no design or taste decisions."
- The checkout and branch, what to read (`git diff main...<branch>`), what the change should do, the shared files it touches, the acceptance criteria.
- Defect classes: correctness, state restored on every exit path, leaks, determinism, hot-path cost, secrets. "Skip style."
- The report: "First line: the verdict and the most important problem. Then numbered findings, most severe first: severity, file and line, the failure in plain words, confidence, the smallest check that would confirm it. At most 40 lines."

## When the report arrives
- Verify each finding that could hold the landing against the code yourself.
- A landing is held only by a confirmed crash, hang, blocked user, lost or leaked data, security or privacy fault, or plainly visible fault. Everything else is one line in `docs/buglist.md`.
- Never adopt a finding that changes design, feel, look or scope.
- Restate findings in plain words for the user.
