import {
  buildVariantCombinations,
  isLowStock,
  marginPct,
  MAX_VARIANTS,
  normalizeVariantOptions,
  stockCoverageDays,
  variantKey,
  variantName,
  variantSku,
} from './product-rules';

describe('product rules', () => {
  describe('normalizeVariantOptions', () => {
    it('trims and removes empty / duplicate values', () => {
      expect(
        normalizeVariantOptions([{ name: ' Size ', values: ['S', ' m', 'M', '', 'L'] }]),
      ).toEqual([{ name: 'Size', values: ['S', 'm', 'L'] }]);
    });

    it('rejects duplicate option names, empty options and too many options', () => {
      expect(() =>
        normalizeVariantOptions([
          { name: 'Size', values: ['S'] },
          { name: 'size', values: ['M'] },
        ]),
      ).toThrow(/twice/);
      expect(() => normalizeVariantOptions([{ name: 'Size', values: [' '] }])).toThrow(
        /at least one value/,
      );
      expect(() => normalizeVariantOptions([])).toThrow(/at least one option/);
      expect(() =>
        normalizeVariantOptions(['A', 'B', 'C', 'D'].map((n) => ({ name: n, values: ['x'] }))),
      ).toThrow(/At most/);
    });
  });

  describe('buildVariantCombinations', () => {
    it('builds every size × colour combination', () => {
      const combos = buildVariantCombinations([
        { name: 'Size', values: ['S', 'M'] },
        { name: 'Colour', values: ['Red', 'Blue'] },
      ]);
      expect(combos).toEqual([
        { Size: 'S', Colour: 'Red' },
        { Size: 'S', Colour: 'Blue' },
        { Size: 'M', Colour: 'Red' },
        { Size: 'M', Colour: 'Blue' },
      ]);
    });

    it('refuses more than the maximum number of variants', () => {
      const many = Array.from({ length: 15 }, (_, i) => String(i));
      expect(() =>
        buildVariantCombinations([
          { name: 'A', values: many },
          { name: 'B', values: many },
        ]),
      ).toThrow(String(MAX_VARIANTS));
    });
  });

  it('builds variant keys independent of order and case', () => {
    expect(variantKey({ Size: 'M', Colour: 'Red' })).toBe(variantKey({ colour: 'red', size: 'm' }));
  });

  it('builds variant names and SKUs', () => {
    const values = { Size: 'M', Colour: 'Bleu clair' };
    expect(variantName('T-shirt', values)).toBe('T-shirt - M / Bleu clair');
    expect(variantSku('TSHIRT', values)).toBe('TSHIRT-M-BLEUCLAIR');
    expect(variantSku('TS', { Taille: 'Élevé' })).toBe('TS-ELEVE');
  });

  it('flags low stock only when a threshold is set', () => {
    expect(isLowStock(5, 10)).toBe(true);
    expect(isLowStock(10, 10)).toBe(false);
    expect(isLowStock(0, 0)).toBe(false);
  });

  it('computes stock coverage and margin', () => {
    expect(stockCoverageDays(90, 30, 30)).toBe(90);
    expect(stockCoverageDays(90, 0, 30)).toBeNull();
    expect(marginPct(200, 150)).toBe(25);
    expect(marginPct(0, 10)).toBeNull();
  });
});
