import { listPrice, standardPrice } from './pricing';

describe('pricing', () => {
  it('standard price is sale price x pack factor, rounded to cents', () => {
    expect(standardPrice('4.75', '1').toString()).toBe('4.75');
    expect(standardPrice('4.75', '12').toString()).toBe('57');
    expect(standardPrice('0.333', '3').toString()).toBe('1');
  });

  it('a fixed price always wins', () => {
    expect(listPrice('10', '1', '-10', '7.5').toString()).toBe('7.5');
    expect(listPrice('10', '1', '-10', '0').toString()).toBe('0');
  });

  it('otherwise applies the list percentage, rounded half up', () => {
    expect(listPrice('10', '1', '-10').toString()).toBe('9');
    expect(listPrice('4.75', '12', '-10').toString()).toBe('51.3');
    expect(listPrice('1.05', '1', '5').toString()).toBe('1.1'); // 1.1025 -> 1.10
    expect(listPrice('2', '1', '0', null).toString()).toBe('2');
  });
});
