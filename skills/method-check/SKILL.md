---
name: method-check
description: Checks that the way you test, judge, measure, coordinate or spend resources is the most accurate and cheapest one, and turns every user correction into a rule where it will be used, keeping docs/LESSONS.md short by folding lesson groups into skills. Use at the start of every task, before verifying or judging anything, when results disagree with the user, after any correction, and when LESSONS.md passes about 12 entries.
---

# Method check

The user has repeatedly had to point out that how agents worked was wrong, not only the results: stills judged for motion, noisy end-to-end runs instead of controlled cases, self-assessments far above an independent judge, saturated machines, messages nobody read. Catch these yourself.

## Before you start
Read the project's `docs/LESSONS.md` and apply every rule that touches your task.

## Before you verify or judge
- Does the check see what the user experiences? A complaint your check can't see ("laggy", "too much text", "says done but nothing changed") needs a new instrument (`trustworthy-checks`).
- Is it controlled: isolated, deterministic, repeatable, asserting? The end-to-end run comes last, to confirm.
- A cause is shown only by changing one thing in the same setup. Two runs that differ in several ways prove nothing: write "differs, cause not found". Print the condition that stops something before explaining why it doesn't happen.
- Something looks wrong after you added code: switch your new code off first.
- Would a reviewer who didn't build it agree? Treat an unreviewed self-assessment as 20-30% optimistic.
- Is there a cheaper check (node over a browser, headless, smaller, batched)?
- A result that disagrees with the user means your measurement misses something; find it first.
- Bugs and red tests: `diagnosing-bugs`. Who decides what: `checks-not-scores`.

## Warning signs
Repeating a fix with little gain, checks passing while complaints stay, mostly waiting, eyeballing what could be measured (or measuring what only an eye can judge), reporting done on evidence the user can't see. A stall gets a structural fix, never a third round of the same tuning.

## After a correction
1. Fix the instance.
2. Name the method failure: what about how you worked let it happen.
3. Add a dated entry to `docs/LESSONS.md`:
   ```
   ### <date> — <short name> (<agent>; user correction or found by the agent)
   - **Correction:** what the user said, verbatim if short.
   - **Method failure:** what about how we worked caused it.
   - **Rule:** the general rule, one or two sentences.
   - **Where it now lives:** the skill, doc or check that enforces it.
   ```
4. Put the rule where it will be used: the skill read in that situation, a test or a gate.
5. If another lane may be making the same mistake, tell your Lead in one line. State the lesson in one line in your report.

## Keeping LESSONS.md short
LESSONS.md is an inbox; every entry costs tokens in every session. Fold when it passes about 12 entries or 120 lines, when 3 entries share a theme, or when a new entry repeats a skill.
1. Group entries by trigger (the situation where the rule is needed: "before judging a clip"), not by topic.
2. Each group goes into the skill whose description fires in that situation. No such skill and 3+ entries with a distinct trigger: make one. Fewer: leave them.
3. Fold each as one or two imperative lines in the section where it applies, keeping its numbers and "never" words. No incident stories. Merge duplicates. Folding must not bloat the skill: rewrite or replace an existing line first and add a line only as the last resort; a skill's body stays under about 120 lines, and a skill already over it is trimmed (merge, cut what's stale or restated elsewhere) before anything is added.
4. Check that every Rule line maps to a skill line, the skill's description names the situation, and every check the entry names still exists.
5. Move the full entries unchanged to `docs/LESSONS_archive.md` and leave one line in LESSONS.md: `- <theme>: now in <skill> (<dates>)`.
6. Commit by path with the mapping in the message. Keep in LESSONS.md: entries under 2 days old, one-off rules with no single trigger (or move them to CLAUDE.md if stable), and anything whose target skill is being rewritten.
7. Never edit read-only archives of other projects. A new or renamed skill gets its rule in `triggers.json`.
