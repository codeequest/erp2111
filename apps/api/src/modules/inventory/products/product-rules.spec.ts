import { Prisma } from '@prisma/client';
import {
  changedFields,
  computeMarginPct,
  computeStockStatus,
  nextAutoSku,
  parseBoolean,
  parseProductType,
  parseUserDecimal,
} from './product-rules';
import { decodeCsv, detectDelimiter, parseCsv, toCsv } from './csv';
import { sniffImageType } from './products.service';
import { buildCategoryPaths, descendantIds } from '../catalog.service';

const D = (v: string | number) => new Prisma.Decimal(v);

describe('parseUserDecimal', () => {
  it.each([
    ['12', '12'],
    ['12.5', '12.5'],
    ['12,5', '12.5'],
    ['1 234,50', '1234.5'],
    ['1,234.50', '1234.5'],
    ['1.234,50', '1234.5'],
    [' 0 ', '0'],
    ['0.0001', '0.0001'],
  ])('reads %p as %p', (raw, expected) => {
    expect(parseUserDecimal(raw)?.toString()).toBe(expected);
  });

  it.each(['', '-5', 'abc', '1.2.3', '12.34567', '1e5'])('rejects %p', (raw) => {
    expect(parseUserDecimal(raw)).toBeNull();
  });
});

describe('computeMarginPct', () => {
  it('uses the average cost when there is one', () => {
    expect(computeMarginPct(D(100), D(60), D(80))).toBe('40.00');
  });
  it('falls back to the purchase price before the first receipt', () => {
    expect(computeMarginPct(D(100), D(0), D(75))).toBe('25.00');
  });
  it('can be negative when selling below cost', () => {
    expect(computeMarginPct(D(50), D(60), D(0))).toBe('-20.00');
  });
  it('is null without a sale price or a cost', () => {
    expect(computeMarginPct(D(0), D(10), D(10))).toBeNull();
    expect(computeMarginPct(D(10), D(0), D(0))).toBeNull();
  });
});

describe('computeStockStatus', () => {
  it('is "none" for services and consumables', () => {
    expect(computeStockStatus('SERVICE', D(0), D(5))).toBe('none');
    expect(computeStockStatus('CONSUMABLE', D(10), D(5))).toBe('none');
  });
  it('is "out" at zero or below', () => {
    expect(computeStockStatus('STOCKABLE', D(0), D(5))).toBe('out');
    expect(computeStockStatus('STOCKABLE', D(-2), D(0))).toBe('out');
  });
  it('is "low" at or below the minimum', () => {
    expect(computeStockStatus('STOCKABLE', D(5), D(5))).toBe('low');
    expect(computeStockStatus('STOCKABLE', D(3), D(5))).toBe('low');
  });
  it('is "in" above the minimum, or with no minimum set', () => {
    expect(computeStockStatus('STOCKABLE', D(6), D(5))).toBe('in');
    expect(computeStockStatus('STOCKABLE', D(1), D(0))).toBe('in');
  });
});

describe('small parsers', () => {
  it('generates the next automatic SKU', () => {
    expect(nextAutoSku(null)).toBe('PRD-00001');
    expect(nextAutoSku('PRD-00041')).toBe('PRD-00042');
    expect(nextAutoSku('PRD-00041', 2)).toBe('PRD-00044');
  });
  it('reads product types', () => {
    expect(parseProductType('')).toBe('STOCKABLE');
    expect(parseProductType('service')).toBe('SERVICE');
    expect(parseProductType('Consumable')).toBe('CONSUMABLE');
    expect(parseProductType('car')).toBeNull();
  });
  it('reads booleans in English and French', () => {
    expect(parseBoolean('', true)).toBe(true);
    expect(parseBoolean('Oui', false)).toBe(true);
    expect(parseBoolean('non', true)).toBe(false);
    expect(parseBoolean('maybe', true)).toBeNull();
  });
  it('lists changed fields, ignoring timestamps', () => {
    expect(
      changedFields(
        { name: 'A', salePrice: '1', updatedAt: 'x' },
        { name: 'B', salePrice: '1', updatedAt: 'y', barcode: '1' },
      ),
    ).toEqual(['barcode', 'name']);
  });
});

describe('CSV', () => {
  it('detects comma, semicolon and tab delimiters', () => {
    expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',');
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
    expect(detectDelimiter('a\tb\n1\t2')).toBe('\t');
    expect(detectDelimiter('"x;y",b,c')).toBe(',');
  });

  it('parses quotes, escaped quotes, line breaks in cells and drops empty lines', () => {
    const rows = parseCsv('sku,name\r\nA1,"Shirt, ""blue"""\n\nA2,"two\nlines"\n');
    expect(rows).toEqual([
      ['sku', 'name'],
      ['A1', 'Shirt, "blue"'],
      ['A2', 'two\nlines'],
    ]);
  });

  it('decodes UTF-8 with BOM and falls back to Windows-1252', () => {
    expect(decodeCsv(Buffer.from('﻿café', 'utf-8'))).toBe('café');
    expect(decodeCsv(Buffer.from([0x63, 0x61, 0x66, 0xe9]))).toBe('café');
  });

  it('writes a BOM, quotes when needed and neutralises formulas', () => {
    const csv = toCsv(
      ['a', 'b'],
      [
        ['x,y', '=SUM(A1)'],
        ['-5', null],
      ],
    );
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('"x,y",\'=SUM(A1)');
    expect(csv).toContain('-5,\r\n');
  });

  it('round-trips through parse', () => {
    const csv = toCsv(['sku', 'name'], [['A', 'He said "hi"; ok']]);
    expect(parseCsv(decodeCsv(Buffer.from(csv)))).toEqual([
      ['sku', 'name'],
      ['A', 'He said "hi"; ok'],
    ]);
  });
});

describe('sniffImageType', () => {
  it('recognises real images by their first bytes', () => {
    expect(sniffImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe(
      'image/png',
    );
    expect(sniffImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffImageType(Buffer.from('GIF89a....'))).toBe('image/gif');
    expect(sniffImageType(Buffer.from('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp');
  });
  it('rejects anything else, whatever its name', () => {
    expect(sniffImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(sniffImageType(Buffer.from('%PDF-1.7'))).toBeNull();
  });
});

describe('category tree helpers', () => {
  const rows = [
    { id: '1', name: 'Clothing', parentId: null, isActive: true },
    { id: '2', name: 'T-shirts', parentId: '1', isActive: true },
    { id: '3', name: 'Kids', parentId: '2', isActive: true },
    { id: '4', name: 'Food', parentId: null, isActive: true },
  ];
  it('builds full paths', () => {
    expect(buildCategoryPaths(rows).get('3')).toBe('Clothing / T-shirts / Kids');
  });
  it('finds every sub-category', () => {
    expect(descendantIds(rows, '1').sort()).toEqual(['1', '2', '3']);
    expect(descendantIds(rows, '4')).toEqual(['4']);
  });
});
