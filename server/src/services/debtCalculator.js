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
