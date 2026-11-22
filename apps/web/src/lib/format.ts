/** Formats an API decimal string ("12.5000") for display, e.g. "12.50". */
export function formatAmount(value: string | null | undefined, maxDecimals = 2): string {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return n.toLocaleString(undefined, {
    minimumFractionDigits: Math.min(2, maxDecimals),
    maximumFractionDigits: maxDecimals,
  });
}

/** Quantities: no forced decimals ("5", "2.5"). */
export function formatQty(value: string | null | undefined): string {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

/** API decimal string -> form input value ("12.5000" -> "12.5"). */
export function decimalToInput(value: string | null | undefined): string {
  if (value == null || value === '') return '';
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : value;
}
