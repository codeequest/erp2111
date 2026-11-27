'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import { AlarmClock, FilePen, Plus, ReceiptText, Search, Wallet, X } from 'lucide-react';
import {
  AGING_BUCKETS,
  CURRENCIES,
  type BillListItem,
  type BillStatusFilter,
  type BillSummary,
  type CurrencyCode,
  type Paginated,
} from '@erp/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/messages';
import { AccessDenied } from '@/components/page-header';
import {
  EmptyState,
  ErrorBox,
  ExportButton,
  Pager,
  Spinner,
  StatTile,
  errorMessages,
  fieldClass,
  inputClass,
} from '@/components/purchasing/ui';
import {
  BillStatusBadge,
  InvoicingHero,
  OverdueBadge,
  heroButtonInv,
  useCurrency,
} from '@/components/invoicing/ui';

const PAGE_SIZE = 25;
const TABS: { key: BillStatusFilter; label: MessageKey }[] = [
  { key: 'open', label: 'bill.tab.open' },
  { key: 'overdue', label: 'bill.tab.overdue' },
  { key: 'DRAFT', label: 'bill.tab.draft' },
  { key: 'PAID', label: 'bill.tab.paid' },
  { key: 'CANCELLED', label: 'bill.tab.cancelled' },
  { key: 'all', label: 'bill.tab.all' },
];

export default function BillsPage() {
  return (
    <Suspense>
      <Bills />
    </Suspense>
  );
}

