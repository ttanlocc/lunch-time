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

  it('strips MoMo banking noise appended after the name', () => {
    expect(parseSePayContent(
      'NHAN TU 2281072020614 TRACE 602526 ND 131168724024 Lunch Nguyen CHUYEN TIEN OQCH000CWUAr MOMO131168724024MOMO'
    )).toEqual({ week: null, personName: 'Nguyen' });
    expect(parseSePayContent(
      'NHAN TU 2281072020614 TRACE 272961 ND 131167927969 Lunch Giang CHUYEN TIEN OQCH000CWShR MOMO131167927969MOMO'
    )).toEqual({ week: null, personName: 'Giang' });
  });
});
