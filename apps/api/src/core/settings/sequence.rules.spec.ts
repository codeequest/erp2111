import { SEQUENCE_PREFIX, formatSequenceValue, nextNumberProblem } from '@erp/shared';

describe('formatSequenceValue', () => {
  it('prints product codes as prefix + number (no year)', () => {
    expect(formatSequenceValue({ prefix: 'ART-', padding: 5, year: 0 }, 42)).toBe('ART-00042');
  });
  it('prints documents as PREFIX-YEAR-number', () => {
    expect(formatSequenceValue({ prefix: 'INV', padding: 5, year: 2026 }, 7)).toBe(
      'INV-2026-00007',
    );
  });
});

describe('nextNumberProblem', () => {
  it('lets product codes go back (codes in use are skipped)', () => {
    expect(nextNumberProblem('PRODUCT', 50, 1)).toBeNull();
  });
  it('lets documents move forward or stay', () => {
    expect(nextNumberProblem('CUSTOMER_INVOICE', 10, 10)).toBeNull();
    expect(nextNumberProblem('CUSTOMER_INVOICE', 10, 500)).toBeNull();
  });
  it('refuses moving a document counter back (would duplicate numbers)', () => {
    expect(nextNumberProblem('CUSTOMER_INVOICE', 10, 9)).toMatch(/can't go back/);
  });
  it('refuses zero, negative and decimal numbers', () => {
    expect(nextNumberProblem('PRODUCT', 1, 0)).not.toBeNull();
    expect(nextNumberProblem('PRODUCT', 1, -5)).not.toBeNull();
    expect(nextNumberProblem('PRODUCT', 1, 2.5)).not.toBeNull();
  });
});

describe('SEQUENCE_PREFIX', () => {
  it('accepts usual prefixes, including empty', () => {
    for (const p of ['INV', 'ART-', 'PO/', '', 'A.B_C']) expect(SEQUENCE_PREFIX.test(p)).toBe(true);
  });
  it('refuses spaces, symbols and over-long prefixes', () => {
    for (const p of ['IN V', 'INV!', 'X'.repeat(21)]) expect(SEQUENCE_PREFIX.test(p)).toBe(false);
  });
});
