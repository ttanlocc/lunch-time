// server/tests/webhook.test.js
import { describe, it, expect } from 'vitest';
import { parseSePayContent } from '../src/routes/webhook.js';

describe('parseSePayContent', () => {
  it('extracts week and person name from transfer content', () => {
    expect(parseSePayContent('LUNCH TUAN 17 CHI')).toEqual({ week: 17, personName: 'Chi' });
    expect(parseSePayContent('lunch tuan 3 nguyen van an')).toEqual({ week: 3, personName: 'Nguyen Van An' });
  });

  it('returns null for non-matching content', () => {
    expect(parseSePayContent('CHUYEN TIEN THANG 4')).toBeNull();
    expect(parseSePayContent('')).toBeNull();
  });
});
