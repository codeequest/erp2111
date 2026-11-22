import { detectDelimiter, parseCsv, toCsv } from './csv';

describe('parseCsv', () => {
  it('parses quotes, escaped quotes, embedded commas and line breaks', () => {
    const text = 'a,b,c\r\n"x, y","say ""hi""","line1\nline2"\r\n';
    expect(parseCsv(text)).toEqual([
      ['a', 'b', 'c'],
      ['x, y', 'say "hi"', 'line1\nline2'],
    ]);
  });

  it('strips the BOM and blank lines, keeps empty fields', () => {
    expect(parseCsv('﻿a,b\n\n1,\n')).toEqual([
      ['a', 'b'],
      ['1', ''],
    ]);
  });

  it('handles a last line without a newline', () => {
    expect(parseCsv('a\nb')).toEqual([['a'], ['b']]);
  });

  it('detects semicolon-separated files (Excel in many locales)', () => {
    const text = 'sku;name;sale_price\nA1;Rice, 5kg;12,50\n';
    expect(detectDelimiter(text)).toBe(';');
    expect(parseCsv(text)).toEqual([
      ['sku', 'name', 'sale_price'],
      ['A1', 'Rice, 5kg', '12,50'],
    ]);
  });
});

describe('toCsv', () => {
  it('round-trips through parseCsv', () => {
    const rows = [
      ['sku', 'name'],
      ['A,1', 'Tea "green"\nbags'],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });

  it('neutralises spreadsheet formulas but keeps negative numbers', () => {
    const out = toCsv([['=SUM(A1)', '-5', '@x']]);
    expect(parseCsv(out)).toEqual([["'=SUM(A1)", '-5', "'@x"]]);
  });
});
