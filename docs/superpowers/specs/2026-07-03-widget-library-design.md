# Lex Widget Library — Design Spec

**Date:** 2026-07-03
**Scope:** `client/src/widgets/` library + 3 widgets (weather, suggestion, golden spoon) on the Lex tab
**Status:** Draft — pending spec file review

---

## 1. Goal

Build a reusable **widget library**: small, data-driven UI components with a shared descriptor contract, so that both a static page (today) and an AI agent (later) can render the same widgets by sending `{ type, source, params }` rather than hand-built markup.

This round ships the **infrastructure** (registry, renderer, grid, theme, catalog, validation) plus **3 widgets** that replace the top of the Lex tab: **Thời tiết** (weather), **Gợi ý** (suggestion), **Thìa Vàng** (golden spoon — top-3 weekly spenders). Everything below stays as-is.

Reference: two dashboard mockups imported from Claude Design ("AI Dashboard.html"), merged — hero-stat energy from mockup 1 + warmth (weather card, named avatars) from mockup 2. Full widget inventory extracted from both mockups is documented in-thread; only 3 are built now (see §2).

---

## 2. Scope

| ✅ In scope | ❌ Out of scope (future work, §11) |
|---|---|
| Full library skeleton: theme, registry, `WidgetRenderer`, `WidgetGrid`, primitives, catalog, `validateDescriptor` | The other 9 widgets from the mockups (stat card, donut gauge, bar/line charts, ranked list, heatmap, category donut, segmented bar, progress bar) |
| 3 widgets: `weather`, `suggestion`, `golden_spoon` | Wiring `aiAnalyst.js` to emit descriptors (contract is designed for it, not built) |
| New resolver: top-3 weekly spend ("golden spoon") | "Monthly budget limit" concept (no data model for it yet) |
| Route `GET /api/insights/lex-board` | Delta/trend badges (▲12%) — needs a defined comparison period |
| Replace the top of `InsightsPage.jsx` (header weather pill + full-width `SuggestionCard`) with the 3-widget row | Migrating `OverviewStrip` / `WeatherForecast` / `LongestUneaten` / `Rotation` / `Spending` into the library |
| Isolated test + deploy | New automated test suite (repo has none; follow existing curl + Playwright discipline) |

---

## 3. Architecture

Three layers, extending the existing split (`foodAnalyzer` = numbers, `aiAnalyst` = words):

```
┌─ NUMBERS ──────────────────────────────────────────────────┐
│ foodAnalyzer.js (existing)  +  widgetData.js (NEW)          │
│   → plain-SQL resolvers: getGoldenSpoon()                   │
└───────────────────────────────────────────────────────────┘
                         │ bind real data
┌─ WIDGET (NEW) ────────────────────────────────────────────┐
│ server: widgetCatalog.js → WIDGET_TYPES registry            │
│         routes/insights.js → GET /lex-board                 │
│ client: src/widgets/ → registry + "dumb" components         │
└───────────────────────────────────────────────────────────┘
                         │ (future) agent emits descriptors
┌─ WORDS ────────────────────────────────────────────────────┐
│ aiAnalyst.js (NOT touched this round)                        │
└───────────────────────────────────────────────────────────┘
```

### New files
```
server/src/services/widgetData.js       # getGoldenSpoon() resolver + startOfWeek() helper
server/src/services/widgetCatalog.js    # WIDGET_TYPES map + validateDescriptor()

client/src/widgets/theme.js             # shared tokens (same hex as DebtPage/HistoryPage C)
client/src/widgets/registry.jsx         # { type → component }
client/src/widgets/WidgetRenderer.jsx   # descriptor → component, with error boundary + fallback
client/src/widgets/WidgetGrid.jsx       # 3-column responsive row
client/src/widgets/primitives/Card.jsx
client/src/widgets/primitives/Avatar.jsx
client/src/widgets/primitives/SectionTitle.jsx
client/src/widgets/widgets/WeatherCard.jsx
client/src/widgets/widgets/SuggestionCard.jsx
client/src/widgets/widgets/GoldenSpoon.jsx
```

### Modified files
```
server/src/routes/insights.js   # + GET /lex-board
client/src/lib/api.js           # + getLexBoard()
client/src/pages/InsightsPage.jsx  # top row replaced; rest untouched
```

**Why a shared `theme.js` inside the library (breaking the per-file-token-duplication convention):** that convention exists at the *page* level (2-3 files). This library will eventually hold ~12 small widget files; duplicating the same token object into each would be the convention taken past the point it was solving a problem. `InsightsPage.jsx` keeps its own local `C` unchanged — only the new subsystem shares one.

---

## 4. Data contract

Every widget is described by one **descriptor**:

