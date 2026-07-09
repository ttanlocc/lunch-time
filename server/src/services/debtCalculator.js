// server/src/services/debtCalculator.js

export function getWeekNumber(dateStr) {
  const d = new Date(dateStr);
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const startOfWeek1 = new Date(jan4);
  startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const weekNum = Math.floor((d - startOfWeek1) / (7 * 86400000)) + 1;
  return weekNum;
}

export function calcDebtForWeek(orders, week, year) {
  const map = {};
  for (const o of orders) {
    if (getWeekNumber(o.date) !== week) continue;
    if (new Date(o.date).getFullYear() !== year) continue;
    if (!map[o.person_name]) map[o.person_name] = 0;
    map[o.person_name] += o.total_price;
  }
  return Object.entries(map).map(([person_name, amount]) => ({ person_name, amount }));
}

/**
 * Total unpaid debt per person across all time, excluding excluded days and
 * already-paid days. Single source of truth for both GET /api/debts/accumulated
 * and the Friday reminder. Returns [{ person_name, total_amount, unpaid_days }]
 * sorted by total_amount desc.
 */
export function getAccumulatedDebts(db) {
  const orders = db.prepare(`
    SELECT o.person_name, o.date, o.price as total_price
    FROM orders o
    ORDER BY o.date
  `).all();

  // Case/whitespace-insensitive key so payment & exclusion rows line up with
  // order person_names (matches the lower(...) used elsewhere).
  const nkey = (name, date) => `${String(name).trim().toLowerCase()}|${date}`;
  const excludedSet = new Set(
    db.prepare('SELECT person_name, date FROM day_exclusions').all().map(e => nkey(e.person_name, e.date))
  );
  const paidSet = new Set(
    db.prepare("SELECT person_name, date FROM payments WHERE status='paid'").all().map(p => nkey(p.person_name, p.date))
  );

  const personDayMap = {};
  for (const o of orders) {
    if (excludedSet.has(nkey(o.person_name, o.date)) || paidSet.has(nkey(o.person_name, o.date))) continue;
    if (!personDayMap[o.person_name]) personDayMap[o.person_name] = {};
    personDayMap[o.person_name][o.date] = (personDayMap[o.person_name][o.date] || 0) + o.total_price;
  }

  const result = [];
  for (const [person_name, dayMap] of Object.entries(personDayMap)) {
    const unpaid_days = Object.entries(dayMap)
      // Keep discount days (net < 0) so their credit nets into the total; only
      // drop days that settle to exactly 0 (fully offset / free).
      .filter(([, amount]) => amount !== 0)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, amount]) => ({ date, amount }));
    const total_amount = unpaid_days.reduce((s, d) => s + d.amount, 0);
    if (total_amount > 0) result.push({ person_name, total_amount, unpaid_days });
  }

  result.sort((a, b) => b.total_amount - a.total_amount);
  return result;
}
