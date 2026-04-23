import { describe, it, expect } from 'vitest';
import { buildQrCode, parseQrCode, levenshtein, extractSenderName } from './qrCode.js';

describe('buildQrCode', () => {
  it('generates uppercase code with week and year', () => {
    expect(buildQrCode('An', 16, 2026)).toBe('LUNCH-AN-W16-2026');
  });

  it('removes spaces from multi-word name', () => {
    expect(buildQrCode('Hoang An', 16, 2026)).toBe('LUNCH-HOANGAN-W16-2026');
  });

  it('truncates name slug to 10 chars', () => {
    expect(buildQrCode('Nguyen Thi Hoa', 16, 2026)).toBe('LUNCH-NGUYENTHIH-W16-2026');
  });

  it('converts đ to d', () => {
    expect(buildQrCode('Đức', 16, 2026)).toBe('LUNCH-DUC-W16-2026');
  });
});

describe('parseQrCode', () => {
  it('parses valid QR code', () => {
    expect(parseQrCode('LUNCH-AN-W16-2026')).toEqual({
      qrCode: 'LUNCH-AN-W16-2026',
      nameSlug: 'AN',
      week: 16,
      year: 2026,
    });
  });

  it('parses QR code embedded in bank description', () => {
    const desc = 'BankAPINotify NHAN TU 123 TRACE 456 LUNCH-KHOA-W16-2026.CT tu';
    expect(parseQrCode(desc)).toEqual({
      qrCode: 'LUNCH-KHOA-W16-2026',
      nameSlug: 'KHOA',
      week: 16,
      year: 2026,
    });
  });

  it('returns null for non-matching text', () => {
    expect(parseQrCode('random bank text')).toBeNull();
    expect(parseQrCode('')).toBeNull();
    expect(parseQrCode(null)).toBeNull();
  });
});

describe('levenshtein', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshtein('an', 'an')).toBe(0);
  });

  it('returns correct edit distance', () => {
    expect(levenshtein('khoa', 'khao')).toBe(2);
    expect(levenshtein('an', 'anh')).toBe(1);
  });
});

describe('extractSenderName', () => {
  it('extracts sender name from bank description', () => {
    const desc = 'CT tu 1833270501 PHAM DAI HOANG AN toi AGBSPAIQLUNCH';
    expect(extractSenderName(desc)).toBe('PHAM DAI HOANG AN');
  });

  it('returns null when pattern not found', () => {
    expect(extractSenderName('NHAN TU 123 some other text')).toBeNull();
    expect(extractSenderName(null)).toBeNull();
  });
});
