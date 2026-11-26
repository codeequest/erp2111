'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import {
  CalendarCheck2,
  CalendarClock,
  Clock3,
  PackageCheck,
  Receipt,
  Search,
  Truck,
  X,
} from 'lucide-react';
import type {
  DeliveryListItem,
  DeliveryStatusFilter,
  GoodsReceiptListItem,
  GoodsReceiptSummary,
  Paginated,
} from '@erp/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/messages';
import { AccessDenied } from '@/components/page-header';
import { DeliveryBadge } from '@/components/purchasing/delivery';
import { SupplierInvoiceDialog } from '@/components/purchasing/invoice-dialog';
import {
  EmptyState,
  ErrorBox,
  ExportButton,
  Pager,
  PurchasingHero,
  Spinner,
  StatTile,
  errorMessages,
  inputClass,
  useSuccess,
} from '@/components/purchasing/ui';

const PAGE_SIZE = 25;
type View = 'deliveries' | 'receipts';

const TABS: { key: DeliveryStatusFilter; label: MessageKey }[] = [
  { key: 'open', label: 'dl.tab.open' },
  { key: 'waiting', label: 'dl.tab.waiting' },
  { key: 'in_progress', label: 'dl.tab.in_progress' },
  { key: 'delivered', label: 'dl.tab.delivered' },
  { key: 'all', label: 'dl.tab.all' },
];

export default function DeliveriesPage() {
  return (
    <Suspense>
      <Deliveries />
    </Suspense>
  );
}

function Deliveries() {
  const { can } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const { t, money } = useI18n();
  const canRead = can('purchasing.order.read');

  const view: View = params.get('view') === 'receipts' ? 'receipts' : 'deliveries';
  const [status, setStatus] = useState<DeliveryStatusFilter>('open');
  const [lateOnly, setLateOnly] = useState(false);
  const [summary, setSummary] = useState<GoodsReceiptSummary | null>(null);

  useEffect(() => {
    if (!canRead) return;
    api<GoodsReceiptSummary>('/purchasing/receipts/summary')
      .then(setSummary)
      .catch(() => setSummary(null));
  }, [canRead]);

  if (!canRead) {
    return <AccessDenied permission="purchasing.order.read" what={t('gr.title')} />;
  }

  const show = (next: View, s?: DeliveryStatusFilter, late = false) => {
    if (s) setStatus(s);
    setLateOnly(late);
    router.replace(
      next === 'receipts' ? '/purchasing/receipts?view=receipts' : '/purchasing/receipts',
    );
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PurchasingHero
        icon={Truck}
        title={t('gr.title')}
        subtitle={t('gr.subtitle')}
        crumb={[{ label: t('gr.title') }]}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={Clock3}
          label={t('dl.stat.waiting')}
          value={summary?.waiting ?? null}
          tone="sky"
          delay={60}
          onClick={() => show('deliveries', 'waiting')}
        />
        <StatTile
          icon={Truck}
          label={t('dl.stat.inProgress')}
          value={summary?.inProgress ?? null}
          tone="amber"
          delay={120}
          onClick={() => show('deliveries', 'in_progress')}
        />
        <StatTile
          icon={CalendarCheck2}
          label={t('dl.stat.delivered')}
          value={summary?.deliveredThisMonth ?? null}
          tone="emerald"
          delay={180}
          onClick={() => show('deliveries', 'delivered')}
        />
        <StatTile
          icon={CalendarClock}
          label={t('dl.stat.late')}
          value={summary?.late ?? null}
          tone="slate"
          delay={240}
          onClick={() => show('deliveries', 'open', true)}
        />
      </div>

      {/* View switch: delivery follow-up (orders) or receipt documents */}
      <div
        className="animate-rise flex flex-wrap items-center justify-between gap-3"
        style={{ animationDelay: '120ms' }}
      >
        <div className="inline-flex rounded-xl bg-slate-100 p-1">
          {(
            [
              ['deliveries', 'dl.view.deliveries', Truck],
              ['receipts', 'dl.view.receipts', PackageCheck],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => show(key)}
              className={clsx(
                'inline-flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium transition',
                view === key
                  ? 'bg-white text-orange-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800',
              )}
            >
              <Icon className="size-4" /> {t(label)}
            </button>
          ))}
        </div>
        {summary && (
          <p className="text-sm text-slate-500">
            {t('dl.monthLine', { n: summary.monthReceipts, value: money(summary.monthValue) })}
          </p>
        )}
      </div>

      {view === 'deliveries' ? (
        <DeliveryList
          status={status}
          setStatus={setStatus}
          lateOnly={lateOnly}
          setLateOnly={setLateOnly}
        />
      ) : (
        <ReceiptList />
      )}
    </div>
  );
}

// ── Delivery follow-up ───────────────────────────────────────────────────────

