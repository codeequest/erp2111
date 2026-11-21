import { barcodeProblem, gtinCheckDigit, isGtinLike } from '@erp/shared';

describe('gtinCheckDigit', () => {
  it('computes the EAN-13 check digit (GS1 example 4006381333931)', () => {
    expect(gtinCheckDigit('400638133393')).toBe(1);
  });
  it('computes the UPC-A check digit (036000291452)', () => {
    expect(gtinCheckDigit('03600029145')).toBe(2);
  });
  it('computes the EAN-8 check digit (96385074)', () => {
    expect(gtinCheckDigit('9638507')).toBe(4);
  });
});

describe('barcodeProblem', () => {
  it('accepts valid retail barcodes', () => {
    expect(barcodeProblem('5449000000996')).toBeNull(); // EAN-13
    expect(barcodeProblem('036000291452')).toBeNull(); // UPC-A
    expect(barcodeProblem('96385074')).toBeNull(); // EAN-8
  });
  it('explains a wrong check digit with the expected value', () => {
    expect(barcodeProblem('5449000000997')).toMatch(/should be 6, not 7/);
  });
  it('accepts non-GTIN codes (Code 128, letters, other lengths) as they are', () => {
    expect(barcodeProblem('ABC-123')).toBeNull();
    expect(barcodeProblem('12345')).toBeNull();
  });
  it('refuses spaces, ignores empty values', () => {
    expect(barcodeProblem('5449 000000996')).toMatch(/spaces/);
    expect(barcodeProblem('  ')).toBeNull();
  });
  it('only treats 8/12/13/14 digit values as GTIN', () => {
    expect(isGtinLike('12345678')).toBe(true);
    expect(isGtinLike('1234567')).toBe(false);
    expect(isGtinLike('12345678901A')).toBe(false);
  });
});
