/** Formats a decimal string from the API, e.g. "1234.5" → "1,234.50". */
export function formatMoney(value: string | null | undefined): string {
  if (value == null) return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

/** Formats a quantity: no forced decimals, up to 4. */
export function formatQty(value: string | null | undefined): string {
  if (value == null) return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
