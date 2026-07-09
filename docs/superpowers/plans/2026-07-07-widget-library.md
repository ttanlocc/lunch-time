# Lex Widget Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable, descriptor-driven widget library under `client/src/widgets/` and ship 3 widgets (weather, suggestion, golden spoon) that replace the top of the Lex tab, fed by a new `GET /api/insights/lex-board` route.

**Architecture:** Three layers. NUMBERS: a new `widgetData.js` holds plain-SQL resolvers (top-3 weekly spend) plus the extracted daily-suggestion cache logic. WIDGET: `widgetCatalog.js` maps `type → { label, resolve }`; the route resolves each widget independently via `Promise.allSettled` and returns `{ widgets: [{ type, title, data, error? }] }`. CLIENT: `WidgetRenderer` looks up `type` in a registry, guards `data == null` and unknown types with a fallback card, and wraps each widget in an error boundary so one failure can't blank the page.

**Tech Stack:** Node + Express + better-sqlite3 (server), React 18 + inline-style design tokens + lucide-react + Vite (client). No test runner in this repo — verification is `curl` + Playwright + `npm run build`, matching prior rounds.

---

## Reference: spec

Source spec: `docs/superpowers/specs/2026-07-03-widget-library-design.md`. Read it once before starting. This plan is the executable form of that spec.

## Key design decisions (read before Task 1)

