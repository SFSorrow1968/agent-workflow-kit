---
name: resource-optimizer
description: Makes each agent clean up what it starts (dev servers, browsers and tabs, Blender, test workers, shells, temp files, slots) and own its jobs until they end, with a checklist for the end of every task and every wait, and how to report orphans. Use at the start and end of every task, before any wait over a few minutes, before launching anything heavy, after a context summary, and when a machine is slow or the heavy-job gate refuses.
---

# Clean up after yourself

You own what you start; nobody else cleans up after you. The Lead only frees true orphans of its own project. Budgets and the gate: `machine-resources`.

## Before something heavy
- Through the gate (`heavy.mjs --class <test|browser|build|blender|render|any> -- <cmd>`), once in the background, waited on once.
- Reuse what your worktree already runs; one dev server per worktree.
- The lighter tool: headless, one test file over the suite, `--workers=1`, a cached build.
- Note each long-lived process's PID so you can stop it.
- Give every job an expected time and a hard timeout.

## End of every task, and before any wait over about 5 minutes
1. Stop what you started and no longer need, by PID (`Stop-Process -Id`), never by name: servers, browsers, Blender, watchers, background shells.
2. Delete your temp output (frames, renders, throwaway Chrome profiles, scratch builds). Keep asked-for clips and shared caches.
3. Release slots and locks.
4. Waiting on others for more than about 30 minutes: write the handoff and end, freeing the session's memory. Never end a turn while your own job runs: wait on it once (`t3_background_wait`).
5. A review you launched is waited on and its process gone before you end.

## Browser tabs
- Before every reply that ends a turn: `t3_preview_list`, then close each tab this thread opened and no longer uses. Keep one only while something runs in it (a long answer, a render, a recording) or the user is using it, and say which.
- One tab, reused with `preview_navigate`. Copy downloads out before closing.
- Close in the turn that opened it: a tab later becomes `unclaimed` and can't be closed. An unclaimed tab: navigate it to `https://example.com` and tell the user it is theirs to close. Check `ownedByCaller` before using one.
- Never the user's tabs, their Chrome, or another thread's tabs.

## Your jobs until they end
- Every turn, check your own jobs. `audit.mjs` marks LONG: a browser seat 30+ min, a test 25+, a build 15+, Blender or a render 45+, a queue wait 10+. Stop and diagnose what overran, move a long-queued job to the machine with room, and say what you did.
- Killing a run kills all of it: its browser, Vite and children by command line, and restore any file it was writing (`git checkout -- <file>`, your own checkout) before the checkout or seat is reused.

## Never
- Stop a process you or your lane didn't start, or the user's (their servers, editors, browsers, games, calls). Name a suspected orphan (PID, command line, why) in one line to your Lead.
- Kill by image name (`taskkill /im node.exe`).
- Delete other agents' worktrees, caches, clips or user data.

## Checking yourself
- `heavy.mjs --status`: RAM, commit, every slot's owner.
- Your processes: `Get-CimInstance Win32_Process | ? CommandLine -like '*<your worktree>*' | select ProcessId,Name,@{n='MB';e={[int]($_.WorkingSetSize/1MB)}}`.