```ts
{
  type: string,        // catalog key, e.g. "weather"
  title?: string,       // optional override; catalog has a default
  subtitle?: string,
  params?: object,      // resolver arguments (none needed by any v1 widget)
  data: object | array | null,  // bound by the server; null if the resolver failed
  error?: string,       // present only if data is null
}
```

`widgetCatalog.js`:
```js
export const WIDGET_TYPES = {
  weather:     { label: 'Thời tiết',  resolve: () => getWeatherSnapshot() },
  suggestion:  { label: 'Gợi ý',      resolve: () => getSuggestionWidgetData() },
  golden_spoon:{ label: 'Thìa Vàng',  resolve: () => getGoldenSpoon() },
};

export function validateDescriptor({ type }) {
  return Object.prototype.hasOwnProperty.call(WIDGET_TYPES, type);
}
```

v1 keeps `validateDescriptor` to a type-existence check only — every descriptor this round is server-authored (hardcoded array of 3), so there's no untrusted input yet. When `aiAnalyst.js` starts emitting descriptors, this is the seam where per-type `zod` param schemas get added (same pattern `dbTools.js` already uses for tool params) — not built now, YAGNI.

**Client mirror**, `registry.jsx`:
```js
export const WIDGET_REGISTRY = {
  weather: WeatherCard,
  suggestion: SuggestionCard,
  golden_spoon: GoldenSpoon,
};
```

---

## 5. Server: new resolver (`widgetData.js`)

**`getGoldenSpoon(db = getDb())`** — top-3 people by spend, current week (Mon–Sun, local time):

```sql
SELECT person_name, SUM(price) AS total_spent, COUNT(*) AS meals
FROM orders
WHERE date >= @weekStart
GROUP BY person_name
ORDER BY total_spent DESC
LIMIT 3
```

`weekStart` computed in JS (Monday of the current local week), mirroring the existing `today()` helper's timezone-correction pattern already duplicated in `foodAnalyzer.js` and `insights.js`:

```js
function startOfWeek(d = new Date()) {
  const day = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  const monday = new Date(d);
  monday.setDate(d.getDate() - day);
  const tz = monday.getTimezoneOffset() * 60000;
  return new Date(monday - tz).toISOString().slice(0, 10);
}
```

`rank` isn't a SQL column — `getGoldenSpoon` maps the query result in JS: `rows.map((r, i) => ({ rank: i + 1, name: r.person_name, total_spent: r.total_spent, meals: r.meals }))`. Returns 0 to 3 rows. Zero/partial rows (early in the week) is a **valid empty state**, not an error.

**`getSuggestionWidgetData()`** — thin wrapper that reuses the *exact* cache-or-generate logic already in `insights.js`'s `/daily-suggestion` handler (no new caching logic). Returns `{ headline, meta, chips, text, source, model, cached }` where `headline`/`meta`/`chips` are derived from `highlights` (`highlights[0]` → headline + meta string, rest → chips) — same `highlights` the route already computes today.

**Weather** needs no new resolver — `getWeatherSnapshot()` (existing) is passed straight through as widget `data`.

---

## 6. Server: route

**`GET /api/insights/lex-board`**

```json
{
  "widgets": [
    { "type": "weather", "title": "Thời tiết", "data": { "location": "...", "current": {...}, "forecast": [...] } },
    { "type": "suggestion", "title": "Gợi ý hôm nay", "data": { "headline": "Pizza hải sản", "meta": "58 ngày chưa gọi · Món Ý", "chips": [...], "text": "...", "source": "ai", "cached": true } },
    { "type": "golden_spoon", "title": "Thìa Vàng tuần này", "data": [{ "rank": 1, "name": "Tùng", "total_spent": 580000, "meals": 6 }] }
  ]
}
```

Each entry resolved independently (`Promise.allSettled`, not `Promise.all`) — one resolver failing must not take down the other two. A failed resolver produces `{ type, title, data: null, error: "..." }`.

The suggestion widget's **refresh button keeps its existing wiring** — it calls `/daily-suggestion?refresh=1` directly (unchanged) and updates only that one widget's local state, rather than re-fetching `/lex-board`. Regenerating a suggestion (LLM call) shouldn't force a refetch of weather/golden-spoon.

---

## 7. Client: library skeleton