function DeliveryList({
  status,
  setStatus,
  lateOnly,
  setLateOnly,
}: {
  status: DeliveryStatusFilter;
  setStatus: (s: DeliveryStatusFilter) => void;
  lateOnly: boolean;
  setLateOnly: (v: boolean) => void;
}) {
  const router = useRouter();
  const { can } = useAuth();
  const { t, date, money } = useI18n();
  const canReceive = can('purchasing.receipt.create');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paginated<DeliveryListItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | string[] | null>(null);
  // Delivered order whose supplier invoice is being recorded (on its completing receipt)
  const [invoiceFor, setInvoiceFor] = useState<DeliveryListItem | null>(null);
  const [reload, setReload] = useState(0);
  const { burst, celebrate } = useSuccess();
  // The supplier invoice exists only once an order is delivered in full.
  const showInvoice = status === 'delivered' || status === 'all';

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => setPage(1), [status, lateOnly, debounced]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const qs = new URLSearchParams({ status, page: String(page), pageSize: String(PAGE_SIZE) });
    if (debounced) qs.set('search', debounced);
    if (lateOnly) qs.set('lateOnly', 'true');
    api<Paginated<DeliveryListItem>>(`/purchasing/receipts/deliveries?${qs}`)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setError(null);
      })
      .catch((e) => !cancelled && setError(errorMessages(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [status, lateOnly, page, debounced, reload]);

  const exportQuery = new URLSearchParams({
    status,
    ...(debounced && { search: debounced }),
    ...(lateOnly && { lateOnly: 'true' }),
  }).toString();

  return (
    <div
      className="animate-rise overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
      style={{ animationDelay: '180ms' }}
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('dl.search')}
            className={clsx(inputClass, 'pl-9')}
          />
        </div>
        <div className="flex overflow-x-auto rounded-lg bg-slate-100 p-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatus(tab.key)}
              className={clsx(
                'rounded-md px-3 py-1 text-sm font-medium whitespace-nowrap transition',
                status === tab.key
                  ? 'bg-white text-orange-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800',
              )}
            >
              {t(tab.label)}
            </button>
          ))}
        </div>
        <button
          onClick={() => setLateOnly(!lateOnly)}
          aria-pressed={lateOnly}
          className={clsx(
            'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 transition',
            lateOnly
              ? 'animate-pop bg-red-50 text-red-700 ring-red-500/30'
              : 'text-slate-500 ring-slate-300 hover:bg-slate-50',
          )}
        >
          <CalendarClock className="size-3.5" /> {t('dl.lateOnly')}
          {lateOnly && <X className="size-3.5" />}
        </button>
        <ExportButton
          path={`/purchasing/receipts/deliveries/export?${exportQuery}`}
          fileName="deliveries.xlsx"
        />
        {loading && <Spinner className="text-amber-500" />}
      </div>

      {error ? (
        <div className="p-4">
          <ErrorBox message={error} />
        </div>
      ) : data && data.items.length === 0 && !loading ? (
        <EmptyState
          icon={Truck}
          title={t('dl.empty')}
          text={debounced || lateOnly ? t('gr.emptyMatchText') : t('dl.emptyText')}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/80 text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-2.5">{t('dl.col.order')}</th>
                <th className="px-4 py-2.5">{t('dl.col.status')}</th>
                <th className="px-4 py-2.5">{t('dl.col.date')}</th>
                <th className="hidden w-40 px-4 py-2.5 md:table-cell">{t('dl.col.progress')}</th>
                <th className="hidden px-4 py-2.5 lg:table-cell">{t('dl.col.receipts')}</th>
                {showInvoice && (
                  <th className="hidden px-4 py-2.5 xl:table-cell">{t('dl.col.invoice')}</th>
                )}
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data?.items.map((d, i) => {
                const invoices = d.receipts.filter((r) => r.supplierInvoiceNumber);
                return (
                  <tr
                    key={d.order.id}
                    onClick={() => router.push(`/purchasing/orders/${d.order.id}`)}
                    style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}
                    className="animate-rise group cursor-pointer align-top transition hover:bg-amber-50/50"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/purchasing/orders/${d.order.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-mono text-xs font-semibold whitespace-nowrap text-slate-900 group-hover:text-orange-700"
                      >
                        {d.order.number}
                      </Link>
                      <p className="font-medium text-slate-800">{d.supplier.name}</p>
                      <p className="text-xs whitespace-nowrap text-slate-400">
                        {t('dl.ordered', { date: date(d.order.orderDate) })} ·{' '}
                        {money(d.order.total)}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <DeliveryBadge status={d.status} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <DeliveryDates d={d} />
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                        <span className="font-medium text-slate-700 tabular-nums">
                          {d.progressPct} %
                        </span>
                        <span>{t('dl.linesDone', { done: d.linesDone, n: d.lineCount })}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={clsx(
                            'h-full rounded-full transition-[width] duration-700',
                            d.status === 'delivered'
                              ? 'bg-emerald-500'
                              : 'bg-gradient-to-r from-amber-400 to-orange-500',
                          )}
                          style={{ width: `${d.progressPct}%` }}
                        />
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      {d.receipts.length === 0 ? (
                        <span className="text-slate-300">—</span>
                      ) : (
                        <ul className="space-y-0.5">
                          {d.receipts.slice(-3).map((r) => (
                            <li key={r.id} className="text-xs whitespace-nowrap">
                              <Link
                                href={`/purchasing/receipts/${r.id}`}
                                onClick={(e) => e.stopPropagation()}
                                className="font-mono font-semibold text-slate-700 hover:text-orange-700 hover:underline"
                              >
                                {r.number}
                              </Link>
                              {r.supplierRef && (
                                <span className="text-slate-400"> · BL {r.supplierRef}</span>
                              )}
                            </li>
                          ))}
                          {d.receipts.length > 3 && (
                            <li className="text-xs text-slate-400">
                              {t('dl.more', { n: d.receipts.length - 3 })}
                            </li>
                          )}
                        </ul>
                      )}
                    </td>
                    {showInvoice && (
                      <td className="hidden px-4 py-3 xl:table-cell">
                        {d.status !== 'delivered' ? (
                          <span className="text-slate-300" title={t('inv.afterDelivery')}>
                            —
                          </span>
                        ) : invoices.length === 0 ? (
                          canReceive ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setInvoiceFor(d);
                              }}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium whitespace-nowrap text-amber-800 transition hover:bg-amber-100 active:scale-[0.98]"
                            >
                              <Receipt className="size-3.5" /> {t('inv.record')}
                            </button>
                          ) : (
                            <span className="text-xs text-amber-700">{t('inv.missing')}</span>
                          )
                        ) : (
                          <ul className="space-y-0.5">
                            {invoices.map((r) => (
                              <li key={r.id} className="text-xs whitespace-nowrap">
                                <span className="font-mono font-medium text-slate-700">
                                  {r.supplierInvoiceNumber}
                                </span>
                                <span className="text-slate-400">
                                  {' '}
                                  · {date(r.supplierInvoiceDate)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3 text-right">
                      {canReceive && d.status !== 'delivered' && (
                        <Link
                          href={`/purchasing/receipts/new?orderId=${d.order.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 px-3 py-1.5 text-xs font-medium whitespace-nowrap text-white shadow-sm shadow-orange-600/20 transition hover:brightness-105 active:scale-[0.98]"
                        >
                          <PackageCheck className="size-3.5" /> {t('gr.receiveBtn')}
                        </Link>
                      )}
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
          rangeKey="pager.orders"
          onPage={setPage}
        />
      )}
      {invoiceFor && invoiceFor.receipts.length > 0 && (
        <SupplierInvoiceDialog
          open
          onClose={() => setInvoiceFor(null)}
          receipt={{
            id: invoiceFor.receipts.at(-1)!.id,
            number: invoiceFor.receipts.at(-1)!.number,
            orderNumber: invoiceFor.order.number,
            supplierInvoiceNumber: null,
            supplierInvoiceDate: null,
          }}
          onSaved={(r) => {
            setInvoiceFor(null);
            setReload((n) => n + 1);
            celebrate(t('inv.saved', { number: r.supplierInvoiceNumber ?? '' }));
          }}
        />
      )}
      {burst}
    </div>
  );
}

/** Expected date while waiting; delivery date once goods are in, with on time / late. */
function DeliveryDates({ d }: { d: DeliveryListItem }) {
  const { t, date } = useI18n();
  if (d.status === 'delivered') {
    return (
      <div>
        <p className="text-xs text-slate-500">{t('dl.deliveredOn')}</p>
        <p className="font-medium text-slate-800">{date(d.lastDeliveryAt)}</p>
        {d.expectedDate && (
          <p className={clsx('text-xs', d.late ? 'font-medium text-red-600' : 'text-emerald-600')}>
            {d.late
              ? t('dl.lateVs', { date: date(d.expectedDate) })
              : t('dl.onTime', { date: date(d.expectedDate) })}
          </p>
        )}
      </div>
    );
  }
  return (
    <div>
      <p className="text-xs text-slate-500">{t('dl.expectedOn')}</p>
      {d.expectedDate ? (
        <p
          className={clsx(
            'inline-flex items-center gap-1 font-medium',
            d.late ? 'text-red-600' : 'text-slate-800',
          )}
        >
          {d.late && <CalendarClock className="size-3.5" />}
          {date(d.expectedDate)}
          {d.late && <span className="text-xs font-normal">· {t('gr.late')}</span>}
        </p>
      ) : (
        <p className="text-slate-400">{t('gr.noExpected')}</p>
      )}
      {d.lastDeliveryAt && (
        <p className="text-xs text-slate-500">
          {t('dl.lastDelivery', { date: date(d.lastDeliveryAt) })}
        </p>
      )}
    </div>
  );
}

// ── Receipt documents ────────────────────────────────────────────────────────

function ReceiptList() {
  const router = useRouter();
  const { t, money, date, dateTime } = useI18n();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paginated<GoodsReceiptListItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | string[] | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (debounced) qs.set('search', debounced);
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    api<Paginated<GoodsReceiptListItem>>(`/purchasing/receipts?${qs}`)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setError(null);
      })
      .catch((e) => !cancelled && setError(errorMessages(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [page, debounced, from, to]);

  const filtered = Boolean(debounced || from || to);
  const exportQuery = new URLSearchParams({
    ...(debounced && { search: debounced }),
    ...(from && { from }),
    ...(to && { to }),
  }).toString();

  return (
    <div
      className="animate-rise overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
      style={{ animationDelay: '180ms' }}
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={t('gr.search')}
            className={clsx(inputClass, 'pl-9')}
          />
        </div>
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
        {(from || to) && (
          <button
            onClick={() => {
              setFrom('');
              setTo('');
              setPage(1);
            }}
            className="animate-pop inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-orange-800 ring-1 ring-amber-500/30 hover:bg-amber-100"
          >
            <X className="size-3.5" /> {t('gr.clearDates')}
          </button>
        )}
        <ExportButton
          path={`/purchasing/receipts/export${exportQuery ? `?${exportQuery}` : ''}`}
          fileName="goods-receipts.xlsx"
        />
        {loading && <Spinner className="text-amber-500" />}
      </div>

      {error ? (
        <div className="p-4">
          <ErrorBox message={error} />
        </div>
      ) : data && data.items.length === 0 && !loading ? (
        <EmptyState
          icon={PackageCheck}
          title={filtered ? t('gr.emptyMatch') : t('gr.emptyNone')}
          text={filtered ? t('gr.emptyMatchText') : t('gr.emptyNoneText')}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/80 text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-2.5">{t('gr.col.number')}</th>
                <th className="px-4 py-2.5">{t('gr.col.supplier')}</th>
                <th className="hidden px-4 py-2.5 md:table-cell">{t('gr.col.order')}</th>
                <th className="hidden px-4 py-2.5 lg:table-cell">{t('gr.col.bl')}</th>
                <th className="hidden px-4 py-2.5 lg:table-cell">{t('dl.col.invoice')}</th>
                <th className="px-4 py-2.5 text-right">{t('gr.col.value')}</th>
                <th className="hidden px-4 py-2.5 xl:table-cell">{t('gr.col.by')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data?.items.map((r, i) => (
                <tr
                  key={r.id}
                  onClick={() => router.push(`/purchasing/receipts/${r.id}`)}
                  style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}
                  className="animate-rise group cursor-pointer transition hover:bg-amber-50/50"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/purchasing/receipts/${r.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-mono text-xs font-semibold whitespace-nowrap text-slate-900 group-hover:text-orange-700"
                    >
                      {r.number}
                    </Link>
                    <p className="text-xs whitespace-nowrap text-slate-400">
                      {dateTime(r.receivedAt)}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-slate-800">{r.supplier.name}</span>
                    <p className="text-xs text-slate-400">
                      {r.lineCount === 1 ? t('po.line') : t('po.lines', { n: r.lineCount })}
                    </p>
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    <Link
                      href={`/purchasing/orders/${r.purchaseOrder.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-mono text-xs whitespace-nowrap text-slate-600 hover:text-orange-700 hover:underline"
                    >
                      {r.purchaseOrder.number}
                    </Link>
                  </td>
                  <td className="hidden px-4 py-3 font-mono text-xs text-slate-600 lg:table-cell">
                    {r.supplierRef ?? <span className="text-slate-300">—</span>}
                  </td>
                  <td className="hidden px-4 py-3 text-xs lg:table-cell">
                    {r.supplierInvoiceNumber ? (
                      <span className="inline-flex items-center gap-1 whitespace-nowrap">
                        <Receipt className="size-3.5 text-slate-400" />
                        <span className="font-mono font-medium text-slate-700">
                          {r.supplierInvoiceNumber}
                        </span>
                        <span className="text-slate-400">· {date(r.supplierInvoiceDate)}</span>
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-medium whitespace-nowrap text-slate-900 tabular-nums">
                    {money(r.value)}
                  </td>
                  <td className="hidden px-4 py-3 text-slate-600 xl:table-cell">
                    {r.createdBy.fullName}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.total > 0 && (
        <Pager
          page={page}
          pageSize={PAGE_SIZE}
          total={data.total}
          rangeKey="pager.receipts"
          onPage={setPage}
        />
      )}
    </div>
  );
}
