'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { downloadCsv } from '@/lib/inventory';
import {
  getSalesStats,
  type Granularity,
  type SalesStats,
  type StatsPeriod,
} from '@/lib/sales-stats';
import { Alert, RequirePermission, btn } from '@/components/inventory/ui';

export default function SalesStatisticsPage() {
  return (
    <RequirePermission permission="sales.stats.view">
      <Statistics />
    </RequirePermission>
  );
}

const GRANULARITIES: { key: Granularity; label: string }[] = [
  { key: 'month', label: 'Month' },
  { key: 'quarter', label: 'Quarter' },
  { key: 'year', label: 'Year' },
];

function Statistics() {
  const { can } = useAuth();
  const [granularity, setGranularity] = useState<Granularity>('month');
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState<SalesStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getSalesStats(granularity, year)
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [granularity, year]);

  const money = (n: number) =>
    new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: data?.currency ?? 'USD',
      maximumFractionDigits: 0,
    }).format(n);
  const money2 = (n: number) =>
    new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: data?.currency ?? 'USD',
    }).format(n);

  const t = data?.totals;
  const change =
    t && t.previousRevenue ? ((t.revenue - t.previousRevenue) / t.previousRevenue) * 100 : null;
  const empty = data && data.totals.invoices === 0 && data.totals.creditNoteAmount === 0;
  const scopeLabel = granularity === 'year' ? `${year - 4}–${year}` : String(year);

  function exportCsv() {
    if (!data) return;
    const header = [
      'period',
      'revenue_excl_vat',
      'vat',
      'revenue_incl_vat',
      'invoices',
      'credit_notes',
      'credit_note_amount',
      'average_invoice',
    ];
    if (granularity !== 'year') header.push('previous_year_revenue');
    if (data.canSeeCost) header.push('cost_of_sales', 'margin', 'margin_pct');
    downloadCsv(
      `sales-statistics-${granularity}-${scopeLabel}.csv`,
      header,
      data.periods.map((p) => {
        const row: (string | number | null)[] = [
          p.label,
          p.revenue,
          p.tax,
          p.total,
          p.invoices,
          p.creditNotes,
          p.creditNoteAmount,
          p.averageInvoice,
        ];
        if (granularity !== 'year') row.push(p.previousRevenue);
        if (data.canSeeCost) row.push(p.costOfSales ?? null, p.margin ?? null, p.marginPct ?? null);
        return row;
      }),
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <nav className="flex items-center gap-1 text-xs text-slate-500">
          <Link href="/dashboard" className="hover:text-slate-700">
            Home
          </Link>
          <ChevronRight className="size-3" />
          <span className="text-mod-sales">Sales</span>
          <ChevronRight className="size-3" />
          <span>Sales statistics</span>
        </nav>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-lg bg-mod-sales/10">
              <BarChart3 className="size-5 text-mod-sales" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Sales statistics</h1>
              <p className="text-sm text-slate-500">
                Posted customer invoices minus credit notes, excluding VAT
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="inline-flex rounded-md border border-slate-200 bg-white p-0.5"
              role="group"
              aria-label="Period"
            >
              {GRANULARITIES.map((g) => (
                <button
                  key={g.key}
                  aria-pressed={granularity === g.key}
                  onClick={() => setGranularity(g.key)}
                  className={clsx(
                    'rounded px-3 py-1.5 text-sm font-medium',
                    granularity === g.key
                      ? 'bg-mod-sales text-white'
                      : 'text-slate-600 hover:bg-slate-50',
                  )}
                >
                  {g.label}
                </button>
              ))}
            </div>
            <div className="inline-flex items-center rounded-md border border-slate-200 bg-white">
              <button
                aria-label="Previous year"
                className="p-2 text-slate-500 hover:text-slate-800"
                onClick={() => setYear((y) => y - 1)}
              >
                <ChevronLeft className="size-4" />
              </button>
              <span className="min-w-24 text-center text-sm font-medium tabular-nums">
                {scopeLabel}
              </span>
              <button
                aria-label="Next year"
                className="p-2 text-slate-500 hover:text-slate-800 disabled:opacity-30"
                disabled={year >= new Date().getFullYear()}
                onClick={() => setYear((y) => y + 1)}
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
            <button className={btn} onClick={exportCsv} disabled={!data}>
              <Download className="size-4" /> Export
            </button>
          </div>
        </div>
      </div>

      {error && <Alert>{error}</Alert>}

      {!data ? (
        <Loader2 className="mx-auto mt-16 size-6 animate-spin text-slate-400" />
      ) : (
        <div className={clsx('space-y-6', loading && 'opacity-60')}>
          {empty && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              No posted customer invoice for {scopeLabel}. The figures fill in automatically as soon
              as invoices are posted in the Invoicing module.
            </div>
          )}

          <div
            className={clsx(
              'grid grid-cols-2 gap-4',
              data.canSeeCost ? 'lg:grid-cols-4' : 'lg:grid-cols-3',
            )}
          >
            <Kpi
              label={`Revenue ${scopeLabel}`}
              value={money(t!.revenue)}
              hint={
                change !== null ? (
                  <span
                    className={clsx(
                      'inline-flex items-center gap-1',
                      change >= 0 ? 'text-emerald-700' : 'text-red-600',
                    )}
                  >
                    {change >= 0 ? (
                      <TrendingUp className="size-3.5" />
                    ) : (
                      <TrendingDown className="size-3.5" />
                    )}
                    {change >= 0 ? '+' : ''}
                    {change.toFixed(1)} % vs {year - 1}
                  </span>
                ) : (
                  `${money(t!.total)} incl. VAT`
                )
              }
            />
            <Kpi
              label="Invoices"
              value={String(t!.invoices)}
              hint={`${money(t!.creditNoteAmount)} credited`}
            />
            <Kpi
              label="Average invoice"
              value={t!.invoices > 0 ? money2(t!.revenue / t!.invoices) : '—'}
              hint="excl. VAT"
            />
            {data.canSeeCost && (
              <Kpi
                label="Gross margin"
                value={money(t!.margin ?? 0)}
                hint={
                  t!.marginPct != null ? `${t!.marginPct} % of revenue` : 'Cost from deliveries'
                }
              />
            )}
          </div>

          <RevenueChart
            periods={data.periods}
            money={money}
            showPrevious={granularity !== 'year'}
            year={year}
          />

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <h2 className="border-b border-slate-200 px-5 py-3 font-semibold text-slate-900">
              By {granularity}
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  <tr>
                    <th className="px-4 py-2.5">Period</th>
                    <th className="px-4 py-2.5 text-right">Revenue excl. VAT</th>
                    {granularity !== 'year' && (
                      <th className="px-4 py-2.5 text-right">{year - 1}</th>
                    )}
                    <th className="px-4 py-2.5 text-right">VAT</th>
                    <th className="px-4 py-2.5 text-right">Incl. VAT</th>
                    <th className="px-4 py-2.5 text-right">Invoices</th>
                    <th className="px-4 py-2.5 text-right">Credit notes</th>
                    {data.canSeeCost && (
                      <>
                        <th className="px-4 py-2.5 text-right">Cost of sales</th>
                        <th className="px-4 py-2.5 text-right">Margin</th>
                        <th className="px-4 py-2.5 text-right">Margin %</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 tabular-nums">
                  {data.periods.map((p) => (
                    <tr
                      key={p.key}
                      className={clsx(p.revenue === 0 && p.invoices === 0 && 'text-slate-400')}
                    >
                      <td className="px-4 py-2 font-medium">{p.label}</td>
                      <td className="px-4 py-2 text-right">{money2(p.revenue)}</td>
                      {granularity !== 'year' && (
                        <td className="px-4 py-2 text-right text-slate-500">
                          {money2(p.previousRevenue ?? 0)}
                        </td>
                      )}
                      <td className="px-4 py-2 text-right">{money2(p.tax)}</td>
                      <td className="px-4 py-2 text-right">{money2(p.total)}</td>
                      <td className="px-4 py-2 text-right">{p.invoices}</td>
                      <td className="px-4 py-2 text-right">
                        {p.creditNoteAmount ? money2(-p.creditNoteAmount) : '—'}
                      </td>
                      {data.canSeeCost && (
                        <>
                          <td className="px-4 py-2 text-right">{money2(p.costOfSales ?? 0)}</td>
                          <td className="px-4 py-2 text-right">{money2(p.margin ?? 0)}</td>
                          <td className="px-4 py-2 text-right">
                            {p.marginPct != null ? `${p.marginPct} %` : '—'}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold tabular-nums">
                  <tr>
                    <td className="px-4 py-2">Total</td>
                    <td className="px-4 py-2 text-right">{money2(t!.revenue)}</td>
                    {granularity !== 'year' && (
                      <td className="px-4 py-2 text-right text-slate-500">
                        {money2(t!.previousRevenue ?? 0)}
                      </td>
                    )}
                    <td className="px-4 py-2 text-right">{money2(t!.tax)}</td>
                    <td className="px-4 py-2 text-right">{money2(t!.total)}</td>
                    <td className="px-4 py-2 text-right">{t!.invoices}</td>
                    <td className="px-4 py-2 text-right">
                      {t!.creditNoteAmount ? money2(-t!.creditNoteAmount) : '—'}
                    </td>
                    {data.canSeeCost && (
                      <>
                        <td className="px-4 py-2 text-right">{money2(t!.costOfSales ?? 0)}</td>
                        <td className="px-4 py-2 text-right">{money2(t!.margin ?? 0)}</td>
                        <td className="px-4 py-2 text-right">
                          {t!.marginPct != null ? `${t!.marginPct} %` : '—'}
                        </td>
                      </>
                    )}
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <RankTable
              title={`Best-selling products — ${scopeLabel}`}
              rows={data.topProducts.map((p) => ({
                key: p.id,
                label: p.name,
                sub: p.sku,
                href: `/inventory/products/${p.id}`,
                value: p.revenue,
                extra: `${p.quantity.toLocaleString()} sold`,
              }))}
              money={money}
            />
            <RankTable
              title={`Revenue by category — ${scopeLabel}`}
              rows={data.topCategories.map((c) => ({
                key: c.id ?? 'none',
                label: c.name,
                value: c.revenue,
              }))}
              money={money}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900 tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

/**
 * Bars = revenue of each period (one series, sales blue). The dark tick on each bar is the
 * same period last year, distinguished by shape, not colour. Hover shows the exact figures.
 */
function RevenueChart({
  periods,
  money,
  showPrevious,
  year,
}: {
  periods: StatsPeriod[];
  money: (n: number) => string;
  showPrevious: boolean;
  year: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(
    1,
    ...periods.map((p) => Math.max(p.revenue, showPrevious ? (p.previousRevenue ?? 0) : 0)),
  );
  // A "nice" top for the axis: 1, 2 or 5 × 10^n
  const pow = 10 ** Math.floor(Math.log10(max));
  const top = [1, 2, 5, 10].map((m) => m * pow).find((v) => v >= max) ?? max;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * top);
  const h = 220;
  const hasData = periods.some(
    (p) => p.revenue !== 0 || (showPrevious && (p.previousRevenue ?? 0) !== 0),
  );
  // Compact axis labels (1.2k, 15k…) with decimals only for small scales
  const axis = new Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: top < 10 ? 2 : 1,
  });

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold text-slate-900">Revenue excl. VAT</h2>
        {!hasData && <span className="text-sm text-slate-500">No sales in this period yet</span>}
        {showPrevious && (
          <div className="flex items-center gap-4 text-xs text-slate-600" aria-label="Legend">
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-3 rounded-sm bg-[#2563eb]" /> {year}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 bg-slate-600" /> {year - 1}
            </span>
          </div>
        )}
      </div>
      <div className="flex gap-2">
        {/* Y axis labels */}
        <div
          className="relative w-14 shrink-0 text-right text-[11px] text-slate-400 tabular-nums"
          style={{ height: h }}
        >
          {ticks.map((v) => (
            <span
              key={v}
              className="absolute right-0 -translate-y-1/2"
              style={{ top: h - (v / top) * h }}
            >
              {axis.format(v)}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          {/* Recessive grid */}
          <div className="pointer-events-none absolute inset-x-0 top-0" style={{ height: h }}>
            {ticks.map((v) => (
              <div
                key={v}
                className={clsx(
                  'absolute inset-x-0 border-t',
                  v === 0 ? 'border-slate-300' : 'border-slate-100',
                )}
                style={{ top: h - (v / top) * h }}
              />
            ))}
          </div>
          <div className="relative flex items-end gap-[2px]" style={{ height: h }}>
            {periods.map((p, i) => {
              const barH = (Math.max(0, p.revenue) / top) * h;
              const prevH = ((p.previousRevenue ?? 0) / top) * h;
              return (
                <div
                  key={p.key}
                  className="group relative flex h-full flex-1 cursor-default items-end justify-center"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  tabIndex={0}
                  aria-label={`${p.label}: ${money(p.revenue)}${showPrevious ? `, last year ${money(p.previousRevenue ?? 0)}` : ''}`}
                >
                  <div className={clsx('absolute inset-0 rounded', hover === i && 'bg-slate-50')} />
                  <div
                    className="relative w-full max-w-12 rounded-t bg-[#2563eb]"
                    style={{ height: barH, opacity: hover === null || hover === i ? 1 : 0.55 }}
                  />
                  {showPrevious && (p.previousRevenue ?? 0) > 0 && (
                    <div
                      className="pointer-events-none absolute h-0.5 w-full max-w-14 bg-slate-600 ring-2 ring-white"
                      style={{ bottom: prevH }}
                    />
                  )}
                  {hover === i && (
                    <div className="pointer-events-none absolute bottom-full z-10 mb-2 w-44 rounded-lg border border-slate-200 bg-white p-2.5 text-xs shadow-lg">
                      <p className="font-semibold text-slate-900">{p.label}</p>
                      <p className="mt-1 flex justify-between text-slate-600">
                        Revenue{' '}
                        <span className="font-medium text-slate-900 tabular-nums">
                          {money(p.revenue)}
                        </span>
                      </p>
                      {showPrevious && (
                        <p className="flex justify-between text-slate-600">
                          {year - 1}{' '}
                          <span className="tabular-nums">{money(p.previousRevenue ?? 0)}</span>
                        </p>
                      )}
                      <p className="flex justify-between text-slate-600">
                        Invoices <span className="tabular-nums">{p.invoices}</span>
                      </p>
                      {p.marginPct != null && (
                        <p className="flex justify-between text-slate-600">
                          Margin <span className="tabular-nums">{p.marginPct} %</span>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex gap-[2px] text-center text-[11px] text-slate-500">
            {periods.map((p) => (
              <span key={p.key} className="flex-1 truncate">
                {p.label.replace(/ \d{4}$/, '')}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function RankTable({
  title,
  rows,
  money,
}: {
  title: string;
  rows: {
    key: string;
    label: string;
    sub?: string;
    href?: string;
    value: number;
    extra?: string;
  }[];
  money: (n: number) => string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <h2 className="border-b border-slate-200 px-5 py-3 font-semibold text-slate-900">{title}</h2>
      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-slate-500">No sales in this period.</p>
      ) : (
        <ol className="divide-y divide-slate-100 text-sm">
          {rows.map((r, i) => (
            <li key={r.key} className="px-5 py-2.5">
              <div className="flex items-baseline gap-3">
                <span className="w-5 text-xs text-slate-400 tabular-nums">{i + 1}</span>
                {r.href ? (
                  <Link href={r.href} className="font-medium text-slate-800 hover:underline">
                    {r.label}
                  </Link>
                ) : (
                  <span className="font-medium text-slate-800">{r.label}</span>
                )}
                {r.sub && <span className="font-mono text-xs text-slate-400">{r.sub}</span>}
                <span className="ml-auto font-medium text-slate-900 tabular-nums">
                  {money(r.value)}
                </span>
              </div>
              <div className="mt-1.5 ml-8 flex items-center gap-3">
                <div className="h-1.5 flex-1 rounded-full bg-slate-100">
                  <div
                    className="h-1.5 rounded-full bg-[#2563eb]"
                    style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }}
                  />
                </div>
                {r.extra && <span className="text-xs text-slate-500">{r.extra}</span>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
