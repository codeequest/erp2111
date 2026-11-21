/** Money in the company currency, formatted for the browser's locale. */
export function formatMoney(value: string | number, currency: string): string {
  const n = typeof value === 'string' ? Number(value) : value;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

/** Quantity without useless trailing zeros (max 4 decimals). */
export function formatQty(value: string | number): string {
  const n = typeof value === 'string' ? Number(value) : value;
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(n);
}

/** "1.5000" → "1.5" for prefilling inputs. */
export function trimDecimal(value: string): string {
  return String(Number(value));
}
