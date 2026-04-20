// server/tests/menuParser.test.js
import { describe, it, expect } from 'vitest';
import { parseMenuText, normalizeName } from '../src/services/menuParser.js';

const SAMPLE_MENU = `@All
- Thịt kho đậu hũ 30k
- Hến xào sả ớt 30k
- Cơm gà mắm tỏi: 35k
- Cơm sườn: 30k
+ bì || chả || ốp la: 5k/phần
- Nui xào bò trứng: 40k
Gọi thêm:
- Sườn thêm: 25k
- Ốp la thêm: 5k
Kính mời 🤤`;

describe('normalizeName', () => {
  it('strips punctuation and trims whitespace', () => {
    expect(normalizeName('Cơm gà mắm tỏi:')).toBe('cơm gà mắm tỏi');
    expect(normalizeName('  Nui xào bò trứng  ')).toBe('nui xào bò trứng');
  });
});

describe('parseMenuText', () => {
  it('parses menu items with price', () => {
    const result = parseMenuText(SAMPLE_MENU);
    expect(result.items).toContainEqual(
      expect.objectContaining({ name: 'Thịt kho đậu hũ', price: 30000, category: 'main' })
    );
    expect(result.items).toContainEqual(
      expect.objectContaining({ name: 'Cơm gà mắm tỏi', price: 35000, category: 'main' })
    );
  });

  it('parses addons and links to previous item', () => {
    const result = parseMenuText(SAMPLE_MENU);
    const com_suon = result.items.find(i => i.name === 'Cơm sườn');
    expect(com_suon).toBeDefined();
    expect(result.addons[com_suon.normalizedName]).toEqual([
      { name: 'bì', price: 5000 },
      { name: 'chả', price: 5000 },
      { name: 'ốp la', price: 5000 },
    ]);
  });

  it('puts "Gọi thêm" section items into extras category', () => {
    const result = parseMenuText(SAMPLE_MENU);
    expect(result.items).toContainEqual(
      expect.objectContaining({ name: 'Sườn thêm', price: 25000, category: 'extra' })
    );
  });

  it('handles "35k" and "5k/phần" price formats', () => {
    const result = parseMenuText('- Cơm test: 35k\n- Addon test: 5k/phần');
    expect(result.items[0].price).toBe(35000);
    expect(result.items[1].price).toBe(5000);
  });

  it('is idempotent — parsing same text twice gives same items', () => {
    const r1 = parseMenuText(SAMPLE_MENU);
    const r2 = parseMenuText(SAMPLE_MENU);
    expect(r1.items.map(i => i.normalizedName).sort())
      .toEqual(r2.items.map(i => i.normalizedName).sort());
  });
});
