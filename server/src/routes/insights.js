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
import { isAiConfigured } from '../services/aiAnalyst.js';
import { getWeatherSnapshot } from '../services/weather.js';
import { WIDGET_TYPES } from '../services/widgetCatalog.js';
import { resolveDailySuggestion } from '../services/widgetData.js';

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

insightsRouter.get('/person/:name', (req, res) => {
  try {
    res.json(getPersonProfile(req.params.name));
  } catch (err) {
    console.error('[insights] person error:', err);
    res.status(500).json({ error: 'Failed to build person profile' });
  }
});
