---
name: optimize-lex
description: Analyze the Lex chat telemetry log (data/lex-chat.jsonl) and improve the Lex AI assistant from real usage — 👍/👎 feedback, latency, and fallback rate. Use when the user asks to "optimize Lex", "cải thiện Lex", "phân tích feedback Lex", "câu nào bị chê / dislike", "Lex trả lời chậm / sai", review lex-chat.jsonl, or act on thumbs-down feedback.
---

# Optimize Lex from usage data

Lex is the AI chat in the "Lex" tab (see the `lex-personalization` memory). Every
completed turn and every 👍/👎 is appended to a JSONL telemetry log. This skill
turns that log into concrete improvements: find what users disliked, what's slow,
what falls back to the non-AI path, then fix the prompt / tools / UI and redeploy.

## Where the data is

`data/lex-chat.jsonl` (repo root, next to `lunch.db`; override `LEX_CHAT_LOG`).
Append-only, one JSON object per line, two record types:

- `{type:"turn", ts, thread_id, turn_id, name, question, answer, source, model, tools:[], widgets:[], ttft_ms, duration_ms, streamed, error}`
  — one per completed chat turn. `source` is `"ai"` (MiniMax answered) or
  `"fallback"` (AI unconfigured/errored). `ttft_ms` = time to first token
  (streamed turns only), `duration_ms` = total. `tools` = lunch_data tools Lex
  called; `widgets` = receipt-slip types rendered.
- `{type:"feedback", ts, thread_id, turn_id, name, rating, comment?}` — a 👍
  (`"up"`) or 👎 (`"down"`) on a turn. Join to the turn by `turn_id`. A 👎 may
  carry a free-text `comment` (the user's "what was wrong") — read it to judge
  whether the dislike is VALID before acting: a comment like "sai số nợ" is
  actionable; an empty or vague one may just be tone. Don't optimize away a
  correct answer someone disliked for taste.

If the file is missing/empty, there's simply no usage yet — say so, don't invent.

## Step 1 — run the report

```
python3 .claude/skills/optimize-lex/report.py
```

It prints: turn/feedback counts, ai-vs-fallback rate, ttft/duration
avg·median·p95, tool + widget frequency, and — most important — every
👎 turn with its question / answer / tools so you can see exactly what went
wrong. (Pass a path arg to analyze a different log.)

## Step 2 — diagnose patterns

Look for:
- **Disliked turns (👎)** — read the question+answer. Is it wrong data, a wrong
  tool choice, a contradiction (see the paid-status gotcha in `lex-personalization`),
  missing context, or just tone? Group them — one root cause often explains several.
- **High `fallback` rate** — MiniMax erroring or unconfigured. Check `server/.env`
  (`MINIMAX_*`) and `pm2 logs lunchtime` for the real error before touching code.
- **Latency** — high `ttft_ms`/`duration_ms`. Usually the model + tool round-trips.
  Fewer/clearer tools, tighter prompt, or capping `maxTurns` can help; measure again.
- **Tool gaps** — questions where Lex had no good tool (answered vaguely or wrong).
  That's a signal to add a read-only tool.

## Step 3 — apply the fix (where each lives)

(paths below are repo-root-relative — commands and Claude both run from the repo root):

- **Behaviour / wording / tool-choice rules** → `CHAT_SYSTEM_PROMPT` in
  `server/src/services/aiAnalyst.js`.
- **New / changed data tool** → add a read-only query in
  `server/src/services/foodAnalyzer.js` (or `server/src/services/debtCalculator.js`
  for debt), then register it as a tool in `server/src/services/dbTools.js`
  (tool + `TOOL_NAMES`), and mention it in `CHAT_SYSTEM_PROMPT`. Keep it READ-ONLY
  (`getReadonlyDb()`); never expose a mutation.
- **Widget / receipt-slip rendering, chat UX** → `Slip` / `LexThread` /
  `FeedbackBar` in `client/src/pages/InsightsPage.jsx`.
- **What gets logged** → `server/src/services/chatLog.js` + the `/chat` and
  `/chat/stream` routes in `server/src/routes/insights.js`.

Prefer prompt + tool fixes over hard-coding answers. Never let the model compute
numbers — it must call a tool; the tool's SQL is the source of truth (this is why
answers match the debt board).

## Step 4 — verify, then redeploy

- Lint FE: `cd client && npx eslint src/pages/InsightsPage.jsx` → exit 0. Mind the
  `react-hooks/set-state-in-effect` and `purity` (no `Date.now()`/`Math.random()`
  in render) rules this repo enforces.
- Backend change → `pm2 reload lunchtime` (NOT a restart of anything else), then
  reproduce the fixed case against `POST /api/insights/chat/stream` with a real
  name (get one: `curl -s localhost:3001/api/debts/people | python3 -c "import sys,json;print(json.load(sys.stdin)['people'][0]['name'])"`).
  Confirm `source:"ai"` and the answer is now correct.
- FE change → `cd client && npm run build`. **This IS the production deploy**
  (nginx serves `client/dist`) — only run it when the user wants to ship. Tell
  them to hard-refresh.

## Step 5 — record what you learned

Update the `lex-personalization` memory with any new gotcha, tool, or decision so
the next session starts ahead. If you changed the log schema, update this skill.

## Notes

- The server is a long-running pm2 process (`lunchtime`, port 3001) — hit its API,
  don't restart the box.
- The log is best-effort telemetry (fire-and-forget); a few missing fields on old
  lines are normal — the report tolerates them.
- Feedback is anonymous-ish (`name` is the self-picked identity, no login). Treat
  it as signal, not ground truth — a single 👎 may just be tone.
