---
name: scope-check
description: Decides what to do with an idea the user didn't explicitly ask for, with approvals assumed yes - proceed and report, make it an option, propose it to the Lead, or drop what conflicts with the user's taste. Only a password, sign-in, physical action or purchase goes to the user. Use before adding, changing or reframing anything unasked, and whenever a "should we also" or approval question comes up.
---

# Scope check

A project's own `scope-check` adds its taste rules.

## Assume yes
Where a decision would go to the user, take the recommended option, record it (status file, or the goals file's Decisions) and say in the next report what you decided and how to undo it. Go to the user only for:
- a password, sign-in or code (`request_secret`, never a chat ask);
- a physical action;
- a purchase: never buy; list it with price, what it replaces and the gain.

## Read for intent
Take a request for what the user likes in it. Read it through the project's taste (style guide, LESSONS.md); where a convention conflicts, take the reading closest to the user's latest words and say so. References give principles, never layouts, names or looks.

## The questions, in order
1. Does the stated taste answer it? Follows it: go on. Conflicts: drop. Ambiguous: closest reading, recorded.
2. In the current goal's scope? Improving what was asked is. A new system, mode, screen, content class or core-loop change goes to the Lead's goals as a proposal.
3. Changes the default experience? Make it an option that keeps the old behaviour by default where you can.
4. Cheap and reversible? Proceed. Large: only if it serves the current goal, with its cost in one line.
5. Would the user be surprised? Make it an option and tell them.

## Then
- Proceed: one line in the report ("Also added X as an option, off by default; undo: Y").
- Drop: one line on why, so it isn't proposed again.
- Pick one approach from what's known and build it; no usage on comparing approaches or measuring a gain just to report it.
