import { marginPct, periodKey, periodsFor } from './stats-periods';
import { listPrice, daysUntil } from '../inventory/price-utils';
import { parseDate } from '../inventory/opening-csv';
import { Prisma } from '@prisma/client';

describe('periodsFor', () => {
  it('gives 12 months with exclusive ends', () => {
    const p = periodsFor('month', 2026);
    expect(p).toHaveLength(12);
    expect(p[0]).toEqual({
      key: '2026-01',
      label: 'Jan 2026',
      from: '2026-01-01',
      to: '2026-02-01',
    });
    expect(p[11].to).toBe('2027-01-01');
  });

  it('gives 4 quarters', () => {
    expect(periodsFor('quarter', 2026).map((p) => [p.key, p.from, p.to])).toEqual([
      ['2026-Q1', '2026-01-01', '2026-04-01'],
      ['2026-Q2', '2026-04-01', '2026-07-01'],
      ['2026-Q3', '2026-07-01', '2026-10-01'],
      ['2026-Q4', '2026-10-01', '2027-01-01'],
    ]);
  });

  it('gives the 5 years ending with the chosen one', () => {
    expect(periodsFor('year', 2026).map((p) => p.key)).toEqual([
      '2022',
      '2023',
      '2024',
      '2025',
      '2026',
    ]);
  });
});

describe('periodKey', () => {
  const d = new Date('2026-08-15T00:00:00Z');
  it.each([
    ['month', '2026-08'],
    ['quarter', '2026-Q3'],
    ['year', '2026'],
  ] as const)('%s → %s', (g, key) => expect(periodKey(d, g)).toBe(key));
});

describe('marginPct', () => {
  it('computes the margin on revenue', () => expect(marginPct(200, 150)).toBe(25));
  it('is null without revenue', () => expect(marginPct(0, 10)).toBeNull());
});

describe('listPrice', () => {
  const D = (v: number) => new Prisma.Decimal(v);
  it('applies the list rule and rounds to cents', () => {
    expect(listPrice(D(1.55), D(-10), null).toString()).toBe('1.4'); // 1.395 → 1.40
  });
  it('prefers the fixed price', () => {
    expect(listPrice(D(1.55), D(-10), D(1.2)).toString()).toBe('1.2');
  });
});

describe('daysUntil', () => {
  it('counts calendar days', () => {
    expect(daysUntil(new Date('2026-12-01T00:00:00Z'), new Date(2026, 10, 21, 18))).toBe(10);
  });
});

describe('parseDate', () => {
  it.each([
    ['2027-06-30', '2027-06-30'],
    ['30/06/2027', '2027-06-30'],
    ['3-6-2027', '2027-06-03'],
    ['31/02/2027', null],
    ['tomorrow', null],
  ])('%s → %s', (input, expected) => expect(parseDate(input)).toBe(expected));
});
