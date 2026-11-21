/** Locale-aware number formatting. Decimals come from the API as strings. */

const nf = (min: number, max: number) =>
  new Intl.NumberFormat(undefined, { minimumFractionDigits: min, maximumFractionDigits: max });

const money = nf(2, 2);
const qty = nf(0, 4);
const pct = nf(0, 1);

export function toNum(v: string | number | null | undefined): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export const formatMoney = (v: string | number | null | undefined) => money.format(toNum(v));
export const formatQty = (v: string | number | null | undefined) => qty.format(toNum(v));
export const formatPct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${pct.format(v)} %`);

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
