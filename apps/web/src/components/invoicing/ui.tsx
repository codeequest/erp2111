'use client';

import { useCallback, type ReactNode } from 'react';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import {
  CURRENCY_DECIMALS,
  CURRENCY_LABELS,
  isCurrency,
  type BillStatus,
  type CurrencyAmounts,
  type CurrencyCode,
} from '@erp/shared';
import { useI18n } from '@/lib/i18n';
import { Breadcrumbs } from '@/components/page-header';

/**
 * Building blocks of the invoicing screens (violet identity). Fields, modals, pager
 * and errors are shared with purchasing: import them from components/purchasing/ui.
 */

export const btnInvoice =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm shadow-indigo-600/20 transition hover:-translate-y-px hover:shadow-md hover:shadow-indigo-600/25 active:translate-y-0 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50';

export const heroButtonInv =
  'inline-flex items-center gap-2 rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-indigo-700 shadow-sm transition hover:-translate-y-px hover:shadow-md active:translate-y-0 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60';

export const heroGhostInv =
  'inline-flex items-center gap-2 rounded-lg bg-white/15 px-3.5 py-2 text-sm font-medium text-white ring-1 ring-white/30 backdrop-blur transition hover:bg-white/25 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60';

export function InvoicingHero({
  icon: Icon,
  title,
  subtitle,
  crumb,
  actions,
  badge,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: ReactNode;
  crumb: { label: string; href?: string }[];
  actions?: ReactNode;
  badge?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="animate-rise space-y-3">
      <Breadcrumbs
        items={[
          { label: t('common.home'), href: '/dashboard' },
          { label: t('nav.module.invoicing') },
          ...crumb,
        ]}
      />
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-500 via-indigo-500 to-indigo-700 p-5 text-white shadow-lg shadow-indigo-600/15 sm:p-6">
        <div className="pointer-events-none absolute -top-16 -right-10 size-56 rounded-full bg-white/15 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-20 left-1/3 size-56 rounded-full bg-fuchsia-300/20 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-white/20 ring-1 ring-white/30 backdrop-blur">
              <Icon className="size-6" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">
                  {title}
                </h1>
                {badge}
              </div>
              {subtitle && <p className="mt-0.5 text-sm text-white/85">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      </div>
    </div>
  );
}

// ── Money ────────────────────────────────────────────────────────────────────

/**
 * Amounts in their own currency: "1 234,500 DT", "1 234,50 €", "$1,234.50".
 * Never sum across currencies: use `amounts()` for per-currency totals.
 */
export function useCurrency() {
  const { locale, lang } = useI18n();
  const fmt = useCallback(
    (value: string | number | null | undefined, currency: string) => {
      if (value === null || value === undefined || value === '') return '—';
      const n = Number(value);
      if (!Number.isFinite(n)) return '—';
      const cur: CurrencyCode = isCurrency(currency) ? currency : 'TND';
      const d = CURRENCY_DECIMALS[cur];
      const text = n.toLocaleString(locale, { minimumFractionDigits: d, maximumFractionDigits: d });
      const symbol = CURRENCY_LABELS[cur].symbol;
      if (cur === 'USD' && lang === 'en') return `${n < 0 ? '-' : ''}$${text.replace('-', '')}`;
      return `${text} ${symbol}`;
    },
    [locale, lang],
  );
  /** "1 234,500 DT · 90,00 €" (or "—" when empty) */
  const amounts = useCallback(
    (values: CurrencyAmounts | undefined) => {
      const entries = Object.entries(values ?? {}).filter(([, v]) => Number(v) !== 0);
      return entries.length ? entries.map(([c, v]) => fmt(v, c)).join(' · ') : '—';
    },
    [fmt],
  );
  const label = useCallback(
    (currency: CurrencyCode) => `${currency} · ${CURRENCY_LABELS[currency][lang]}`,
    [lang],
  );
  return { fmt, amounts, label };
}

// ── Status ───────────────────────────────────────────────────────────────────

export const BILL_STATUS_CLASS: Record<BillStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700 ring-slate-500/20',
  POSTED: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
  PARTIALLY_PAID: 'bg-amber-50 text-amber-800 ring-amber-600/25',
  PAID: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  CANCELLED: 'bg-red-50 text-red-700 ring-red-600/15',
};

export function BillStatusBadge({ status, onHero }: { status: BillStatus; onHero?: boolean }) {
  const { t } = useI18n();
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1',
        onHero ? 'bg-white/20 text-white ring-white/40 backdrop-blur' : BILL_STATUS_CLASS[status],
      )}
    >
      <span
        className={clsx(
          'size-1.5 rounded-full bg-current',
          status === 'POSTED' && !onHero && 'animate-pulse',
        )}
      />
      {t(`bill.status.${status}`)}
    </span>
  );
}

export function OverdueBadge({ days }: { days: number }) {
  const { t } = useI18n();
  if (days <= 0) return null;
  return (
    <span className="animate-pop inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-red-700 ring-1 ring-red-600/20">
      {t('bill.overdueDays', { n: days })}
    </span>
  );
}

/** Today as YYYY-MM-DD in the browser's time zone. */
export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ── Bill amounts (same rules as the API, in integer minor units) ─────────────

export interface CalcLine {
  quantity: string;
  unitPrice: string;
  discountPct: string;
  taxRate: number;
}

/** Live preview of the totals; the API recomputes and stores the real ones. */
export function computeBillPreview(
  lines: CalcLine[],
  discount: { type: 'PERCENT' | 'AMOUNT' | null; value: string },
  currency: CurrencyCode,
) {
  const d = CURRENCY_DECIMALS[currency];
  const scale = 10 ** d;
  // Round half up on minor units, tolerant to float noise.
  const r = (v: number) => Math.round(Number((v * scale).toPrecision(15)));
  const num = (v: string) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const base = lines.map((l) => {
    const gross = r(num(l.quantity) * num(l.unitPrice));
    const disc = r(((gross / scale) * num(l.discountPct)) / 100);
    return { gross, disc, net: gross - disc, rate: l.taxRate };
  });
  const net = base.reduce((s, l) => s + l.net, 0);
  let billDisc = 0;
  if (discount.type === 'PERCENT') billDisc = r(((net / scale) * num(discount.value)) / 100);
  if (discount.type === 'AMOUNT') billDisc = r(num(discount.value));
  billDisc = Math.min(billDisc, net);
  const shares = base.map((l) => (net > 0 ? Math.round((billDisc * l.net) / net) : 0));
  const rest = billDisc - shares.reduce((s, v) => s + v, 0);
  if (rest && base.length) {
    let big = 0;
    base.forEach((l, i) => {
      if (l.net > base[big].net) big = i;
    });
    shares[big] += rest;
  }
  const out = base.map((l, i) => {
    const sub = l.net - shares[i];
    const tax = r(((sub / scale) * l.rate) / 100);
    return { subtotal: sub / scale, tax: tax / scale, total: (sub + tax) / scale };
  });
  const subtotal = base.reduce((s, l) => s + l.gross, 0);
  const discountTotal = base.reduce((s, l) => s + l.disc, 0) + billDisc;
  const taxTotal = out.reduce((s, l) => s + Math.round(l.tax * scale), 0);
  return {
    lines: out,
    subtotal: subtotal / scale,
    discountTotal: discountTotal / scale,
    taxTotal: taxTotal / scale,
    total: (subtotal - discountTotal + taxTotal) / scale,
  };
}
