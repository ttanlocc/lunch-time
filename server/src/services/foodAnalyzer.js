// server/src/services/foodAnalyzer.js
//
// Deterministic analytics over the order history. This is the "numbers brain":
// everything here is plain SQL and is always correct and free. The AI layer
// (aiAnalyst.js) only phrases/summarises the structured output produced here —
// it never computes the numbers itself.
//
// Money note: orders.price is the frozen full line total (item + addons),
// snapshotted at order time. Always SUM(orders.price); never re-join
// menu_items.price (that was the source of the money-drift bug fixed earlier).

import { getDb } from '../db/index.js';

// Prices are stored as whole VND (e.g. 40000 = 40k). No cents.

/**
 * Dishes ordered by how long since anyone last ate them. Menu items that have
 * NEVER been ordered surface first (days_since = null → treated as infinity).
 * @param {{ person?: string, limit?: number }} opts
 */
export function getLongestUneaten({ person = null, limit = 15 } = {}, db = getDb()) {
  const personFilter = person ? 'AND lower(o.person_name) = lower(@person)' : '';
  const rows = db.prepare(`
    SELECT
      mi.id                                   AS menu_item_id,
      mi.name                                 AS name,
      mi.category                             AS category,
      mi.price                                AS price,
      MAX(o.date)                             AS last_eaten,
      COUNT(o.id)                             AS times_eaten
    FROM menu_items mi
    LEFT JOIN orders o
      ON o.menu_item_id = mi.id
      ${personFilter}
    GROUP BY mi.id
    ORDER BY (last_eaten IS NULL) DESC, last_eaten ASC
    LIMIT @limit
  `).all({ person, limit });

  return rows.map(r => ({
    ...r,
    days_since: r.last_eaten ? daysSince(r.last_eaten) : null,
  }));
}

/**
 * Most-ordered dishes, optionally within the last N days.
 * @param {{ limit?: number, sinceDays?: number|null }} opts
 */
export function getTopDishes({ limit = 10, sinceDays = null } = {}, db = getDb()) {
  const dateFilter = sinceDays ? "AND o.date >= date('now', @cutoff)" : '';
  return db.prepare(`
    SELECT
      mi.name                 AS name,
      mi.category             AS category,
      COUNT(o.id)             AS times_eaten,
      COUNT(DISTINCT o.person_name) AS eaters,
      MAX(o.date)             AS last_eaten
    FROM orders o
    JOIN menu_items mi ON mi.id = o.menu_item_id
    WHERE 1=1 ${dateFilter}
    GROUP BY mi.id
    ORDER BY times_eaten DESC
    LIMIT @limit
  `).all({ limit, cutoff: `-${sinceDays} days` });
}

/**
 * Rotation candidates: dishes that were historically popular (people liked them)
 * but haven't shown up recently — the best "bring it back" suggestions.
 * Score = popularity weighted by how long it's been absent.
 * @param {{ limit?: number, minTimes?: number, staleDays?: number }} opts
 */
export function getRotationSuggestion({ limit = 8, minTimes = 3, staleDays = 14 } = {}, db = getDb()) {
  const rows = db.prepare(`
    SELECT
      mi.name       AS name,
      mi.category   AS category,
      mi.price      AS price,
      COUNT(o.id)   AS times_eaten,
      MAX(o.date)   AS last_eaten
    FROM menu_items mi
    JOIN orders o ON o.menu_item_id = mi.id
    GROUP BY mi.id
    HAVING times_eaten >= @minTimes
       AND (last_eaten IS NULL OR last_eaten <= date('now', @cutoff))
    ORDER BY times_eaten DESC, last_eaten ASC
    LIMIT @limit
  `).all({ minTimes, cutoff: `-${staleDays} days`, limit });

  return rows.map(r => ({ ...r, days_since: daysSince(r.last_eaten) }));
}

/**
 * Spending: per-person totals, plus this-month vs last-month team spend.
 */
export function getSpendingStats(db = getDb()) {
  const perPerson = db.prepare(`
    SELECT
      person_name,
      COUNT(*)      AS meals,
      SUM(price)    AS total_spent,
      MIN(date)     AS first_meal,
      MAX(date)     AS last_meal
    FROM orders
    GROUP BY person_name
    ORDER BY total_spent DESC
  `).all();

  const monthly = db.prepare(`
    SELECT
      substr(date, 1, 7) AS month,
      COUNT(*)           AS meals,
      SUM(price)         AS total_spent,
      COUNT(DISTINCT person_name) AS eaters
    FROM orders
    GROUP BY month
    ORDER BY month DESC
    LIMIT 6
  `).all();

  return { perPerson, monthly };
}

/**
 * A single person's profile: their favourite dishes and their longest-uneaten
 * favourites (candidates to suggest to *them* specifically).
 */
export function getPersonProfile(name, db = getDb()) {
  const favourites = db.prepare(`
    SELECT mi.name, mi.category, COUNT(o.id) AS times_eaten, MAX(o.date) AS last_eaten
    FROM orders o
    JOIN menu_items mi ON mi.id = o.menu_item_id
    WHERE lower(o.person_name) = lower(?)
    GROUP BY mi.id
    ORDER BY times_eaten DESC, last_eaten DESC
    LIMIT 10
  `).all(name);

  const totals = db.prepare(`
    SELECT COUNT(*) AS meals, SUM(price) AS total_spent, MAX(date) AS last_meal
    FROM orders WHERE lower(person_name) = lower(?)
  `).get(name);

  return {
    name,
    ...totals,
    favourites: favourites.map(f => ({ ...f, days_since: daysSince(f.last_eaten) })),
    missedFavourites: getLongestUneaten({ person: name, limit: 5 }, db)
      .filter(d => d.times_eaten > 0),
  };
}

/**
 * Headline numbers for the dashboard summary strip.
 */
export function getOverview(db = getDb()) {
  const o = db.prepare(`
    SELECT
      COUNT(*)                       AS total_meals,
      COUNT(DISTINCT person_name)    AS people,
      COUNT(DISTINCT menu_item_id)   AS distinct_dishes,
      SUM(price)                     AS total_spent,
      MIN(date)                      AS first_date,
      MAX(date)                      AS last_date
    FROM orders
  `).get();
  const catalog = db.prepare('SELECT COUNT(*) AS c FROM menu_items').get();
  return { ...o, catalog_size: catalog.c };
}

/**
 * One structured snapshot bundling everything the AI layer needs to write a
 * daily suggestion. Kept small on purpose (top slices only) to bound tokens.
 */
export function getSuggestionContext() {
  return {
    generatedFor: today(),
    overview: getOverview(),
    longestUneaten: getLongestUneaten({ limit: 10 }),
    rotationCandidates: getRotationSuggestion({ limit: 6 }),
    recentTop: getTopDishes({ limit: 6, sinceDays: 30 }),
  };
}

// ── helpers ────────────────────────────────────────────────────────────────

function daysSince(dateStr) {
  if (!dateStr) return null;
  const then = new Date(`${dateStr}T00:00:00`);
  const now = new Date(`${today()}T00:00:00`);
  return Math.round((now - then) / 86400000);
}

function today() {
  // Local YYYY-MM-DD; matches how orders.date is stored.
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0, 10);
}
