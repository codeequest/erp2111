import { Decimal, roundMoney, roundQty, toDecimal } from './decimal';

describe('decimal helpers', () => {
  it('rounds money half away from zero to 2 decimals', () => {
    expect(roundMoney('2.345').toFixed(2)).toBe('2.35');
    expect(roundMoney('2.344').toFixed(2)).toBe('2.34');
    expect(roundMoney('-2.345').toFixed(2)).toBe('-2.35');
  });

  it('rounds quantities to 4 decimals', () => {
    expect(roundQty('1.23455').toFixed(4)).toBe('1.2346');
    expect(roundQty(3).toFixed(4)).toBe('3.0000');
  });

  it('avoids floating-point drift', () => {
    // 0.1 + 0.2 = 0.30000000000000004 in JS numbers
    const sum = toDecimal('0.1').plus('0.2');
    expect(sum.equals(new Decimal('0.3'))).toBe(true);
  });

  it('rejects invalid input', () => {
    expect(() => toDecimal('')).toThrow();
    expect(() => toDecimal('abc')).toThrow();
    expect(() => toDecimal(Number.POSITIVE_INFINITY)).toThrow();
  });
});
