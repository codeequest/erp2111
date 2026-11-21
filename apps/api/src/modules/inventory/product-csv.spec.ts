import { mapProductRows, parseCsv, parseDecimal } from './product-csv';
import { hideCost } from './inventory.service';

describe('parseCsv', () => {
  it('parses comma-separated text with quoted fields', () => {
    expect(parseCsv('sku,name\nA1,"Cola, 33cl"\r\nA2,"Say ""hi"""\n')).toEqual([
      ['sku', 'name'],
      ['A1', 'Cola, 33cl'],
      ['A2', 'Say "hi"'],
    ]);
  });

  it('detects semicolons (French Excel) and strips the BOM', () => {
    expect(parseCsv('﻿sku;name;prix\nA1;Cola;1,50')).toEqual([
      ['sku', 'name', 'prix'],
      ['A1', 'Cola', '1,50'],
    ]);
  });

  it('ignores blank lines', () => {
    expect(parseCsv('sku,name\n\nA1,Cola\n\n')).toEqual([
      ['sku', 'name'],
      ['A1', 'Cola'],
    ]);
  });
});

describe('parseDecimal', () => {
  it.each([
    ['1.50', 1.5],
    ['1,50', 1.5],
    ['1 234,5', 1234.5],
    ['1,234.5', 1234.5],
    ['12', 12],
  ])('%s → %d', (input, expected) => expect(parseDecimal(input)).toBe(expected));

  it('rejects text', () => expect(parseDecimal('abc')).toBeNaN());
});

describe('mapProductRows', () => {
  it('maps French and English headers', () => {
    const { rows, errors } = mapProductRows(
      parseCsv('Référence;Désignation;Unité;Prix vente;Catégorie\nA1;Cola;pcs;1,5;Boissons'),
    );
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({
      line: 2,
      sku: 'A1',
      name: 'Cola',
      unit: 'PCS',
      salePrice: 1.5,
      category: 'Boissons',
    });
  });

  it('requires sku and name columns', () => {
    const { errors } = mapProductRows(parseCsv('name\nCola'));
    expect(errors[0].message).toMatch(/sku/);
  });

  it('reports missing values, bad numbers and duplicate SKUs with their line', () => {
    const { errors } = mapProductRows(
      parseCsv('sku,name,sale_price\nA1,Cola,abc\n,Fanta,1\nA1,Sprite,1\nB 2,Water,1'),
    );
    expect(errors).toEqual([
      { line: 2, message: 'sale_price "abc" is not a valid positive number' },
      { line: 3, message: 'sku is required' },
      { line: 4, message: 'sku "A1" already appears on line 2' },
      { line: 5, message: 'sku "B 2" may only contain letters, digits and . _ - /' },
    ]);
  });
});

describe('hideCost', () => {
  const product = { id: '1', name: 'Cola', averageCost: '0.80' };

  it('keeps the cost for users with inventory.cost.view', () => {
    expect(hideCost(product, { permissions: new Set(['inventory.cost.view']) })).toEqual(product);
  });

  it('removes the cost for everyone else', () => {
    expect(hideCost(product, { permissions: new Set() })).not.toHaveProperty('averageCost');
  });
});