- **`theme.js`** — exports `C` (identical hex values to `DebtPage.jsx`), `getPalette(name)`, `getInitial(name)` (moved verbatim from `InsightsPage.jsx`).
- **`primitives/Card.jsx`** — the existing `card` style object, as a component.
- **`primitives/Avatar.jsx`** — circle + initial + hash palette (today's inline pattern in `Spending`/`HighlightChips`), reused by `GoldenSpoon`.
- **`primitives/SectionTitle.jsx`** — icon + label row (today's `sectionTitle` style).
- **`WidgetRenderer.jsx`** — looks up `descriptor.type` in `WIDGET_REGISTRY`; unknown type or `data === null` → small fallback card ("chưa có dữ liệu" / "widget không hỗ trợ"); known + present → renders inside a `WidgetErrorBoundary` (class component) so one widget throwing shows a fallback card instead of blanking the page.
- **`WidgetGrid.jsx`** — `grid-template-columns: repeat(auto-fit, minmax(240px, 1fr))`, 3 columns at desktop width, matching both mockups' top row.

---

## 8. The 3 widgets

**`WeatherCard`** — today's temp large, "cảm giác X°", condition + icon (`getWeatherIcon(weather_code)`, existing `insightIcons.js`), rain-chance line sourced from `forecast[1]` (tomorrow) with its weekday label — matches the mockup showing a different day's abbreviation ("T7") than today, read as a one-day-ahead heads-up rather than today's own number (today's `current` has no rain-probability field, only `forecast[i].rain_chance_pct`).

**`SuggestionCard`** — `headline` large (dish name), `meta` as subtitle (days-since · category), `chips` row (reuses today's `HighlightChips` rendering, moved into this widget file — it's suggestion-specific, not a cross-widget primitive), prose as smaller supporting text, refresh icon button (own wiring, §6), source badge (AI/fallback) unchanged from today's logic.

**`GoldenSpoon`** — 🥄 title, podium-style list of 1-3 rows (rank badge, `Avatar`, name, `total_spent` formatted VND, `meals` as small subtitle). Rank 1 gets an accent-colored left border plus a slightly larger `Avatar`; ranks 2-3 render plain. Empty array → "Chưa có dữ liệu tuần này" empty state, not an error.

---

## 9. `InsightsPage.jsx` integration

**Removed:** the header's `WeatherBadge` pill (redundant with the new `WeatherCard`), the inline `SuggestionCard`/`HighlightChips`/`WeatherBadge` function definitions (superseded by library versions).

**Added:** one `<WidgetGrid descriptors={boardWidgets} />` call at the top of the scrollable body, fed by a new `loadBoard()` effect calling `api.getLexBoard()`.

**Unchanged:** `<h1>Lex</h1>` branding in the fixed header, `OverviewStrip`, `WeatherForecast`, `LongestUneaten`, `Rotation`, `Spending` — all stay exactly as they are today, below the new row.

---

## 10. Error handling

- Each server resolver wrapped individually (`Promise.allSettled`) — a thrown error becomes `{ data: null, error }` for that one widget only.
- Client `WidgetRenderer` never lets a single widget's render error propagate — wrapped in a `WidgetErrorBoundary`.
- Unknown `type` (forward-compat for when the agent can emit new types before the client registry knows them) → generic fallback card, not a crash.
- Weather already returns `null` gracefully on upstream failure (existing behavior) — widget shows its empty state.
- Golden Spoon empty week → empty state, explicitly not styled as an error.

---

## 11. Testing plan

Same discipline as prior rounds (no test runner in this repo):
1. Isolated: scratch backend on `:3999` + `vite dev --port 5183` with `vite.config.js` proxy override via `LUNCH_API_PROXY_TARGET`.
2. `curl localhost:3999/api/insights/lex-board` — verify shape, verify one resolver failing doesn't 500 the whole response.
3. Playwright: navigate to the Lex tab, screenshot, `browser_console_messages` (0 errors), confirm real data (weather temp, actual suggestion, actual top-3 spenders).
4. Revert `vite.config.js`, verify via `git diff --stat`, clean up scratch processes + screenshots.
5. Build + deploy (`npm run build`; `pm2 restart lunchtime` needed this round since backend files change), re-verify live.

---

## 12. Explicitly out of scope / future work

- **Remaining 9 widgets** (stat card, donut gauge, bar/line charts, ranked list, heatmap, category donut, segmented bar, progress bar) — each is "add one file + one registry line" once the skeleton exists.
- **Wiring `aiAnalyst.js`** to emit descriptors instead of prose — the contract (`{type, source, params}`, catalog, validate) is shaped for this, but no agent changes happen this round.
- **Per-type `zod` param validation** in `validateDescriptor` — add when descriptors start coming from an untrusted source (the agent).
- **"Monthly budget limit"** — no data model exists for a limit; needs a product decision (who sets it, per-person or team-wide) before it can be a widget.
- **Delta/trend badges (▲12%)** — needs an explicit comparison period definition (vs. last week? last month?) before it can be built honestly.
- **Migrating existing sections** (`OverviewStrip` etc.) into the library — left as-is; only touch if/when they need to change anyway.
