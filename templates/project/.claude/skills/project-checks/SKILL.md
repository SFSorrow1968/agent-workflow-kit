---
name: project-checks
description: {{NAME}}'s gates, check kit and Done bars - which commands prove a change works, how to run the product for a check, and what a judge looks at. Use before the first edit of any implement, fix or improve request, when writing a Done bar, and before calling anything done.
---

# {{NAME}} checks

The global `checks-not-scores` and `trustworthy-checks` apply; this adds the project's own instruments. Grow it as gates are written: every user rejection becomes a gate here.

## Gates (every round, through the heavy gate)
- Unit tests: `{{TEST}}`
- Build: `{{BUILD}}`
- In the real product: `{{RUN}}`

## The kit
One command per bar, one output folder, fixed inputs or views, the numbers read, a check per limit. A bar without a kit isn't ready for building: write the kit first, here.

## Look checklist (for a judge)
- The project's style rules (`art-direction`).
- (Add items per screen or asset as they are built.)

## Motion and feel
Judged by the user from a clip or build; agents gate only what they can measure.
