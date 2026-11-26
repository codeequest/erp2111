'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import { CalendarClock, ClipboardList, Plus, Search, X } from 'lucide-react';
import type {
  Paginated,
  PurchaseOrderListItem,
  PurchaseOrderStatusFilter,
  SupplierDetail,
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
  PoStatusBadge,
  PurchasingHero,
  Spinner,
  btnPrimary,
  errorMessages,
  heroButton,
  inputClass,
} from '@/components/purchasing/ui';

const PAGE_SIZE = 25;
const TABS: { key: PurchaseOrderStatusFilter; label: MessageKey }[] = [
  { key: 'all', label: 'po.tab.all' },
  { key: 'DRAFT', label: 'po.tab.drafts' },
  { key: 'open', label: 'po.tab.open' },
  { key: 'RECEIVED', label: 'po.tab.received' },
  { key: 'CANCELLED', label: 'po.tab.cancelled' },
];

export default function PurchaseOrdersPage() {
  return (
    <Suspense>
      <OrdersList />
    </Suspense>
  );
}

function OrdersList() {
  const { can } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const supplierId = params.get('supplierId');
  const canRead = can('purchasing.order.read');
  const canWrite = can('purchasing.order.write');
  const { t, money, date } = useI18n();

  const [status, setStatus] = useState<PurchaseOrderStatusFilter>('all');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paginated<PurchaseOrderListItem> | null>(null);
  const [supplier, setSupplier] = useState<SupplierDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | string[] | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
    if (!supplierId) return setSupplier(null);
    api<SupplierDetail>(`/purchasing/suppliers/${supplierId}`)
      .then(setSupplier)
      .catch(() => setSupplier(null));
  }, [supplierId]);

  useEffect(() => {
    if (!canRead) return;
    let cancelled = false;
    setLoading(true);
    const qs = new URLSearchParams({ status, page: String(page), pageSize: String(PAGE_SIZE) });
    if (debounced) qs.set('search', debounced);
    if (supplierId) qs.set('supplierId', supplierId);
    api<Paginated<PurchaseOrderListItem>>(`/purchasing/orders?${qs}`)
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
  }, [canRead, status, page, debounced, supplierId]);

  if (!canRead) {
    return <AccessDenied permission="purchasing.order.read" what={t('po.title')} />;
  }

  const today = new Date().toISOString().slice(0, 10);
  const filtered = Boolean(debounced || status !== 'all' || supplierId);
  // The export downloads what the list shows (same status, supplier and search).
  const exportQuery = new URLSearchParams({
    status,
    ...(debounced && { search: debounced }),
    ...(supplierId && { supplierId }),
  }).toString();

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PurchasingHero
        icon={ClipboardList}
        title={t('po.title')}
        subtitle={t('po.subtitle')}
        crumb={[{ label: t('po.title') }]}
        actions={
          <>
            <ExportButton
              onHero
              path={`/purchasing/orders/export?${exportQuery}`}
              fileName="purchase-orders.xlsx"
            />
            {canWrite && (
              <Link
                href={`/purchasing/orders/new${supplierId ? `?supplierId=${supplierId}` : ''}`}
                className={heroButton}
              >
                <Plus className="size-4" /> {t('po.new')}
              </Link>
            )}
          </>
        }
      />

      <div
        className="animate-rise overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
        style={{ animationDelay: '100ms' }}
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
              placeholder={t('po.search')}
              className={clsx(inputClass, 'pl-9')}
            />
          </div>
          <div className="flex overflow-x-auto rounded-lg bg-slate-100 p-1">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => {
                  setStatus(tab.key);
                  setPage(1);
                }}
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
          {supplierId && (
            <span className="animate-pop inline-flex items-center gap-1.5 rounded-full bg-amber-50 py-1 pr-1.5 pl-3 text-xs font-medium text-orange-800 ring-1 ring-amber-500/30">
              {supplier ? `${supplier.code} · ${supplier.name}` : t('po.supplierChip')}
              <button
                onClick={() => router.push('/purchasing/orders')}
                aria-label={t('po.clearSupplier')}
                className="rounded-full p-0.5 hover:bg-amber-100"
              >
                <X className="size-3.5" />
              </button>
            </span>
          )}
          {loading && <Spinner className="text-amber-500" />}
        </div>

        {error ? (
          <div className="p-4">
            <ErrorBox message={error} />
          </div>
        ) : data && data.items.length === 0 && !loading ? (
          <EmptyState
            icon={ClipboardList}
            title={filtered ? t('po.emptyMatch') : t('po.emptyNone')}
            text={filtered ? t('po.emptyMatchText') : t('po.emptyNoneText')}
            action={
              canWrite &&
              !filtered && (
                <Link href="/purchasing/orders/new" className={btnPrimary}>
                  <Plus className="size-4" /> {t('po.createFirst')}
                </Link>
              )
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80 text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5">{t('po.col.number')}</th>
                  <th className="px-4 py-2.5">{t('po.col.supplier')}</th>
                  <th className="hidden px-4 py-2.5 sm:table-cell">{t('po.col.date')}</th>
                  <th className="hidden px-4 py-2.5 lg:table-cell">{t('po.col.expected')}</th>
                  <th className="hidden px-4 py-2.5 md:table-cell">{t('po.col.warehouse')}</th>
                  <th className="px-4 py-2.5 text-right">{t('po.col.total')}</th>
                  <th className="px-4 py-2.5">{t('po.col.status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data?.items.map((o, i) => {
                  const late =
                    o.expectedDate &&
                    o.expectedDate < today &&
                    (o.status === 'CONFIRMED' || o.status === 'PARTIALLY_RECEIVED');
                  return (
                    <tr
                      key={o.id}
                      onClick={() => router.push(`/purchasing/orders/${o.id}`)}
                      style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}
                      className="animate-rise group cursor-pointer transition hover:bg-amber-50/50"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/purchasing/orders/${o.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-mono text-xs font-semibold whitespace-nowrap text-slate-900 group-hover:text-orange-700"
                        >
                          {o.number}
                        </Link>
                        <p className="text-xs text-slate-400">
                          {o.lineCount === 1 ? t('po.line') : t('po.lines', { n: o.lineCount })}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-slate-800">{o.supplier.name}</span>
                        <p className="font-mono text-xs text-slate-400">{o.supplier.code}</p>
                      </td>
                      <td className="hidden px-4 py-3 whitespace-nowrap text-slate-600 sm:table-cell">
                        {date(o.orderDate)}
                      </td>
                      <td className="hidden px-4 py-3 whitespace-nowrap lg:table-cell">
                        {o.expectedDate ? (
                          <span
                            className={clsx(
                              'inline-flex items-center gap-1',
                              late ? 'font-medium text-red-600' : 'text-slate-600',
                            )}
                            title={late ? t('po.late') : undefined}
                          >
                            {late && <CalendarClock className="size-3.5" />}
                            {date(o.expectedDate)}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td
                        className="hidden px-4 py-3 text-slate-600 md:table-cell"
                        title={o.warehouse.name}
                      >
                        {o.warehouse.code}
                      </td>
                      <td className="px-4 py-3 text-right font-medium whitespace-nowrap text-slate-900 tabular-nums">
                        {money(o.total)}
                      </td>
                      <td className="px-4 py-3">
                        <PoStatusBadge status={o.status} />
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
      </div>
    </div>
  );
}