1. **Suggestion derivation lives in two mirrored places, by necessity.** The board (`/lex-board`) binds a fully-derived suggestion payload (`headline`/`meta`/`chips`) server-side in `getSuggestionWidgetData()`. The refresh button hits `/daily-suggestion?refresh=1` directly (per spec §6, so regenerating one widget doesn't refetch weather + golden-spoon), and that route returns only `highlights` — so `SuggestionCard.jsx` re-derives the same three fields client-side via `toCardShape()`. The two derivations are ~5 lines each and are kept intentionally in sync with a cross-referencing comment. Do **not** try to "DRY" them across the server/client boundary — this repo has no shared module setup between `server/` and `client/`.

2. **The daily-suggestion cache logic is extracted, not duplicated.** Task 1 moves the exact cache-read/generate/upsert block out of the `/daily-suggestion` route handler into `resolveDailySuggestion()` in `widgetData.js`, then Task 3 rewires the old route to call it. This keeps "no new caching logic" (spec §5) literally true — there is exactly one copy.

3. **`theme.js` centralises tokens for the new subsystem only.** `InsightsPage.jsx` keeps its own local `C`, `getPalette`, `getInitial`, `weatherAccent` unchanged — the sections that stay (`OverviewStrip`, `WeatherForecast`, `LongestUneaten`, `Rotation`, `Spending`) still use them. The widget library gets its own copy in `theme.js`. This duplication between page and library is deliberate (spec §3).

4. **The `.spin` keyframe is global.** It is defined in the `<style>` block of `InsightsPage.jsx`, which is always mounted as the parent of `WidgetGrid`. Widgets can use `className="spin"` without redefining it.

---

## File structure

**Server — create:**
- `server/src/services/widgetData.js` — `startOfWeek()`, `getGoldenSpoon()`, `today()`, `buildHighlights()`, `resolveDailySuggestion()`, `getSuggestionWidgetData()`
- `server/src/services/widgetCatalog.js` — `WIDGET_TYPES` map + `validateDescriptor()`

**Server — modify:**
- `server/src/routes/insights.js` — add `GET /lex-board`; rewire `GET /daily-suggestion` to call `resolveDailySuggestion()`; delete the now-moved `today()` + `buildHighlights()`

**Client — create:**
- `client/src/widgets/theme.js`
- `client/src/widgets/primitives/Card.jsx`
- `client/src/widgets/primitives/Avatar.jsx`
- `client/src/widgets/primitives/SectionTitle.jsx`
- `client/src/widgets/registry.jsx`
- `client/src/widgets/WidgetRenderer.jsx`
- `client/src/widgets/WidgetGrid.jsx`
- `client/src/widgets/widgets/WeatherCard.jsx`
- `client/src/widgets/widgets/SuggestionCard.jsx`
- `client/src/widgets/widgets/GoldenSpoon.jsx`

**Client — modify:**
- `client/src/lib/api.js` — add `getLexBoard()`
- `client/src/pages/InsightsPage.jsx` — add `WidgetGrid` row; remove header weather pill + inline `SuggestionCard`/`HighlightChips`/`WeatherBadge`

---

## Task 1: Server resolvers (`widgetData.js`)

**Files:**
- Create: `server/src/services/widgetData.js`

- [ ] **Step 1: Write the resolver module**

Create `server/src/services/widgetData.js`:

```js
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
```

- [ ] **Step 2: Syntax-check the module**

Run: `cd server && node --check src/services/widgetData.js`
Expected: no output, exit 0.

- [ ] **Step 3: Smoke-test the SQL resolver against the real db**

Run:
```bash
cd server && node -e "
import('./src/services/widgetData.js').then(async m => {
  console.log('startOfWeek:', m.startOfWeek());
  console.log('goldenSpoon:', JSON.stringify(m.getGoldenSpoon(), null, 2));
  process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
"
```
Expected: a `YYYY-MM-DD` Monday date and an array of 0–3 `{ rank, name, total_spent, meals }` rows, ordered by `total_spent` desc. No throw.

- [ ] **Step 4: Commit**

```bash
git add server/src/services/widgetData.js
git commit -m "feat(widgets): add widgetData resolvers (golden spoon + suggestion payload)"
```

---

## Task 2: Server catalog (`widgetCatalog.js`)

**Files:**
- Create: `server/src/services/widgetCatalog.js`

- [ ] **Step 1: Write the catalog**

Create `server/src/services/widgetCatalog.js`:

```js
// server/src/services/widgetCatalog.js
//
// The widget registry, server side: type → { label, resolve }. The Lex board
// resolves widgets through this map. validateDescriptor() is a type-existence
// check only for v1 — every descriptor this round is server-authored, so there
// is no untrusted input yet. When aiAnalyst.js starts emitting descriptors, this
// is where per-type zod param schemas get added (same pattern dbTools.js uses).

import { getWeatherSnapshot } from './weather.js';
import { getSuggestionWidgetData, getGoldenSpoon } from './widgetData.js';

export const WIDGET_TYPES = {
  weather:      { label: 'Thời tiết', resolve: () => getWeatherSnapshot() },
  suggestion:   { label: 'Gợi ý',     resolve: () => getSuggestionWidgetData() },
  golden_spoon: { label: 'Thìa Vàng', resolve: () => getGoldenSpoon() },
};

export function validateDescriptor({ type } = {}) {
  return Object.prototype.hasOwnProperty.call(WIDGET_TYPES, type);
}
```

- [ ] **Step 2: Syntax-check**

Run: `cd server && node --check src/services/widgetCatalog.js`
Expected: no output, exit 0.

- [ ] **Step 3: Verify validateDescriptor**

Run:
```bash
cd server && node -e "
import('./src/services/widgetCatalog.js').then(m => {
  console.log('weather ->', m.validateDescriptor({ type: 'weather' }));   // true
  console.log('nope ->', m.validateDescriptor({ type: 'nope' }));         // false
  console.log('empty ->', m.validateDescriptor({}));                      // false
  console.log('types:', Object.keys(m.WIDGET_TYPES));
});
"
```
Expected: `true`, `false`, `false`, and `[ 'weather', 'suggestion', 'golden_spoon' ]`.

- [ ] **Step 4: Commit**

```bash
git add server/src/services/widgetCatalog.js
git commit -m "feat(widgets): add server widget catalog + validateDescriptor"
```

---

## Task 3: Server route + rewire (`insights.js`)

**Files:**
- Modify: `server/src/routes/insights.js`

- [ ] **Step 1: Update imports**

In `server/src/routes/insights.js`, add these imports after the existing `getWeatherSnapshot` import (line 23):

```js
import { WIDGET_TYPES } from '../services/widgetCatalog.js';
import { resolveDailySuggestion } from '../services/widgetData.js';
```

- [ ] **Step 2: Delete the moved helpers**

Delete the `today()` function (lines 29–33) and the `buildHighlights()` function (lines 39–49) — both now live in `widgetData.js`. Keep the `DAILY_KIND` constant deletion too if it becomes unused after Step 3 (it will — remove `const DAILY_KIND = 'daily_suggestion';` on line 27).

- [ ] **Step 3: Rewire the `/daily-suggestion` route**

Replace the entire `insightsRouter.get('/daily-suggestion', ...)` handler (original lines 69–103) with:

```js
insightsRouter.get('/daily-suggestion', async (req, res) => {
  const refresh = req.query.refresh === '1' || req.query.refresh === 'true';
  try {
    res.json(await resolveDailySuggestion({ refresh }));
  } catch (err) {
    console.error('[insights] daily-suggestion error:', err);
    res.status(500).json({ error: 'Failed to generate suggestion' });
  }
});
```

- [ ] **Step 4: Add the `/lex-board` route**

Add this handler immediately after the `/daily-suggestion` handler:

```js
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
```

- [ ] **Step 5: Syntax-check**

Run: `cd server && node --check src/routes/insights.js`
Expected: no output, exit 0.

- [ ] **Step 6: Boot the server and curl both routes**

Run (from repo root, in one shell):
```bash
cd server && PORT=3999 node index.js &
sleep 2
curl -s localhost:3999/api/insights/lex-board | head -c 1200; echo
curl -s localhost:3999/api/insights/daily-suggestion | head -c 400; echo
kill %1
```
Expected: `/lex-board` returns `{"widgets":[{"type":"weather",...},{"type":"suggestion",...},{"type":"golden_spoon",...}]}` — three entries, each with `type`, `title`, and either `data` (object/array) or `data:null,error`. `/daily-suggestion` returns the same shape as before (`text`, `source`, `highlights`, `cached`, …). Neither 500s.

- [ ] **Step 7: Verify resilience — a failing resolver doesn't sink the response**

Run:
```bash
cd server && PORT=3999 LUNCH_FORCE_WEATHER_FAIL=1 node index.js &
sleep 2
# (Weather already returns null on failure, so this is a soft check: the board
#  must still return 3 widgets even when weather has no data.)
curl -s -o /dev/null -w "%{http_code}\n" localhost:3999/api/insights/lex-board
kill %1
```
Expected: `200`. (Weather resolving to `null` yields `data:null` for that one widget only; the other two still populate. There is no env flag wired for weather failure — this step just confirms the board returns 200 with weather possibly null; if weather is up, all three populate.)

- [ ] **Step 8: Commit**

```bash
git add server/src/routes/insights.js
git commit -m "feat(insights): add GET /lex-board; extract daily-suggestion into resolveDailySuggestion"
```

---

## Task 4: Client theme (`theme.js`)

**Files:**
- Create: `client/src/widgets/theme.js`

- [ ] **Step 1: Write the theme module**

Create `client/src/widgets/theme.js`:

```js
// client/src/widgets/theme.js
//
// Shared design tokens for the widget library. Same hex values as
// DebtPage.jsx / HistoryPage.jsx / InsightsPage.jsx, centralised here (not
// duplicated into each of the ~12 eventual widget files). InsightsPage.jsx keeps
// its own local copy for the sections that stay outside the library.

export const C = {
  bg:          '#fbf7f3',
  paper:       '#ffffff',
  paperWarm:   '#fbf6f1',
  ink:         '#2b2235',
  inkSoft:     '#6b5d75',
  inkMute:     '#a89aae',
  hl:          'rgba(43,34,53,0.07)',
  hlStrong:    'rgba(43,34,53,0.12)',
  rose:        '#fbe7ee',
  magenta:     '#e8a8c4',
  magentaInk:  '#a55c7d',
  magentaDeep: '#c47899',
  violet:      '#b8a4d4',
  emerald:     '#8fc1ab',
  emeraldDeep: '#5b9b7f',
  emeraldInk:  '#065f46',
  amber:       '#d4a373',
  amberSoft:   '#f6e8d6',
};

const AVATAR_PALETTES = [
  { bg: '#fce7f3', text: '#be185d' },
  { bg: '#dbeafe', text: '#1e40af' },
  { bg: '#d1fae5', text: '#065f46' },
  { bg: '#fef3c7', text: '#92400e' },
  { bg: '#ede9fe', text: '#5b21b6' },
  { bg: '#fee2e2', text: '#991b1b' },
  { bg: '#e0f2fe', text: '#0c4a6e' },
  { bg: '#f0fdf4', text: '#14532d' },
  { bg: '#fdf4ff', text: '#701a75' },
  { bg: '#fff7ed', text: '#9a3412' },
];

export function getPalette(name) {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return AVATAR_PALETTES[h % AVATAR_PALETTES.length];
}

export function getInitial(name) {
  const parts = (name || '?').trim().split(' ').filter(Boolean);
  return (parts[parts.length - 1]?.[0] ?? '?').toUpperCase();
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/widgets/theme.js
git commit -m "feat(widgets): add shared theme tokens"
```

---

## Task 5: Client primitives (`Card`, `Avatar`, `SectionTitle`)

**Files:**
- Create: `client/src/widgets/primitives/Card.jsx`
- Create: `client/src/widgets/primitives/Avatar.jsx`
- Create: `client/src/widgets/primitives/SectionTitle.jsx`

- [ ] **Step 1: Write `Card.jsx`**

Create `client/src/widgets/primitives/Card.jsx`:

```jsx
// client/src/widgets/primitives/Card.jsx
// The paper card surface used by every widget. Same style object as the
// `card` const in InsightsPage.jsx.
import { C } from '../theme.js';

export const cardStyle = {
  background: C.paper,
  borderRadius: 8,
  border: `1px solid ${C.hlStrong}`,
  padding: 16,
};

export function Card({ style, children, ...rest }) {
  return <div style={{ ...cardStyle, ...style }} {...rest}>{children}</div>;
}
```

- [ ] **Step 2: Write `Avatar.jsx`**

Create `client/src/widgets/primitives/Avatar.jsx`:

```jsx
// client/src/widgets/primitives/Avatar.jsx
// Circle + last-name initial, colored by the shared name-hash palette. Same
// pattern the Spending section uses inline today.
import { getPalette, getInitial } from '../theme.js';

export function Avatar({ name, size = 22 }) {
  const { bg, text } = getPalette(name);
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%', background: bg, color: text,
      fontSize: Math.round(size * 0.46), fontWeight: 800, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {getInitial(name)}
    </span>
  );
}
```

- [ ] **Step 3: Write `SectionTitle.jsx`**

Create `client/src/widgets/primitives/SectionTitle.jsx`:

```jsx
// client/src/widgets/primitives/SectionTitle.jsx
// Icon + label row atop a widget. Same `sectionTitle` style as InsightsPage.jsx.
import { C } from '../theme.js';

export function SectionTitle({ icon: Icon, iconColor = C.magentaInk, children, style }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 700,
      color: C.ink, marginBottom: 12, ...style,
    }}>
      {Icon && <Icon size={15} color={iconColor} />}
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add client/src/widgets/primitives/
git commit -m "feat(widgets): add Card / Avatar / SectionTitle primitives"
```

---

## Task 6: Client renderer + grid + registry

**Files:**
- Create: `client/src/widgets/registry.jsx`
- Create: `client/src/widgets/WidgetRenderer.jsx`
- Create: `client/src/widgets/WidgetGrid.jsx`

> Note: this task imports the three widget components, which are created in Tasks 7–9. Create the widget files first (Tasks 7–9) **or** stub the three imports and fill them in — the plan orders them after this task for narrative flow, but for a clean build, implement Tasks 7–9 before running the build check in Step 4 here. Subagent-driven execution: do Tasks 7, 8, 9, then this task's build check.

- [ ] **Step 1: Write `registry.jsx`**

Create `client/src/widgets/registry.jsx`:

```jsx
// client/src/widgets/registry.jsx
// Client mirror of the server catalog: type → component. Adding a widget = add
// one file + one line here.
import { WeatherCard } from './widgets/WeatherCard.jsx';
import { SuggestionCard } from './widgets/SuggestionCard.jsx';
import { GoldenSpoon } from './widgets/GoldenSpoon.jsx';

export const WIDGET_REGISTRY = {
  weather: WeatherCard,
  suggestion: SuggestionCard,
  golden_spoon: GoldenSpoon,
};
```

- [ ] **Step 2: Write `WidgetRenderer.jsx`**

Create `client/src/widgets/WidgetRenderer.jsx`:

```jsx
// client/src/widgets/WidgetRenderer.jsx
// descriptor → component. Guards three failure modes so one widget never blanks
// the page: unknown type, null data, and a runtime render throw (error boundary).
import { Component } from 'react';
import { WIDGET_REGISTRY } from './registry.jsx';
import { Card } from './primitives/Card.jsx';
import { C } from './theme.js';

function FallbackCard({ title, msg }) {
  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {title && <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{title}</div>}
      <div style={{ fontSize: 12.5, color: C.inkMute }}>{msg}</div>
    </Card>
  );
}

class WidgetErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err) {
    console.error('[widget] render error:', err);
  }
  render() {
    if (this.state.failed) return <FallbackCard title={this.props.title} msg="widget lỗi hiển thị" />;
    return this.props.children;
  }
}

export function WidgetRenderer({ descriptor }) {
  const { type, title, data } = descriptor || {};
  const Comp = WIDGET_REGISTRY[type];
  if (!Comp) return <FallbackCard title={title} msg="widget không hỗ trợ" />;
  if (data == null) return <FallbackCard title={title} msg="chưa có dữ liệu" />;
  return (
    <WidgetErrorBoundary title={title}>
      <Comp descriptor={descriptor} />
    </WidgetErrorBoundary>
  );
}
```

> `data == null` catches both `null` and `undefined`. Golden Spoon's empty week is `data: []` (an array, not null) → it renders `GoldenSpoon`, which shows its own "Chưa có dữ liệu tuần này" empty state. That is intentional — an empty week is not an error.

- [ ] **Step 3: Write `WidgetGrid.jsx`**

Create `client/src/widgets/WidgetGrid.jsx`:

```jsx
// client/src/widgets/WidgetGrid.jsx
// Responsive row: 3 columns at desktop width, wrapping to fewer as it narrows.
import { WidgetRenderer } from './WidgetRenderer.jsx';

export function WidgetGrid({ descriptors = [] }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
      gap: 14,
    }}>
      {descriptors.map((d, i) => <WidgetRenderer key={d.type ?? i} descriptor={d} />)}
    </div>
  );
}
```

- [ ] **Step 4: Build check (after Tasks 7–9 exist)**

Run: `cd client && npm run build`
Expected: build succeeds, no unresolved-import errors for `./widgets/widgets/*`.

- [ ] **Step 5: Commit**

```bash
git add client/src/widgets/registry.jsx client/src/widgets/WidgetRenderer.jsx client/src/widgets/WidgetGrid.jsx
git commit -m "feat(widgets): add registry, WidgetRenderer (+ error boundary), WidgetGrid"
```

---

## Task 7: `WeatherCard` widget

**Files:**
- Create: `client/src/widgets/widgets/WeatherCard.jsx`

- [ ] **Step 1: Write the component**

Create `client/src/widgets/widgets/WeatherCard.jsx`:

```jsx
// client/src/widgets/widgets/WeatherCard.jsx
// descriptor.data = getWeatherSnapshot() output: { location, current, forecast }.
// Big current temp, feels-like, condition + icon; a one-day-ahead rain heads-up
// from forecast[1] (today's `current` has no rain-probability field).
import { C } from '../theme.js';
import { Card } from '../primitives/Card.jsx';
import { getWeatherIcon } from '../../lib/insightIcons.js';

// Hand-picked accent per WMO code (small fixed set, no name-hash needed).
function weatherAccent(code) {
  if (code === 0 || code === 1 || code === 2) return C.amber;
  if ([51, 53, 55, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return C.violet;
  if ([95, 96, 99].includes(code)) return C.magentaDeep;
  return C.inkMute;
}

export function WeatherCard({ descriptor }) {
  const w = descriptor.data;
  const c = w.current;
  const { Icon } = getWeatherIcon(c.weather_code);
  const accent = weatherAccent(c.weather_code);
  const tomorrow = w.forecast?.[1];

  return (
    <Card style={{ background: C.paperWarm }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 34, fontWeight: 800, color: C.ink, lineHeight: 1 }}>
            {Math.round(c.temperature_c)}°
          </div>
          <div style={{ fontSize: 12, color: C.inkMute, marginTop: 4 }}>
            cảm giác {Math.round(c.feels_like_c)}°
          </div>
        </div>
        <Icon size={40} color={accent} />
      </div>
      <div style={{ fontSize: 13, color: C.inkSoft, fontWeight: 600, marginTop: 8 }}>{c.condition}</div>
      {tomorrow && (
        <div style={{ fontSize: 11.5, color: C.magentaInk, marginTop: 6 }}>
          ☔ {new Date(`${tomorrow.date}T00:00:00`).toLocaleDateString('vi-VN', { weekday: 'short' })} {tomorrow.rain_chance_pct}%
        </div>
      )}
      <div style={{ fontSize: 10.5, color: C.inkMute, marginTop: 8 }} title={w.location}>{w.location}</div>
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/widgets/widgets/WeatherCard.jsx
git commit -m "feat(widgets): add WeatherCard"
```

---

## Task 8: `SuggestionCard` widget

**Files:**
- Create: `client/src/widgets/widgets/SuggestionCard.jsx`

- [ ] **Step 1: Write the component**

Create `client/src/widgets/widgets/SuggestionCard.jsx`:

```jsx
// client/src/widgets/widgets/SuggestionCard.jsx
// descriptor.data = { headline, meta, chips, text, source, model, cached }.
// The refresh button hits /daily-suggestion?refresh=1 directly and updates only
// this widget's local state (regenerating a suggestion must not refetch the whole
// board). toCardShape() mirrors getSuggestionWidgetData() on the server — keep
// the two derivations in sync.
import { useState } from 'react';
import { Sparkles, RefreshCw, Loader2 } from 'lucide-react';
import { C } from '../theme.js';
import { Card } from '../primitives/Card.jsx';
import { getPalette } from '../theme.js';
import { getDishIcon } from '../../lib/insightIcons.js';
import { api } from '../../lib/api.js';

function toCardShape(json) {
  const [head, ...rest] = json.highlights || [];
  const metaBits = [];
  if (head?.days_since != null) metaBits.push(`${head.days_since} ngày chưa gọi`);
  if (head?.category) metaBits.push(head.category);
  return {
    headline: head?.name ?? null,
    meta: metaBits.join(' · ') || null,
    chips: rest,
    text: json.text, source: json.source, model: json.model, cached: json.cached,
  };
}

export function SuggestionCard({ descriptor }) {
  const [data, setData] = useState(descriptor.data);
  const [loading, setLoading] = useState(false);

  const refresh = () => {
    setLoading(true);
    api.getDailySuggestion(true)
      .then(json => setData(toCardShape(json)))
      .catch(e => setData(prev => ({ ...prev, error: e.message })))
      .finally(() => setLoading(false));
  };

  const source = data?.source;
  const badge = source === 'ai'
    ? { text: `AI · ${data.model || 'MiniMax'}`, bg: C.rose, fg: C.magentaInk }
    : source === 'fallback'
      ? { text: 'Tự động (chưa cấu hình AI)', bg: C.amberSoft, fg: '#92400e' }
      : null;

  return (
    <Card style={{ background: C.paperWarm }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 700, color: C.ink }}>
          <Sparkles size={15} color={C.magentaInk} /> {descriptor.title || 'Gợi ý'}
        </div>
        <button onClick={refresh} disabled={loading} title="Làm mới" style={{
          display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600,
          border: `1px solid ${C.hlStrong}`, background: C.paper, color: C.magentaInk,
          borderRadius: 7, padding: '6px 10px', cursor: loading ? 'default' : 'pointer',
        }}>
          <RefreshCw size={13} className={loading ? 'spin' : ''} />
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.inkMute, fontSize: 14, marginTop: 8 }}>
          <Loader2 size={15} className="spin" /> Đang nghĩ xem hôm nay ăn gì…
        </div>
      ) : data?.error ? (
        <div style={{ color: '#b91c1c', fontSize: 13, marginTop: 8 }}>Không tạo được gợi ý: {data.error}</div>
      ) : (
        <>
          {data?.headline && (
            <div style={{ fontSize: 18, fontWeight: 800, color: C.ink, margin: '8px 0 2px' }}>{data.headline}</div>
          )}
          {data?.meta && <div style={{ fontSize: 12, color: C.inkMute, marginBottom: 8 }}>{data.meta}</div>}
          {data?.chips?.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '2px 0 8px' }}>
              {data.chips.map(it => {
                const { Icon } = getDishIcon(it.name);
                const { bg, text } = getPalette(it.name);
                return (
                  <span key={it.name} style={{
                    display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600,
                    color: text, background: bg, border: `1px solid ${C.hlStrong}`,
                    borderRadius: 999, padding: '4px 10px',
                  }}>
                    <Icon size={13} color={text} /> {it.name}
                  </span>
                );
              })}
            </div>
          )}
          {data?.text && (
            <p style={{ margin: '4px 0 10px', fontSize: 13.5, lineHeight: 1.6, color: C.inkSoft }}>{data.text}</p>
          )}
          {badge && (
            <span style={{ fontSize: 11, fontWeight: 700, background: badge.bg, color: badge.fg, padding: '3px 8px', borderRadius: 999 }}>
              {badge.text}{data?.cached ? ' · đã lưu' : ''}
            </span>
          )}
        </>
      )}
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/widgets/widgets/SuggestionCard.jsx
git commit -m "feat(widgets): add SuggestionCard with self-contained refresh"
```

---

## Task 9: `GoldenSpoon` widget

**Files:**
- Create: `client/src/widgets/widgets/GoldenSpoon.jsx`

- [ ] **Step 1: Write the component**

Create `client/src/widgets/widgets/GoldenSpoon.jsx`:

```jsx
// client/src/widgets/widgets/GoldenSpoon.jsx
// descriptor.data = [{ rank, name, total_spent, meals }] (0–3 rows). Rank 1 gets
// an accent left border + a slightly larger avatar; ranks 2–3 render plain. An
// empty array is a valid empty state, not an error.
import { C } from '../theme.js';
import { Card } from '../primitives/Card.jsx';
import { Avatar } from '../primitives/Avatar.jsx';

const fmtVND = n => `${Number(n || 0).toLocaleString('vi-VN')} ₫`;

export function GoldenSpoon({ descriptor }) {
  const rows = descriptor.data || [];
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 12 }}>
        🥄 {descriptor.title || 'Thìa Vàng'}
      </div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 13, color: C.inkMute }}>Chưa có dữ liệu tuần này</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map(r => {
            const top = r.rank === 1;
            return (
              <div key={r.name} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                borderLeft: top ? `3px solid ${C.amber}` : '3px solid transparent',
                paddingLeft: 8,
              }}>
                <span style={{ width: 16, fontSize: 12, fontWeight: 800, color: top ? C.amber : C.inkMute }}>{r.rank}</span>
                <Avatar name={r.name} size={top ? 30 : 24} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.name}
                  </div>
                  <div style={{ fontSize: 11, color: C.inkMute }}>{r.meals} bữa</div>
                </div>
                <span style={{ fontSize: 13, fontWeight: 800, color: C.ink }}>{fmtVND(r.total_spent)}</span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/widgets/widgets/GoldenSpoon.jsx
git commit -m "feat(widgets): add GoldenSpoon"
```

---

## Task 10: API client + `InsightsPage` integration

**Files:**
- Modify: `client/src/lib/api.js`
- Modify: `client/src/pages/InsightsPage.jsx`

- [ ] **Step 1: Add `getLexBoard` to the API client**

In `client/src/lib/api.js`, add this line inside the `api` object, right after `getDailySuggestion` (line 42):

```js
  getLexBoard: () => request('GET', '/insights/lex-board'),
```

- [ ] **Step 2: Update `InsightsPage.jsx` imports**

At the top of `client/src/pages/InsightsPage.jsx`:
- Add: `import { WidgetGrid } from '../widgets/WidgetGrid.jsx';`
- From the `lucide-react` import, remove `RefreshCw` (only the deleted `SuggestionCard` used it). Keep `Sparkles`, `Loader2`, `Clock`, `RotateCcw`, `Flame`, `Wallet`, `AlertCircle`, `Users`, `Utensils`, `ChefHat`.

- [ ] **Step 3: Replace board state + effects**

Replace the state/effect block (original lines 80–97) with:

```jsx
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [board, setBoard] = useState(null);

  const loadDashboard = useCallback(() => {
    api.getInsightsDashboard().then(setData).catch(e => setErr(e.message));
  }, []);

  const loadBoard = useCallback(() => {
    api.getLexBoard().then(r => setBoard(r.widgets)).catch(e => setErr(e.message));
  }, []);

  useEffect(() => { loadDashboard(); loadBoard(); }, [loadDashboard, loadBoard]);
```

This deletes `suggestion`/`suggesting` state and `loadSuggestion` — the suggestion is now a self-refreshing widget.

- [ ] **Step 4: Remove the header weather pill**

In the fixed header, delete the line (original line 133):

```jsx
            {data?.weather && <WeatherBadge weather={data.weather} />}
```

The `<h1>Lex … AI</h1>` block stays exactly as-is.

- [ ] **Step 5: Replace the inline SuggestionCard with the WidgetGrid**

In the scrollable body, replace the `<SuggestionCard ... />` line (original line 140) with:

```jsx
          {board && <WidgetGrid descriptors={board} />}
```

Everything below (`!data ? …loading… : <OverviewStrip/> <WeatherForecast/> <LongestUneaten/> <Rotation/> <Spending/>`) stays unchanged.

- [ ] **Step 6: Delete the superseded inline components**

Delete these three function definitions from `InsightsPage.jsx` (they are replaced by library widgets):
- `function SuggestionCard(...)` (original lines 163–205)
- `function HighlightChips(...)` (original lines 210–231)
- `function WeatherBadge(...)` (original lines 233–247)

**Keep** `WeatherForecast`, `OverviewStrip`, `LongestUneaten`, `Rotation`, `Spending`, and the module-level helpers `C`, `AVATAR_PALETTES`, `getPalette`, `getInitial`, `weatherAccent`, `fmtVND`, `fmtK`, `card`, `sectionTitle` — the surviving sections still use them.

- [ ] **Step 7: Build**

Run: `cd client && npm run build`
Expected: build succeeds. If it reports `getPalette`/`weatherAccent`/`fmtVND` as unused, that is a warning, not an error — leave them (surviving sections use them). If it reports an **undefined** symbol (e.g. `WeatherBadge is not defined`), you missed a reference in the JSX — fix it.

- [ ] **Step 8: Commit**

```bash
git add client/src/lib/api.js client/src/pages/InsightsPage.jsx
git commit -m "feat(insights): render Lex board via WidgetGrid; drop inline weather pill + suggestion card"
```

---

## Task 11: Isolated end-to-end verification

**Files:** none (verification only). Follows the repo's curl + Playwright discipline (no test runner).

- [ ] **Step 1: Start a scratch backend on :3999**

```bash
cd server && PORT=3999 node index.js &
sleep 2
```

- [ ] **Step 2: Verify the board shape**

```bash
curl -s localhost:3999/api/insights/lex-board | python3 -m json.tool
```
Expected: `widgets` is an array of exactly 3 objects, types in order `weather`, `suggestion`, `golden_spoon`; each has `type`, `title`, and `data` (or `data:null` + `error`). The suggestion `data` has `headline`, `meta`, `chips`, `text`, `source`, `cached`. Golden spoon `data` is an array of `{ rank, name, total_spent, meals }`.

- [ ] **Step 3: Point the client dev server at the scratch backend**

Confirm `client/vite.config.js` honors `LUNCH_API_PROXY_TARGET` (grep for it). Then:

```bash
cd client && LUNCH_API_PROXY_TARGET=http://localhost:3999 npx vite dev --port 5183 &
sleep 3
```
If `vite.config.js` does **not** read `LUNCH_API_PROXY_TARGET`, temporarily edit the proxy `target` to `http://localhost:3999`, and note it for revert in Step 6.

- [ ] **Step 4: Playwright — screenshot + console check**

Use the Playwright MCP:
1. `browser_navigate` to `http://localhost:5183`, then open the Lex tab (it is the third tab inside DebtPage — click "Gợi ý AI" / the Sparkles "Lex" tab).
2. `browser_take_screenshot` — confirm the 3-widget row renders: a weather card (real temp), a suggestion card (dish headline + chips + refresh), and a golden-spoon podium (real top-3 spenders or the empty state).
3. `browser_console_messages` — expect **0** errors.
4. Click the suggestion refresh button; confirm only that card shows its spinner and updates (weather + golden spoon do not reload).

- [ ] **Step 5: Kill scratch processes**

```bash
kill %1 %2 2>/dev/null; jobs
```
Expected: no running jobs.

- [ ] **Step 6: Revert any temporary config + confirm clean diff**

If Step 3 required editing `vite.config.js`, revert it now. Then:

```bash
git diff --stat
git status --porcelain client/vite.config.js
```
Expected: `vite.config.js` shows **no** changes. Delete any screenshots written to the repo root.

---

## Task 12: Build + deploy + live re-verify

**Files:** none (deploy only). Backend files changed this round, so pm2 restart is required (per deploy memory + spec §11).

- [ ] **Step 1: Production build the client**

```bash
cd client && npm run build
```
Expected: build succeeds; `client/dist` updated. (Nginx serves `client/dist`.)

- [ ] **Step 2: Restart the API**

```bash
pm2 restart lunchtime
pm2 status lunchtime
```
Expected: process `lunchtime` `online`, restart count incremented, no error logs (`pm2 logs lunchtime --lines 20 --nostream`).

- [ ] **Step 3: Live smoke test**

```bash
curl -s http://localhost:3001/api/insights/lex-board | head -c 400; echo
```
Expected: 3-widget board, 200. (Port 3001 is the live API per deploy memory — do not use :5173, a different app.)

- [ ] **Step 4: Live UI check**

Open the deployed Lex tab in the browser (or Playwright against the production URL), confirm the 3 widgets render with real data and the console is clean.

- [ ] **Step 5: Final commit / branch state**

The working branch is `ui/person-reminder-bell`. Confirm all widget work is committed:

```bash
git status --short
git log --oneline -8
```
Expected: clean tree (only intentional changes committed), the 9 feature commits from Tasks 1–10 present.

---

## Self-review checklist (completed during authoring)

**Spec coverage:**
- §2 library skeleton (theme, registry, renderer, grid, primitives, catalog, validateDescriptor) → Tasks 2, 4, 5, 6 ✅
- §2 three widgets → Tasks 7, 8, 9 ✅
- §2 golden-spoon resolver → Task 1 ✅
- §2 `GET /lex-board` → Task 3 ✅
- §2 replace top of InsightsPage → Task 10 ✅
- §2 isolated test + deploy → Tasks 11, 12 ✅
- §5 `startOfWeek` / `getGoldenSpoon` / `getSuggestionWidgetData` → Task 1 ✅
- §6 independent resolution (`allSettled`) + refresh keeps own wiring → Tasks 3, 8 ✅
- §7 primitives + renderer fallback + error boundary → Tasks 5, 6 ✅
- §8 three widget behaviours (rain from forecast[1], chips, rank-1 accent) → Tasks 7, 8, 9 ✅
- §10 error handling (allSettled, boundary, unknown type, weather null, empty week) → Tasks 3, 6, 9 ✅

**Out of scope (confirmed not built):** other 9 widgets, `aiAnalyst.js` descriptor emission, zod param schemas, monthly budget, trend badges, migrating existing sections. None appear as tasks. ✅

**Type consistency:** descriptor shape `{ type, title, data, error }` is identical across server route (Task 3), `WidgetRenderer` (Task 6), and all three widgets (Tasks 7–9). Suggestion payload fields (`headline`, `meta`, `chips`, `text`, `source`, `model`, `cached`) match between `getSuggestionWidgetData` (Task 1) and `toCardShape` (Task 8). Golden-spoon row shape `{ rank, name, total_spent, meals }` matches between `getGoldenSpoon` (Task 1) and `GoldenSpoon` (Task 9). ✅
