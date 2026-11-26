---
name: token-economy
description: Keeps token use low without losing quality. Cost is roughly turns times context size, so it covers one blocking wait instead of polling, ranged reads, batched calls, images out of context, trimmed output, short messages, filtered thread lists and successors over giant sessions. Use at the start of every session, before reading big files or images, before waiting on anything, and when writing briefs or messages.
---

# Token economy

Every tool call re-sends the whole context, so the bill is about turns × context size. A scan of 30 sessions found the cost in big contexts (300k+), polling (12% of tokens), whole-file re-reads, images kept in context, single tiny calls and unfiltered thread lists.

## Rules
1. **One blocking wait, never a poll.** Start the job with `run_in_background`, then `t3_background_wait` once, or one Bash call with an until-loop and a long timeout. Every wait also ends on failure (pid gone, an exit, "error", "refused", "FAIL"), not only on success text. Never `sleep` and check in a new turn.
2. **Read by range:** `grep -n`, then `Read` with offset and limit. Never re-read a file to check your own edit.
3. **Batch** independent calls in one message or one shell command.
4. **Images:** numbers first (pixel counts, curves, sizes). To look, build one contact sheet (ffmpeg `tile`, 8-16 frames at about 320 px). Never open the same image twice.
5. **Trim output** (`head`, `tail`, `cut -c1-200`, `grep -c`, `--stat`); never dump whole logs or reports.
6. **Messages:** milestones, decisions, or blocks over 30 minutes only; paths instead of pasted content. Waiting: wait inside the turn rather than sending a status line.
7. **Successors:** a lane ends at 2 context summaries (`project-orchestration`). Keep `CLAUDE_CODE_AUTO_COMPACT_WINDOW=200000` in a project's `.claude/settings.json`, and the status current so a summary loses nothing.
8. **Effort:** as `delegation-routing`; routine re-runs and bookkeeping never need more than medium.

## For the Lead
- Filter `t3_thread_list` (`statuses`, `limit` 10-15, `titleContains`); `t3_thread_read` only for detail.
- Answer routine notices with no tool calls; put standing rules in skills and briefs, not repeated sends.
- Waste audit: `look at what each thread spent since the last audit and why`.
