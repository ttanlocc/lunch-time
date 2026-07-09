// server/src/services/widgetData.js
//
// "Numbers brain" resolvers backing the Lex board widgets. Same discipline as
// foodAnalyzer.js: plain SQL, always correct, no LLM in the SQL paths. Each
// resolver takes an optional db handle (default getDb()) so a scratch db can be
// injected in tests.
//
// This file also owns the daily-suggestion cache-or-generate logic, moved
// verbatim out of routes/insights.js so there is exactly one copy (the route
// and the widget resolver both call resolveDailySuggestion()).

import { getDb } from '../db/index.js';
import { getSuggestionContext } from './foodAnalyzer.js';
import { generateDailySuggestion } from './aiAnalyst.js';

const DAILY_KIND = 'daily_suggestion';

// Local-timezone YYYY-MM-DD for "today". Same correction foodAnalyzer.js /
// insights.js already duplicate — kept local here on purpose (per-file today()
// is the established convention in this repo).
function today() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0, 10);
}

// Monday (local) of the current week as YYYY-MM-DD.
export function startOfWeek(d = new Date()) {
  const day = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  const monday = new Date(d);
  monday.setDate(d.getDate() - day);
  const tz = monday.getTimezoneOffset() * 60000;
  return new Date(monday - tz).toISOString().slice(0, 10);
}

// Top-3 spenders for the current week (Mon–Sun). Returns 0–3 rows; a partial or
// empty result early in the week is a valid empty state, not an error. `rank` is
// assigned in JS, not SQL.
export function getGoldenSpoon(db = getDb()) {
  const weekStart = startOfWeek();
  const rows = db.prepare(`
    SELECT person_name, SUM(price) AS total_spent, COUNT(*) AS meals
    FROM orders
    WHERE date >= @weekStart
    GROUP BY person_name
    ORDER BY total_spent DESC
    LIMIT 3
  `).all({ weekStart });
  return rows.map((r, i) => ({
    rank: i + 1,
    name: r.person_name,
    total_spent: r.total_spent,
    meals: r.meals,
  }));
}

// The 1-3 dishes the suggestion is grounded in (rotation first, then longest
// uneaten), deduped by name. Moved verbatim from routes/insights.js.
export function buildHighlights(ctx) {
  const seen = new Set();
  const picks = [];
  for (const d of [...ctx.rotationCandidates, ...ctx.longestUneaten]) {
    if (!d?.name || seen.has(d.name)) continue;
    seen.add(d.name);
    picks.push({ name: d.name, category: d.category, days_since: d.days_since, times_eaten: d.times_eaten ?? null });
    if (picks.length >= 3) break;
  }
  return picks;
}

// Cache-or-generate the daily suggestion. Moved verbatim from the /daily-suggestion
// route handler — the ONLY copy of this logic now. Returns the same shape the
// route used to return.
export async function resolveDailySuggestion({ refresh = false, db = getDb() } = {}) {
  const date = today();
  if (!refresh) {
    const cached = db.prepare(
      'SELECT content, source, model, created_at FROM insights_cache WHERE date = ? AND kind = ?'
    ).get(date, DAILY_KIND);
    if (cached) {
      return {
        date, text: cached.content, source: cached.source, model: cached.model,
        cached: true, createdAt: cached.created_at,
        highlights: buildHighlights(getSuggestionContext()),
      };
    }
  }
  const context = getSuggestionContext();
  const result = await generateDailySuggestion(context);
  db.prepare(`
    INSERT INTO insights_cache (date, kind, content, source, model)
    VALUES (@date, @kind, @content, @source, @model)
    ON CONFLICT(date, kind) DO UPDATE SET
      content = excluded.content, source = excluded.source,
      model = excluded.model, created_at = datetime('now')
  `).run({ date, kind: DAILY_KIND, content: result.text, source: result.source, model: result.model });
  return { date, text: result.text, source: result.source, model: result.model, cached: false, highlights: buildHighlights(context) };
}

// Widget-shaped suggestion for the board: the daily payload plus headline / meta
// / chips derived from highlights, so the card renders without re-deriving.
// NOTE: SuggestionCard.jsx#toCardShape mirrors this derivation for its refresh
// path — keep the two in sync.
export async function getSuggestionWidgetData(db = getDb()) {
  const s = await resolveDailySuggestion({ refresh: false, db });
  const [head, ...rest] = s.highlights || [];
  const metaBits = [];
  if (head?.days_since != null) metaBits.push(`${head.days_since} ngày chưa gọi`);
  if (head?.category) metaBits.push(head.category);
  return {
    headline: head?.name ?? null,
    meta: metaBits.join(' · ') || null,
    chips: rest,
    text: s.text, source: s.source, model: s.model, cached: s.cached,
    highlights: s.highlights,
  };
}
