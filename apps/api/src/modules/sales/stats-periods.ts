/**
 * Period helpers for sales statistics. Pure functions (unit-tested in stats-periods.spec.ts).
 * Period keys: month "2026-03", quarter "2026-Q1", year "2026".
 */
export type Granularity = 'month' | 'quarter' | 'year';

export interface Period {
  key: string;
  label: string;
  /** Inclusive start, as YYYY-MM-DD */
  from: string;
  /** Exclusive end, as YYYY-MM-DD */
  to: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * The periods shown for a year: 12 months, 4 quarters, or — for "year" — the
 * `years` calendar years ending with `year`.
 */
export function periodsFor(granularity: Granularity, year: number, years = 5): Period[] {
  if (granularity === 'month') {
    return MONTHS.map((m, i) => ({
      key: `${year}-${pad(i + 1)}`,
      label: `${m} ${year}`,
      from: `${year}-${pad(i + 1)}-01`,
      to: i === 11 ? `${year + 1}-01-01` : `${year}-${pad(i + 2)}-01`,
    }));
  }
  if (granularity === 'quarter') {
    return [1, 2, 3, 4].map((q) => ({
      key: `${year}-Q${q}`,
      label: `Q${q} ${year}`,
      from: `${year}-${pad(q * 3 - 2)}-01`,
      to: q === 4 ? `${year + 1}-01-01` : `${year}-${pad(q * 3 + 1)}-01`,
    }));
  }
  return Array.from({ length: years }, (_, i) => {
    const y = year - years + 1 + i;
    return { key: String(y), label: String(y), from: `${y}-01-01`, to: `${y + 1}-01-01` };
  });
}

/** Key of the period containing a date (UTC calendar date). */
export function periodKey(date: Date, granularity: Granularity): string {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  if (granularity === 'month') return `${y}-${pad(m)}`;
  if (granularity === 'quarter') return `${y}-Q${Math.ceil(m / 3)}`;
  return String(y);
}

/** Margin % of revenue, or null when there is no revenue. */
export function marginPct(revenue: number, cost: number): number | null {
  return revenue > 0 ? Math.round(((revenue - cost) / revenue) * 1000) / 10 : null;
}
