// server/src/services/holidays.js
// Vietnamese public-holiday awareness for the month-end payday reminder.
// Payday = last day of month; if that day is a weekend OR public holiday, the
// real payday (and the reminder) shifts to the working day immediately before.

// Fixed solar-calendar holidays — same every year, computed automatically.
// Keyed 'M-D' (month is 1-12).
const FIXED = new Set([
  '1-1',   // Tết Dương lịch
  '4-30',  // Giải phóng miền Nam  (falls on the last day of April)
  '5-1',   // Quốc tế Lao động
  '9-2',   // Quốc khánh
]);

// Lunar / variable / công-văn bù holidays — MUST be maintained per year as
// 'YYYY-MM-DD' (Tết, Giỗ Tổ Hùng Vương 10/3 ÂL, nghỉ bù bridge days, etc.).
// Add each year's official dates here. Anything not month-end-relevant is still
// fine to include — it only matters when it lands near the end of a month.
export const EXTRA_HOLIDAYS = new Set([
  // ── 2026 ──
  '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20', // Tết Bính Ngọ (LNY 17/2)
  '2026-04-26', // Giỗ Tổ Hùng Vương (10/3 ÂL)
  '2026-09-01', // nghỉ bù Quốc khánh (thường gộp 1-2/9)
  // ── 2027 (cập nhật khi có nghị định) ──
  '2027-02-06', '2027-02-07', '2027-02-08', '2027-02-09', '2027-02-10', // Tết Đinh Mùi (LNY 6/2)
]);

function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function isHoliday(d) {
  if (FIXED.has(`${d.getMonth() + 1}-${d.getDate()}`)) return true;
  return EXTRA_HOLIDAYS.has(iso(d));
}

// A working day = Mon–Fri and not a public holiday.
export function isWorkingDay(d) {
  const dow = d.getDay(); // 0=Sun..6=Sat
  return dow !== 0 && dow !== 6 && !isHoliday(d);
}

// True when `d` is the last working day of its month — i.e. every later day in
// the month is a weekend or holiday (the next working day falls in a new month).
export function isLastWorkingDayOfMonth(d) {
  if (!isWorkingDay(d)) return false;
  const next = new Date(d);
  do { next.setDate(next.getDate() + 1); } while (!isWorkingDay(next));
  return next.getMonth() !== d.getMonth();
}
