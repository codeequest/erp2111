import { Prisma } from '@prisma/client';
import { mapOpeningCsv, weightedAverageCost } from './opening-csv';
import { looksLikeImage } from './stock.service';

const D = (v: number | string) => new Prisma.Decimal(v);

describe('mapOpeningCsv', () => {
  it('reads French headers, comma decimals and an optional warehouse', () => {
    const { rows, errors } = mapOpeningCsv(
      'Référence;Entrepôt;Quantité;Coût unitaire\nA1;main;240;0,80\nB2;;10;1',
    );
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      {
        line: 2,
        sku: 'A1',
        warehouse: 'MAIN',
        quantity: 240,
        unitCost: 0.8,
        lotNumber: null,
        expiryDate: null,
      },
      {
        line: 3,
        sku: 'B2',
        warehouse: null,
        quantity: 10,
        unitCost: 1,
        lotNumber: null,
        expiryDate: null,
      },
    ]);
  });

  it('requires sku, quantity and unit_cost columns', () => {
    expect(mapOpeningCsv('sku;quantity\nA1;3').errors[0].line).toBe(1);
  });

  it('rejects zero / negative quantities and negative costs', () => {
    const { errors } = mapOpeningCsv('sku,quantity,unit_cost\nA1,0,1\nA2,5,-1');
    expect(errors.map((e) => e.line)).toEqual([2, 3]);
  });
});

it('reads lot number and expiry date (French headers, DD/MM/YYYY)', () => {
  const { rows, errors } = mapOpeningCsv(
    'sku;quantity;unit_cost;lot;date_peremption\nA1;5;1;L-9;31/12/2027',
  );
  expect(errors).toEqual([]);
  expect(rows[0]).toMatchObject({ lotNumber: 'L-9', expiryDate: '2027-12-31' });
});

describe('weightedAverageCost', () => {
  it('uses the new cost when there was no stock', () => {
    expect(weightedAverageCost(D(0), D(5), D(10), D(2)).toString()).toBe('2');
  });

  it('weights old and new quantities', () => {
    // 10 @ 1.00 + 30 @ 2.00 = 70 / 40 = 1.75
    expect(weightedAverageCost(D(10), D(1), D(30), D(2)).toString()).toBe('1.75');
  });

  it('ignores negative stock', () => {
    expect(weightedAverageCost(D(-4), D(9), D(10), D(3)).toString()).toBe('3');
  });
});

describe('looksLikeImage', () => {
  it('accepts real JPEG / PNG signatures', () => {
    expect(looksLikeImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg')).toBe(true);
    expect(
      looksLikeImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]), 'image/png'),
    ).toBe(true);
  });

  it('rejects a renamed text file', () => {
    expect(looksLikeImage(Buffer.from('<script>alert(1)</script>'), 'image/png')).toBe(false);
  });
});
