---
name: checks-not-scores
description: Decides how work in any project is checked and called done. Every check is measurable (automatic gates), look (one checklist judge with a reference, pass or named defects) or motion and feel (the user judges); no 0-100 scores, a 2-round timebox, breadth before polish. Covers judge kits, the debug-port gold standard, gates before judges, scheduled real-environment runs and reference compares. Use before the first edit of an implement, fix or improve request, when writing a Done bar or brief, when deciding it's done, when launching or acting as a judge, and when the user rejects something that passed.
---

# Checks, not scores

Numeric scores measured judge noise, and AI judges of motion and feel never converged. So: no scores, no AI judge for motion or feel. A project's own `project-checks` skill adds its gates, kit and judge inputs.

## 1. Sort every check before building
Write them in the brief or status before the first edit.

| Kind | Examples | Decided by | Done when |
|---|---|---|---|
| Measurable | speed, frame rate, load time, memory, errors, crashes, tests and builds, layout a script can see (overlap, overflow, contrast, a banned colour), missing files, a flow reaching its end | automatic gates (tests, probes, scripts, CI) | every gate green; no judge |
| Look | a screen, model, material, menu, icon, an asset's realism | one checklist judge, not the builder | the checklist passes |
| Motion and feel | animation, transitions, responsiveness, sound feel, game feel | the user, from the clip or build sent on landing | measurable motion gates green and the clip sent; a user complaint reopens it |

Most lanes are wholly measurable. A gate that can't see the problem the user named is the wrong gate: fix the gate first (`trustworthy-checks`).

## 2. One kit per bar
- Every bar has one runnable kit: one command, one output folder, the fixed views or inputs, the numbers read, a check per cap. A bar without a kit isn't ready for building; write the kit first.
- The builder runs the kit and the gates every round before asking for a judge; the judge runs the same kit, then real use and the worst case.
- Gates run first: broken frames and pops, crashes and console errors, layout overflow, loudness and clipping, perf over budget, the project's forbidden content. No judge or reviewer while a gate is red.
- A gate that passed something the user rejected is broken: fix it, with a mutant proving it now fails, before the next round.

## 3. The gold standard for browser projects
The real build in a real headed browser on the real GPU at the user's screen size, driven over the Chrome DevTools Protocol (`--remote-debugging-port`): play it with key and mouse input, read state with `Runtime.evaluate`, take screenshots and traces. Use it for every user complaint (before calling it understood and again before calling it fixed), for every look judge's own run, and whenever headless numbers seem off. When it disagrees with headless checks it wins, and the check gets fixed. Use your own window and profile through the heavy gate's browser class; attach to the user's play window only when offered.

## 4. The real environment, on a schedule
What the user actually runs (the packaged build, the deployed app, the release APK) is measured daily at a quiet hour while a bar is live, into one results file every judge reads. Dev servers and emulators don't stand in for it on perf. A judge never fails an item for lack of a build or machine; it reads the results and says if they're stale.

## 5. The loop
1. Fix the biggest failing item each round; cheap checks first, the real product to confirm.
2. Look work with green gates gets one checklist judge per landing. Its named defects are the next round's whole list.
3. Motion and feel: gate what can be measured, land it, send the clip. Never an AI judge.
4. Two rounds at most: a look item failing after 2 judge rounds, or a gate red after 2 rounds of the same approach, lands behind a switch or is parked with its findings. The next try is a structural reframe.
5. Done: gates green, the checklist passed (if any), the review handled if one is set up (`codex-review`), checked in the real product, and the clip or build sent for visible work.
6. Pick one approach from what's known and build it; a failed approach is replaced, not raced.
7. Breadth before polish: a first pass lands when gates are green and the main checklist items pass; polish tightens the checklist later. A user complaint goes straight to its fix.

## 6. The checklist judge
- **Who:** one fresh reviewer that wrote none of the work: a thread `Judge: <area>` that never saw the build, on another account than the builder's if there is one.
- **Input:** the checklist (area items plus the project's hard rules), a reference per item where likeness matters, screenshots of the given commit at every screen size the user uses. It may take its own shots; it never edits.
- **Answer:** per item PASS or FAIL with the screenshot and, on a fail, the defect in one line ("the banner glows saturated blue, shot 012, right third"). No score, no overall impression, at most three "noticed" lines. Saved in the project (`docs/judge_<area>.md`) with the date and commit.
- A judge that sees a plain fail a gate passed: the gate is wrong; fix it in the same round. The judge names the missing instrument; the owner writes it.

## 7. Look and sound against a reference
- Anything seen or heard gets a reference first (photos, recordings, approved mockups), checked against the project's art direction. The agent gathers and captions references, opening each image first, and saves source URL and caption in the asset's manifest.
- Gates are relative to the reference: value and colour within a tolerance, silhouette and construction, context present. "Has variation" or "matches the style" proves nothing.
- Every look or sound result ships with a side-by-side compare under the real lighting or mix. The Lead opens it before it counts and before showing the user.
- Each new user rejection goes into the goal's Done bar with the gate that would have caught it.

## Report
A table: area, gates (pass or fail, with numbers), checklist (pass or open defects), clip or build path, and one line for anything added unasked. No scores.