function Bills() {
  const { can } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const { t, date } = useI18n();
  const { fmt, amounts } = useCurrency();
  const canRead = can('invoicing.bill.read');
  const canWrite = can('invoicing.bill.write');

  const [status, setStatus] = useState<BillStatusFilter>(
    (params.get('status') as BillStatusFilter) || 'open',
  );
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paginated<BillListItem> | null>(null);
  const [summary, setSummary] = useState<BillSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | string[] | null>(null);

  useEffect(() => {
    if (!canRead) return;
    api<BillSummary>('/invoicing/bills/summary')
      .then(setSummary)
      .catch(() => undefined);
  }, [canRead]);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const query = new URLSearchParams({
    status,
    ...(debounced && { search: debounced }),
    ...(currency && { currency }),
    ...(from && { from }),
    ...(to && { to }),
  }).toString();

  useEffect(() => {
    if (!canRead) return;
    let cancelled = false;
    setLoading(true);
    api<Paginated<BillListItem>>(`/invoicing/bills?${query}&page=${page}&pageSize=${PAGE_SIZE}`)
      .then((r) => {
        if (cancelled) return;
        setData(r);
        setError(null);
      })
      .catch((e) => !cancelled && setError(errorMessages(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [canRead, query, page]);

  if (!canRead) return <AccessDenied permission="invoicing.bill.read" what={t('nav.item.bills')} />;

  const pick = (s: BillStatusFilter) => {
    setStatus(s);
    setPage(1);
    router.replace(`/invoicing/bills?status=${s}`);
  };
  const filtered = Boolean(debounced || currency || from || to);
  const maxBucket = Math.max(1, ...(summary?.aging.map((a) => a.count) ?? [1]));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <InvoicingHero
        icon={ReceiptText}
        title={t('nav.item.bills')}
        subtitle={t('bill.subtitle')}
        crumb={[{ label: t('nav.item.bills') }]}
        actions={
          canWrite && (
            <Link href="/invoicing/bills/new" className={heroButtonInv}>
              <Plus className="size-4" /> {t('bill.new')}
            </Link>
          )
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={FilePen}
          label={t('bill.stat.drafts')}
          value={summary?.drafts ?? null}
          tone="slate"
          delay={60}
          onClick={() => pick('DRAFT')}
        />
        <StatTile
          icon={ReceiptText}
          label={t('bill.stat.open')}
          value={summary?.open ?? null}
          tone="violet"
          delay={120}
          onClick={() => pick('open')}
        />
        <StatTile
          icon={AlarmClock}
          label={t('bill.stat.overdue')}
          value={summary?.overdue ?? null}
          tone="red"
          delay={180}
          onClick={() => pick('overdue')}
        />
        <div
          className="animate-rise flex flex-col justify-center rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          style={{ animationDelay: '240ms' }}
        >
          <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <Wallet className="size-3.5 text-emerald-600" /> {t('bill.stat.paidMonth')}
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900 tabular-nums">
            {summary ? amounts(summary.paidThisMonth) : '—'}
          </p>
        </div>
      </div>

      {/* Balances and aging */}
      {summary && summary.open > 0 && (
        <section
          className="animate-rise grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:grid-cols-3"
          style={{ animationDelay: '160ms' }}
        >
          <div>
            <p className="text-xs font-medium text-slate-500">{t('bill.balanceDue')}</p>
            <p className="mt-1 text-lg font-semibold text-indigo-700 tabular-nums">
              {amounts(summary.openBalance)}
            </p>
            {summary.overdue > 0 && (
              <p className="mt-1 text-sm text-red-600 tabular-nums">
                {t('bill.ofWhichOverdue', { amount: amounts(summary.overdueBalance) })}
              </p>
            )}
          </div>
          <div className="lg:col-span-2">
            <p className="mb-2 text-xs font-medium text-slate-500">{t('bill.aging')}</p>
            <div className="grid grid-cols-5 gap-2">
              {summary.aging.map((a, i) => (
                <div key={a.bucket} className="flex flex-col items-center gap-1">
                  <div className="flex h-16 w-full items-end overflow-hidden rounded-lg bg-slate-50">
                    <div
                      className={clsx(
                        'w-full origin-bottom rounded-t-md bg-gradient-to-t transition-all duration-700',
                        i === 0
                          ? 'from-indigo-400 to-violet-400'
                          : i < 3
                            ? 'from-amber-400 to-orange-400'
                            : 'from-rose-500 to-red-500',
                      )}
                      style={{
                        height: `${a.count ? Math.max(8, (a.count / maxBucket) * 100) : 0}%`,
                        animation: `rise 0.6s ${200 + i * 80}ms both`,
                      }}
                    />
                  </div>
                  <span className="text-[11px] font-medium text-slate-600">
                    {t(`bill.bucket.${AGING_BUCKETS[i]}`)}
                  </span>
                  <span className="text-center text-[11px] leading-tight text-slate-400 tabular-nums">
                    {a.count ? amounts(a.balance) : '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <div
        className="animate-rise overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
        style={{ animationDelay: '200ms' }}
      >
        <div className="flex flex-wrap gap-1 border-b border-slate-100 px-3 pt-3">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => pick(tab.key)}
              className={clsx(
                'relative rounded-t-lg px-3 py-2 text-sm font-medium transition',
                status === tab.key
                  ? 'text-indigo-700 after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-gradient-to-r after:from-violet-500 after:to-indigo-600'
                  : 'text-slate-500 hover:text-slate-800',
              )}
            >
              {t(tab.label)}
              {tab.key === 'overdue' && summary && summary.overdue > 0 && (
                <span className="ml-1.5 rounded-full bg-red-100 px-1.5 text-xs text-red-700">
                  {summary.overdue}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-3">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={t('bill.search')}
              className={clsx(inputClass, 'pl-9')}
            />
          </div>
          <select
            value={currency}
            onChange={(e) => {
              setCurrency(e.target.value as CurrencyCode | '');
              setPage(1);
            }}
            className={fieldClass}
            aria-label={t('bill.f.currency')}
          >
            <option value="">{t('bill.allCurrencies')}</option>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-500">
            {t('gr.from')}
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
              className={clsx(inputClass, 'w-auto')}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-500">
            {t('gr.to')}
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
              className={clsx(inputClass, 'w-auto')}
            />
          </label>
          {(from || to || currency) && (
            <button
              onClick={() => {
                setFrom('');
                setTo('');
                setCurrency('');
                setPage(1);
              }}
              className="animate-pop inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-800 ring-1 ring-indigo-500/30 hover:bg-indigo-100"
            >
              <X className="size-3.5" /> {t('bill.clearFilters')}
            </button>
          )}
          <ExportButton path={`/invoicing/bills/export?${query}`} fileName="supplier-bills.xlsx" />
          {loading && <Spinner className="text-indigo-500" />}
        </div>

        {error ? (
          <div className="p-4">
            <ErrorBox message={error} />
          </div>
        ) : data && data.items.length === 0 && !loading ? (
          <EmptyState
            icon={ReceiptText}
            title={filtered ? t('bill.emptyMatch') : t('bill.emptyNone')}
            text={filtered ? t('bill.emptyMatchText') : t('bill.emptyNoneText')}
            action={
              !filtered &&
              canWrite && (
                <Link
                  href="/invoicing/bills/new"
                  className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm"
                >
                  <Plus className="size-4" /> {t('bill.new')}
                </Link>
              )
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80 text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5">{t('bill.col.number')}</th>
                  <th className="px-4 py-2.5">{t('bill.col.supplier')}</th>
                  <th className="hidden px-4 py-2.5 md:table-cell">{t('bill.col.due')}</th>
                  <th className="px-4 py-2.5 text-right">{t('bill.col.total')}</th>
                  <th className="hidden px-4 py-2.5 text-right sm:table-cell">
                    {t('bill.col.balance')}
                  </th>
                  <th className="px-4 py-2.5">{t('bill.col.status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data?.items.map((b, i) => {
                  const paidPct =
                    Number(b.total) > 0
                      ? Math.min(100, (Number(b.amountPaid) / Number(b.total)) * 100)
                      : 0;
                  return (
                    <tr
                      key={b.id}
                      onClick={() => router.push(`/invoicing/bills/${b.id}`)}
                      style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}
                      className="animate-rise group cursor-pointer transition hover:bg-indigo-50/40"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/invoicing/bills/${b.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-mono text-xs font-semibold whitespace-nowrap text-slate-900 group-hover:text-indigo-700"
                        >
                          {b.number}
                        </Link>
                        <p className="text-xs text-slate-400">{date(b.issueDate)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-slate-800">{b.supplier.name}</span>
                        <p className="font-mono text-xs text-slate-400">
                          {b.supplierRef ?? '—'}
                          {b.purchaseOrder && ` · ${b.purchaseOrder.number}`}
                        </p>
                      </td>
                      <td className="hidden px-4 py-3 whitespace-nowrap md:table-cell">
                        <span className={clsx(b.overdue ? 'text-red-700' : 'text-slate-600')}>
                          {date(b.dueDate)}
                        </span>
                        <div className="mt-0.5">
                          <OverdueBadge days={b.daysOverdue} />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-medium whitespace-nowrap text-slate-900 tabular-nums">
                        {fmt(b.total, b.currency)}
                      </td>
                      <td className="hidden px-4 py-3 text-right whitespace-nowrap sm:table-cell">
                        {b.status === 'DRAFT' || b.status === 'CANCELLED' ? (
                          <span className="text-slate-300">—</span>
                        ) : (
                          <>
                            <span
                              className={clsx(
                                'font-medium tabular-nums',
                                Number(b.balance) > 0 ? 'text-indigo-700' : 'text-emerald-600',
                              )}
                            >
                              {fmt(b.balance, b.currency)}
                            </span>
                            <div className="mt-1 ml-auto h-1 w-24 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-all duration-700"
                                style={{ width: `${paidPct}%` }}
                              />
                            </div>
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <BillStatusBadge status={b.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > 0 && (
          <Pager
            page={page}
            pageSize={PAGE_SIZE}
            total={data.total}
            rangeKey="pager.bills"
            onPage={setPage}
          />
        )}
      </div>
    </div>
  );
}
