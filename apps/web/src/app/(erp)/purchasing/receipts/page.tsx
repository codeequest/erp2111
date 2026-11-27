'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import {
  CalendarCheck2,
  ClipboardList,
  FilePen,
  FileSpreadsheet,
  PackageCheck,
  PackagePlus,
  Pencil,
  Printer,
  Search,
  X,
} from 'lucide-react';
import type {
  GoodsReceiptListItem,
  GoodsReceiptStatusFilter,
  GoodsReceiptSummary,
  Paginated,
} from '@erp/shared';
import { api, apiDownload } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/messages';
import { AccessDenied } from '@/components/page-header';
import {
  EmptyState,
  ErrorBox,
  ExportButton,
  Pager,
  PurchasingHero,
  ReceiptStatusBadge,
  Spinner,
  StatTile,
  errorMessages,
  btnPrimary,
  heroButton,
  inputClass,
} from '@/components/purchasing/ui';

const PAGE_SIZE = 25;

const TABS: { key: GoodsReceiptStatusFilter; label: MessageKey }[] = [
  { key: 'all', label: 'grx.tab.all' },
  { key: 'DRAFT', label: 'grx.tab.drafts' },
  { key: 'POSTED', label: 'grx.tab.posted' },
  { key: 'CANCELLED', label: 'grx.tab.cancelled' },
];

const BILLING_CLASS = {
  none: 'bg-slate-50 text-slate-500 ring-slate-400/20',
  partial: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  full: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
} as const;

export default function GoodsReceiptsPage() {
  return (
    <Suspense>
      <GoodsReceipts />
    </Suspense>
  );
}

