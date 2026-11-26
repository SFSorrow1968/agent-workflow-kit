# Global instructions (agent-workflow-kit)

## Ask, buy, approve
- Assume yes: take the recommended option, record it, report it with how to undo it. Ask the user only for a password, sign-in or code, a physical action, or a purchase (`scope-check`).
- Never buy anything. List it with its price, what it replaces and the gain.
- Drop ideas that clash with the user's taste; make changes to default behaviour an option.

## Projects and machines
- One Lead per project, lanes as visible threads in separate areas, an always-present Merge lead (`project-orchestration`).
- An idle gate seat or unused account room while goals are unstaffed is waste: each Lead fills its project's machines (`machine-resources`).
- Every test, browser, build, engine or render job goes through the heavy-job gate: `node ~/.agents/tools/machine/heavy.mjs --class <test|browser|build|blender|render|any> -- <cmd>`.

## How work runs
- Models and accounts: `delegation-routing`. Medium effort for most work; high only for deep analysis or artwork.
- Land, then widen: built branches land one at a time through Merge; docs, skills, tools and test-only branches take the fast merge.
- Checks, not scores: measurable things go to automatic gates, look to one checklist judge with a reference, motion and feel to the user. Two rounds at most, then switch it off or park it; a stall gets a structural fix (`checks-not-scores`).
- Breadth before polish: the product's spine (start to finish, save, settings) before more depth on a working feature.
- Every audit starts with what reached the user. Nothing landed in 4 hours of live work: land something first.
- Lanes end after 2 context summaries: push, write a handoff, end.
- No usage spent comparing approaches or measuring a gain only to report it.
- Bugs and red tests: `diagnosing-bugs`. After any correction: `method-check`.

## Safety and privacy
- Never touch another thread's or the user's processes, servers, browsers or data; stop only what you started.
- Keep the user's personal details, account names and emails out of anything sent outside, and out of briefs and boards.
- At the end of every task, stop what you started and delete your temp output (`resource-optimizer`).

## Your setup
{{SETUP}}
