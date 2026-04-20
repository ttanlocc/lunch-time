// server/tests/debtCalculator.test.js
import { describe, it, expect } from 'vitest';
import { getWeekNumber, calcDebtForWeek } from '../src/services/debtCalculator.js';

describe('getWeekNumber', () => {
  it('returns ISO week number for a date string', () => {
    expect(getWeekNumber('2026-04-21')).toBe(17);
    expect(getWeekNumber('2026-01-05')).toBe(2);
  });
});

describe('calcDebtForWeek', () => {
  it('sums order amounts per person for a given week', () => {
    const orders = [
      { person_name: 'An', total_price: 35000, date: '2026-04-21' },
      { person_name: 'An', total_price: 40000, date: '2026-04-22' },
      { person_name: 'Bình', total_price: 30000, date: '2026-04-21' },
    ];
    const result = calcDebtForWeek(orders, 17, 2026);
    expect(result).toContainEqual({ person_name: 'An', amount: 75000 });
    expect(result).toContainEqual({ person_name: 'Bình', amount: 30000 });
  });

  it('returns empty array when no orders', () => {
    expect(calcDebtForWeek([], 17, 2026)).toEqual([]);
  });
});