/** Goods receipts: the receipt documents only (draft, validated, cancelled). */
function GoodsReceipts() {
  const { can } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const { t, money, dateTime, lang } = useI18n();
  const canRead = can('purchasing.order.read');
  const canCreate = can('purchasing.receipt.create');

  const [summary, setSummary] = useState<GoodsReceiptSummary | null>(null);
  const [status, setStatus] = useState<GoodsReceiptStatusFilter>(
    (params.get('status') as GoodsReceiptStatusFilter) || 'all',
  );
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paginated<GoodsReceiptListItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | string[] | null>(null);

  useEffect(() => {
    if (!canRead) return;
    api<GoodsReceiptSummary>('/purchasing/receipts/summary')
      .then(setSummary)
      .catch(() => undefined);
  }, [canRead]);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const query = new URLSearchParams({
    ...(status !== 'all' && { status }),
    ...(debounced && { search: debounced }),
    ...(from && { from }),
    ...(to && { to }),
  }).toString();

  useEffect(() => {
    if (!canRead) return;
    let cancelled = false;
    setLoading(true);
    api<Paginated<GoodsReceiptListItem>>(
      `/purchasing/receipts?${query}${query ? '&' : ''}page=${page}&pageSize=${PAGE_SIZE}`,
    )
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
  }, [canRead, query, page]);

  if (!canRead) return <AccessDenied permission="purchasing.order.read" what={t('gr.title')} />;

  const pick = (s: GoodsReceiptStatusFilter) => {
    setStatus(s);
    setPage(1);
  };
  const filtered = Boolean(debounced || from || to || status !== 'all');

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PurchasingHero
        icon={PackageCheck}
        title={t('gr.title')}
        subtitle={t('gr.subtitle')}
        crumb={[{ label: t('gr.title') }]}
        actions={
          canCreate && (
            <Link
              href="/purchasing/receipts/new"
              className={clsx(heroButton, 'px-5 py-3 text-base shadow-lg ring-4 ring-white/30')}
            >
              <PackagePlus className="size-5" /> {t('grr.new')}
            </Link>
          )
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          icon={FilePen}
          label={t('grr.stat.drafts')}
          value={summary?.drafts ?? null}
          tone="slate"
          delay={60}
          onClick={() => pick('DRAFT')}
        />
        <StatTile
          icon={ClipboardList}
          label={t('grr.stat.toReceive')}
          value={summary ? summary.waiting + summary.inProgress : null}
          tone="amber"
          delay={120}
          onClick={canCreate ? () => router.push('/purchasing/receipts/new') : undefined}
        />
        <StatTile
          icon={CalendarCheck2}
          label={
            summary ? t('grr.stat.month', { value: money(summary.monthValue) }) : t('gr.stat.month')
          }
          value={summary?.monthReceipts ?? null}
          tone="emerald"
          delay={180}
          onClick={() => pick('POSTED')}
        />
      </div>

      <div
        className="animate-rise overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
        style={{ animationDelay: '180ms' }}
      >
        <div className="flex flex-wrap gap-1 border-b border-slate-100 px-3 pt-3">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => pick(tab.key)}
              className={clsx(
                'relative rounded-t-lg px-3 py-2 text-sm font-medium transition',
                status === tab.key
                  ? 'text-orange-700 after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-gradient-to-r after:from-amber-500 after:to-orange-600'
                  : 'text-slate-500 hover:text-slate-800',
              )}
            >
              {t(tab.label)}
              {tab.key === 'DRAFT' && summary && summary.drafts > 0 && (
                <span className="ml-1.5 rounded-full bg-slate-200 px-1.5 text-xs text-slate-700">
                  {summary.drafts}
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
            path={`/purchasing/receipts/export${query ? `?${query}` : ''}`}
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
            action={
              !filtered &&
              canCreate && (
                <Link href="/purchasing/receipts/new" className={btnPrimary}>
                  <PackagePlus className="size-4" /> {t('grr.new')}
                </Link>
              )
            }
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
                  <th className="px-4 py-2.5 text-right">{t('gr.col.value')}</th>
                  <th className="px-4 py-2.5">{t('grx.col.status')}</th>
                  <th className="px-4 py-2.5 text-right">{t('grr.col.actions')}</th>
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
                      <span className="font-mono text-xs whitespace-nowrap text-slate-600">
                        {r.purchaseOrder.number}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 font-mono text-xs text-slate-600 lg:table-cell">
                      {r.supplierRef ?? <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-medium whitespace-nowrap text-slate-900 tabular-nums">
                      {money(r.value)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <ReceiptStatusBadge status={r.status} />
                        {r.status === 'POSTED' && (
                          <span
                            className={clsx(
                              'rounded-full px-1.5 py-px text-[10px] font-medium whitespace-nowrap ring-1',
                              BILLING_CLASS[r.billing],
                            )}
                          >
                            {t(`grx.billing.${r.billing}`)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      {r.status === 'POSTED' ? (
                        <div className="inline-flex gap-1">
                          <Link
                            href={`/print/receipts/${r.id}`}
                            target="_blank"
                            title={t('grr.print')}
                            aria-label={`${t('grr.print')} ${r.number}`}
                            className="rounded-lg p-2 text-slate-500 ring-1 ring-slate-200 transition hover:bg-amber-50 hover:text-orange-700"
                          >
                            <Printer className="size-4" />
                          </Link>
                          <button
                            type="button"
                            title={t('common.exportExcel')}
                            aria-label={`${t('common.exportExcel')} ${r.number}`}
                            onClick={() =>
                              void apiDownload(
                                `/purchasing/receipts/${r.id}/export?lang=${lang}`,
                                `${r.number}.xlsx`,
                              )
                            }
                            className="rounded-lg p-2 text-emerald-600 ring-1 ring-slate-200 transition hover:bg-emerald-50"
                          >
                            <FileSpreadsheet className="size-4" />
                          </button>
                        </div>
                      ) : r.status === 'DRAFT' && canCreate ? (
                        <Link
                          href={`/purchasing/receipts/new?draftId=${r.id}`}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-orange-700 ring-1 ring-amber-500/30 transition hover:bg-amber-50"
                        >
                          <Pencil className="size-3.5" /> {t('grr.continue')}
                        </Link>
                      ) : null}
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
    </div>
  );
}
