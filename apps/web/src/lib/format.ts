import type { Locale } from './i18n';

const INTL_LOCALE: Record<Locale, string> = { fr: 'fr-TN', en: 'en-GB' };

export function intlLocale(locale: Locale): string {
  return INTL_LOCALE[locale];
}

/**
 * Formats an amount. Amounts travel as strings (Decimal) and are never used for
 * arithmetic in the browser; the API computes every total.
 * The number of decimals follows the currency (TND → 3, EUR → 2…).
 */
export function formatMoney(
  value: string | number | null | undefined,
  currency: string,
  locale: Locale,
): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  return new Intl.NumberFormat(intlLocale(locale), { style: 'currency', currency }).format(n);
}

/** Number of decimals used by a currency (TND = 3). */
export function currencyDecimals(currency: string): number {
  return (
    new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2
  );
}

export function formatNumber(
  value: string | number | null | undefined,
  locale: Locale,
  digits = 0,
) {
  if (value === null || value === undefined || value === '') return '—';
  return new Intl.NumberFormat(intlLocale(locale), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(value));
}

export function formatPercent(value: string | number, locale: Locale): string {
  return `${formatNumber(value, locale, Number(value) % 1 === 0 ? 0 : 2)} %`;
}

export function formatDate(iso: string | null | undefined, locale: Locale): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(intlLocale(locale), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatDateTime(iso: string | null | undefined, locale: Locale): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(intlLocale(locale), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
