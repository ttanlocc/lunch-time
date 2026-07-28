// server/src/routes/insights.js
//
// Read-only analytics + AI suggestion endpoints.
//   GET /api/insights/dashboard          → deterministic numbers (no LLM)
//   GET /api/insights/daily-suggestion   → cached AI suggestion (LLM once/day)
//   GET /api/insights/person/:name       → one person's profile
//
// The dashboard never triggers the LLM. The suggestion is cached per day in
// insights_cache; pass ?refresh=1 to force a regenerate.

import { Router } from 'express';
import {
  getOverview,
  getLongestUneaten,
  getTopDishes,
  getRotationSuggestion,
  getSpendingStats,
  getPersonProfile,
} from '../services/foodAnalyzer.js';
import { isAiConfigured, chatWithLex, chatWithLexStream } from '../services/aiAnalyst.js';
import { getWeatherSnapshot } from '../services/weather.js';
import { WIDGET_TYPES } from '../services/widgetCatalog.js';
import { resolveDailySuggestion } from '../services/widgetData.js';
import { logChatTurn, logChatFeedback } from '../services/chatLog.js';
import { randomUUID } from 'crypto';

export const insightsRouter = Router();

insightsRouter.get('/dashboard', async (req, res) => {
  try {
    res.json({
      overview: getOverview(),
      longestUneaten: getLongestUneaten({ limit: 15 }),
      topDishes: getTopDishes({ limit: 10 }),
      recentTop: getTopDishes({ limit: 8, sinceDays: 30 }),
      rotation: getRotationSuggestion({ limit: 8 }),
      spending: getSpendingStats(),
      weather: await getWeatherSnapshot(),
      aiConfigured: isAiConfigured(),
    });
  } catch (err) {
    console.error('[insights] dashboard error:', err);
    res.status(500).json({ error: 'Failed to build dashboard' });
  }
});

insightsRouter.get('/daily-suggestion', async (req, res) => {
  const refresh = req.query.refresh === '1' || req.query.refresh === 'true';
  try {
    res.json(await resolveDailySuggestion({ refresh }));
  } catch (err) {
    console.error('[insights] daily-suggestion error:', err);
    res.status(500).json({ error: 'Failed to generate suggestion' });
  }
});

// Fixed 3-widget board for the Lex tab. Each widget resolved independently
// (allSettled, not all) so one failing resolver degrades to a single fallback
// card instead of 500-ing the whole row.
const LEX_BOARD = [
  { type: 'weather',      title: 'Thời tiết' },
  { type: 'suggestion',   title: 'Gợi ý hôm nay' },
  { type: 'golden_spoon', title: 'Thìa Vàng tuần này' },
];

insightsRouter.get('/lex-board', async (req, res) => {
  const settled = await Promise.allSettled(LEX_BOARD.map(w => WIDGET_TYPES[w.type].resolve()));
  const widgets = LEX_BOARD.map((w, i) => {
    const s = settled[i];
    if (s.status === 'fulfilled') return { type: w.type, title: w.title, data: s.value ?? null };
    console.error(`[insights] lex-board ${w.type} failed:`, s.reason);
    return { type: w.type, title: w.title, data: null, error: String(s.reason?.message || s.reason) };
  });
  res.json({ widgets });
});

// Chat với Lex: a member asks free-form questions about their own eating history
// ("thứ 3 tôi có ăn không?", "tuần trước tôi ăn gì?"). The model calls read-only
// tools to answer — see chatWithLex/aiAnalyst.js. history is capped server-side
// so a long client transcript can't blow up the prompt.
insightsRouter.post('/chat', async (req, res) => {
  const { name, message, history, taste } = req.body || {};
  if (!name || !message || typeof message !== 'string') {
    return res.status(400).json({ error: 'name and message required' });
  }
  const thread_id = req.body.thread_id || randomUUID();
  const turn_id = randomUUID();
  const started = Date.now();
  try {
    const recent = Array.isArray(history) ? history.slice(-10) : [];
    const result = await chatWithLex({ name, message, history: recent, taste: taste ?? null });
    logChatTurn({
      thread_id, turn_id, name, question: message,
      answer: result.text, source: result.source, model: result.model,
      widgets: (result.widgets || []).map(w => w.type),
      duration_ms: Date.now() - started, streamed: false, error: result.error,
    });
    res.json({ ...result, thread_id, turn_id });
  } catch (err) {
    console.error('[insights] chat error:', err);
    res.status(500).json({ error: 'chat failed' });
  }
});

// Streaming twin of /chat over Server-Sent Events. Emits:
//   event: tool   {tool}          — Lex called a read-only tool (client shows a
//                                    "đang tra…" status chip)
//   event: delta  {text}          — a chunk of the answer, as the model writes it
//   event: done   {text,widgets,source,model} — final canonical answer + slips
// X-Accel-Buffering:no keeps nginx from buffering the stream into one blob.
insightsRouter.post('/chat/stream', async (req, res) => {
  const { name, message, history, taste } = req.body || {};
  if (!name || !message || typeof message !== 'string') {
    return res.status(400).json({ error: 'name and message required' });
  }
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  const thread_id = req.body.thread_id || randomUUID();
  const turn_id = randomUUID();
  const started = Date.now();
  let ttft = null;
  const tools = [];
  try {
    const recent = Array.isArray(history) ? history.slice(-10) : [];
    const result = await chatWithLexStream(
      { name, message, history: recent, taste: taste ?? null },
      {
        onDelta: (text) => { if (ttft == null) ttft = Date.now() - started; send('delta', { text }); },
        onTool: (tool) => { tools.push(tool); send('tool', { tool }); },
      },
    );
    send('done', { text: result.text, widgets: result.widgets || [], source: result.source, model: result.model, thread_id, turn_id });
    logChatTurn({
      thread_id, turn_id, name, question: message,
      answer: result.text, source: result.source, model: result.model,
      tools, widgets: (result.widgets || []).map(w => w.type),
      ttft_ms: ttft, duration_ms: Date.now() - started, streamed: true, error: result.error,
    });
  } catch (err) {
    console.error('[insights] chat/stream error:', err);
    send('done', { text: 'Xin lỗi, Lex chưa trả lời được câu này. Thử hỏi lại nhé.', widgets: [], source: 'fallback', thread_id, turn_id });
    logChatTurn({ thread_id, turn_id, name, question: message, source: 'fallback', ttft_ms: ttft, duration_ms: Date.now() - started, streamed: true, error: String(err?.message || err) });
  }
  res.end();
});

// 👍/👎 on a Lex answer → appended to the same JSONL (type:'feedback'),
// correlated to the turn by turn_id so we can mine what users disliked.
insightsRouter.post('/chat/feedback', (req, res) => {
  const { thread_id, turn_id, name, rating, comment } = req.body || {};
  if (!turn_id || (rating !== 'up' && rating !== 'down')) {
    return res.status(400).json({ error: 'turn_id and rating (up|down) required' });
  }
  const note = typeof comment === 'string' && comment.trim() ? comment.trim().slice(0, 500) : undefined;
  logChatFeedback({ thread_id: thread_id ?? null, turn_id, name: name ?? null, rating, comment: note });
  res.json({ ok: true });
});

insightsRouter.get('/person/:name', (req, res) => {
  try {
    res.json(getPersonProfile(req.params.name));
  } catch (err) {
    console.error('[insights] person error:', err);
    res.status(500).json({ error: 'Failed to build person profile' });
  }
});
