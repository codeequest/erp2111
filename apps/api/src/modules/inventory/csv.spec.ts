import { parseCsv, toCsv } from './csv';
import { inclTax, parseDecimal } from './decimal';
import { Prisma } from '@prisma/client';

describe('parseCsv', () => {
  it('reads ";" files from French Excel, with BOM and quotes', () => {
    const rows = parseCsv(
      '﻿sku;name;sale_price\r\nA1;"Jus; orange";1,500\r\n\r\nA2;"Eau ""Safia""";0,650\r\n',
    );
    expect(rows).toEqual([
      ['sku', 'name', 'sale_price'],
      ['A1', 'Jus; orange', '1,500'],
      ['A2', 'Eau "Safia"', '0,650'],
    ]);
  });

  it('reads "," files and new lines inside quotes', () => {
    expect(parseCsv('a,b\n1,"x\ny"')).toEqual([
      ['a', 'b'],
      ['1', 'x\ny'],
    ]);
  });

  it('round-trips with toCsv', () => {
    const data = [
      ['sku', 'name'],
      ['A;1', 'Say "hi"'],
    ];
    expect(parseCsv(toCsv(data))).toEqual(data);
  });
});

describe('decimal helpers', () => {
  it('accepts comma, dot and spaces; rejects junk', () => {
    expect(parseDecimal('1 200,5')?.toString()).toBe('1200.5');
    expect(parseDecimal('12.3456')?.toString()).toBe('12.3456');
    expect(parseDecimal('-1')).toBeNull();
    expect(parseDecimal('1.23456')).toBeNull();
    expect(parseDecimal('abc')).toBeNull();
  });

  it('computes the price including VAT rounded to millimes', () => {
    expect(inclTax(new Prisma.Decimal('1.234'), new Prisma.Decimal(19), 3).toFixed(3)).toBe(
      '1.468',
    );
    expect(inclTax(new Prisma.Decimal('10'), null, 3).toFixed(3)).toBe('10.000');
  });
});
