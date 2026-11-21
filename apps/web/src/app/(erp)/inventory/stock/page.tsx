'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import {
  AlertTriangle,
  Boxes,
  ChevronLeft,
  ChevronRight,
  Coins,
  Flag,
  History,
  PackageCheck,
  Search,
  X,
  type LucideIcon,
} from 'lucide-react';
import type {
  Paginated,
  StockLevelRow,
  StockLevels,
  StockMoveItem,
  StockMoveTypeCode,
  WarehouseItem,
} from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useApiData } from '@/lib/use-api-data';
import { formatDateTime, formatDecimal, isNegative, MOVE_TYPES } from '@/lib/inventory';
import { exportRows, fetchAllPages, FMT, type ExportColumn, type ExportFormat } from '@/lib/export';
import { ExportMenu } from '@/components/export-menu';
import {
  AccessDenied,
  AnimatedNumber,
  EmptyState,
  ErrorBanner,
  InventoryHeader,
  inputClass,
  SkeletonRows,
  Toast,
} from '@/components/ui';

/** Callbacks the tabs use to report an export result to the page. */
interface ExportFeedback {
  onExported: (message: string) => void;
  onExportError: (message: string) => void;
}
const formatName = (f: ExportFormat) => (f === 'xlsx' ? 'Excel' : 'CSV');

type Tab = 'levels' | 'moves';
const PAGE_SIZE = 50;

export default function StockPage() {
  const { can } = useAuth();
  const canRead = can('inventory.stock.read');
  const showCost = can('inventory.cost.view');
  const canOpen = can('inventory.stock.adjust') && showCost;

  const [tab, setTab] = useState<Tab>('levels');
  const [ledgerProduct, setLedgerProduct] = useState<{ id: string; name: string } | null>(null);
  const warehouses = useApiData<WarehouseItem[]>(canRead ? '/inventory/warehouses' : null);
  const [toast, setToast] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const clearToast = useCallback(() => setToast(null), []);
  const feedback: ExportFeedback = {
    onExported: (m) => {
      setExportError(null);
      setToast(m);
    },
    onExportError: setExportError,
  };

  // Key figures (all warehouses).
  const inStock = useApiData<StockLevels>(
    canRead ? '/inventory/stock/levels?inStockOnly=true&pageSize=1' : null,
  );
  const low = useApiData<StockLevels>(
    canRead ? '/inventory/stock/levels?lowOnly=true&pageSize=1' : null,
  );

  if (!canRead) return <AccessDenied permission="inventory.stock.read" what="stock levels" />;

  const openLedger = (product: { id: string; name: string }) => {
    setLedgerProduct(product);
    setTab('moves');
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <InventoryHeader
        section="Stock levels"
        title="Stock levels"
        description="What is on hand in every warehouse, and every movement behind it."
        icon={Boxes}
        actions={
          canOpen && (
            <Link
              href="/inventory/stock/opening"
              className="inline-flex items-center gap-2 rounded-lg bg-white px-3.5 py-2 text-sm font-medium text-mod-inventory shadow-sm transition-all hover:-translate-y-px hover:bg-emerald-50 hover:shadow-md"
            >
              <Flag className="size-4" /> Opening balances
            </Link>
          )
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi icon={PackageCheck} label="Products in stock" value={inStock.data?.total} delay={60} />
        <Kpi
          icon={AlertTriangle}
          label="Below minimum"
          value={low.data?.total}
          delay={120}
          warn={(low.data?.total ?? 0) > 0}
          onClick={() => setTab('levels')}
        />
        {showCost && (
          <Kpi
            icon={Coins}
            label="Stock value (average cost)"
            value={
              inStock.data?.totalValue !== undefined ? Number(inStock.data.totalValue) : undefined
            }
            decimals={2}
            delay={180}
          />
        )}
      </div>

      <div
        className="animate-fade-up flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-xs"
        style={{ animationDelay: '200ms' }}
      >
        {(
          [
            { key: 'levels', label: 'Levels', icon: Boxes },
            { key: 'moves', label: 'Movements', icon: History },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx(
              'flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-all duration-200',
              tab === t.key
                ? 'bg-emerald-50 text-mod-inventory shadow-xs ring-1 ring-emerald-200/70'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800',
            )}
          >
            <t.icon className="size-4" /> {t.label}
          </button>
        ))}
      </div>

      {exportError && <ErrorBanner message={exportError} />}

      {tab === 'levels' ? (
        <LevelsTab showCost={showCost} onOpenLedger={openLedger} {...feedback} />
      ) : (
        <MovesTab
          showCost={showCost}
          warehouses={warehouses.data ?? []}
          product={ledgerProduct}
          onClearProduct={() => setLedgerProduct(null)}
          {...feedback}
        />
      )}

      <Toast message={toast} onDone={clearToast} />
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  decimals = 0,
  delay,
  warn,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  value: number | undefined;
  decimals?: number;
  delay: number;
  warn?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={clsx(
        'group animate-fade-up flex items-center gap-4 rounded-xl border bg-white p-4 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
        warn ? 'border-amber-200' : 'border-slate-200',
        onClick && 'cursor-pointer',
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div
        className={clsx(
          'grid size-11 place-items-center rounded-xl ring-1 transition-transform group-hover:scale-105',
          warn
            ? 'bg-amber-50 text-amber-600 ring-amber-200'
            : 'bg-gradient-to-br from-emerald-50 to-teal-100 text-mod-inventory ring-emerald-200/60',
        )}
      >
        <Icon className="size-5" />
      </div>
      <div>
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="text-2xl font-semibold text-slate-900 tabular-nums">
          {value === undefined ? (
            <span className="inline-block h-7 w-16 animate-pulse rounded bg-slate-100 align-middle" />
          ) : (
            <AnimatedNumber
              value={value}
              format={(n) =>
                n.toLocaleString(undefined, {
                  minimumFractionDigits: decimals,
                  maximumFractionDigits: decimals,
                })
              }
            />
          )}
        </p>
      </div>
    </div>
  );
}

// ── Levels ──────────────────────────────────────────────────────────────────

function LevelsTab({
  showCost,
  onOpenLedger,
  onExported,
  onExportError,
}: {
  showCost: boolean;
  onOpenLedger: (p: { id: string; name: string }) => void;
} & ExportFeedback) {
  const [query, setQuery] = useState('');
  const [q, setQ] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => setQ(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);
  useEffect(() => setPage(1), [q, warehouseId, lowOnly, inStockOnly]);

  const path = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (q) p.set('q', q);
    if (warehouseId) p.set('warehouseId', warehouseId);
    if (lowOnly) p.set('lowOnly', 'true');
    if (inStockOnly) p.set('inStockOnly', 'true');
    return `/inventory/stock/levels?${p}`;
  }, [q, warehouseId, lowOnly, inStockOnly, page]);
  const { data, error, loading, reload } = useApiData<StockLevels>(path);
  const allWarehouses = useApiData<WarehouseItem[]>('/inventory/warehouses');
  const columns = warehouseId ? [] : (data?.warehouses ?? []);

  /** All rows matching the current filters, one column per warehouse in scope. */
  async function exportLevels(format: ExportFormat): Promise<number> {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (warehouseId) p.set('warehouseId', warehouseId);
    if (lowOnly) p.set('lowOnly', 'true');
    if (inStockOnly) p.set('inStockOnly', 'true');
    const { items, first } = await fetchAllPages<StockLevelRow, StockLevels>(
      `/inventory/stock/levels?${p}`,
      200,
    );
    const whs = first?.warehouses ?? [];
    type Row = StockLevelRow;
    const cols: ExportColumn<Row>[] = [
      { header: 'SKU', value: (r) => r.product.sku, width: 18 },
      { header: 'Product', value: (r) => r.product.name, width: 36 },
      { header: 'Unit', value: (r) => r.product.baseUnitCode },
      ...whs.map((w): ExportColumn<Row> => ({
        header: w.code,
        value: (r) => r.byWarehouse[w.id] ?? '0',
        type: 'number',
        numFmt: FMT.qty,
      })),
      {
        header: whs.length === 1 ? 'On hand' : 'Total',
        value: (r) => r.total,
        type: 'number',
        numFmt: FMT.qty,
      },
      { header: 'Min. stock', value: (r) => r.product.minStock, type: 'number', numFmt: FMT.qty },
      { header: 'Below minimum', value: (r) => (r.isLow ? 'Yes' : 'No') },
    ];
    if (showCost) {
      cols.push(
        { header: 'Average cost', value: (r) => r.averageCost, type: 'number', numFmt: FMT.cost },
        { header: 'Value', value: (r) => r.value, type: 'number', numFmt: FMT.money, width: 14 },
      );
    }
    await exportRows({
      format,
      fileName: 'stock-levels',
      sheetName: 'Stock levels',
      columns: cols,
      rows: items,
    });
    return items.length;
  }

  return (
    <section className="animate-fade-up overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
      {error && (
        <div className="p-3">
          <ErrorBanner message={error} onRetry={reload} />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
        <div className="relative w-full sm:w-72">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, SKU or barcode…"
            className={inputClass() + ' pl-9'}
          />
        </div>
        <select
          value={warehouseId}
          onChange={(e) => setWarehouseId(e.target.value)}
          aria-label="Warehouse"
          className={inputClass() + ' w-full sm:w-52'}
        >
          <option value="">All warehouses</option>
          {allWarehouses.data
            ?.filter((w) => w.isActive)
            .map((w) => (
              <option key={w.id} value={w.id}>
                {w.code} · {w.name}
              </option>
            ))}
        </select>
        <Toggle
          on={lowOnly}
          onClick={() => setLowOnly((v) => !v)}
          icon={AlertTriangle}
          label="Below minimum"
          tone="amber"
        />
        <Toggle
          on={inStockOnly}
          onClick={() => setInStockOnly((v) => !v)}
          icon={PackageCheck}
          label="In stock only"
        />
        <div className="ml-auto flex items-center gap-3">
          {data && (
            <span className="hidden text-xs text-slate-500 md:block">
              {data.total.toLocaleString()} {data.total === 1 ? 'product' : 'products'}
            </span>
          )}
          <ExportMenu
            onExport={exportLevels}
            disabled={!data || data.total === 0}
            onDone={(n, f) =>
              onExported(`${n} ${n === 1 ? 'product' : 'products'} exported to ${formatName(f)}`)
            }
            onError={onExportError}
          />
        </div>
      </div>

      {loading && !data ? (
        <SkeletonRows rows={6} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon={lowOnly ? PackageCheck : Boxes}
          title={lowOnly ? 'Nothing below its minimum' : 'No product matches'}
          text={
            lowOnly
              ? 'Every product with a minimum stock is above it. Well done.'
              : 'Try another search or filter.'
          }
        />
      ) : (
        <div className={clsx('overflow-x-auto transition-opacity', loading && 'opacity-60')}>
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-50/70 text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-2.5">Product</th>
                {columns.map((w) => (
                  <th key={w.id} className="px-4 py-2.5 text-right" title={w.name}>
                    {w.code}
                  </th>
                ))}
                <th className="px-4 py-2.5 text-right">{warehouseId ? 'On hand' : 'Total'}</th>
                <th className="px-4 py-2.5 text-right">Min.</th>
                {showCost && <th className="px-4 py-2.5 text-right">Avg. cost</th>}
                {showCost && <th className="px-4 py-2.5 text-right">Value</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((r, i) => (
                <tr
                  key={r.product.id}
                  onClick={() => onOpenLedger({ id: r.product.id, name: r.product.name })}
                  title="Show its movements"
                  className="group animate-fade-up cursor-pointer transition-colors hover:bg-emerald-50/40"
                  style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                >
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-slate-900 group-hover:text-mod-inventory">
                      {r.product.name}
                    </p>
                    <p className="font-mono text-xs text-slate-500">{r.product.sku}</p>
                  </td>
                  {columns.map((w) => (
                    <td key={w.id} className="px-4 py-2.5 text-right text-slate-600 tabular-nums">
                      {r.byWarehouse[w.id] ? (
                        formatDecimal(r.byWarehouse[w.id])
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  ))}
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    <span
                      className={clsx(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold',
                        r.isLow
                          ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                          : isNegative(r.total)
                            ? 'bg-red-50 text-red-600'
                            : 'text-slate-900',
                      )}
                    >
                      {r.isLow && <AlertTriangle className="size-3" />}
                      {formatDecimal(r.total)}
                      <span className="text-xs font-normal text-slate-400">
                        {r.product.baseUnitCode}
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-400 tabular-nums">
                    {Number(r.product.minStock) > 0 ? formatDecimal(r.product.minStock) : '—'}
                  </td>
                  {showCost && (
                    <td className="px-4 py-2.5 text-right text-slate-500 tabular-nums">
                      {formatDecimal(r.averageCost, 2)}
                    </td>
                  )}
                  {showCost && (
                    <td className="px-4 py-2.5 text-right font-medium text-slate-800 tabular-nums">
                      {formatDecimal(r.value, 2, 2)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            {showCost && data.totalValue !== undefined && (
              <tfoot className="border-t border-slate-200 bg-slate-50/70">
                <tr>
                  <td
                    colSpan={columns.length + (showCost ? 4 : 2)}
                    className="px-4 py-2.5 text-right text-xs font-medium text-slate-500 uppercase"
                  >
                    Total value{data.total > data.pageSize ? ' (all pages)' : ''}
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold text-slate-900 tabular-nums">
                    {formatDecimal(data.totalValue, 2, 2)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
      {data && (
        <Pager page={data.page} total={data.total} pageSize={data.pageSize} onPage={setPage} />
      )}
    </section>
  );
}

// ── Movements ───────────────────────────────────────────────────────────────

function MovesTab({
  showCost,
  warehouses,
  product,
  onClearProduct,
  onExported,
  onExportError,
}: {
  showCost: boolean;
  warehouses: WarehouseItem[];
  product: { id: string; name: string } | null;
  onClearProduct: () => void;
} & ExportFeedback) {
  const [warehouseId, setWarehouseId] = useState('');
  const [type, setType] = useState<StockMoveTypeCode | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [warehouseId, type, from, to, product]);

  const path = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (product) p.set('productId', product.id);
    if (warehouseId) p.set('warehouseId', warehouseId);
    if (type) p.set('type', type);
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    return `/inventory/stock/moves?${p}`;
  }, [product, warehouseId, type, from, to, page]);
  const { data, error, loading, reload } = useApiData<Paginated<StockMoveItem>>(path);

  /** The ledger rows matching the current filters (all pages). */
  async function exportMoves(format: ExportFormat): Promise<number> {
    const p = new URLSearchParams();
    if (product) p.set('productId', product.id);
    if (warehouseId) p.set('warehouseId', warehouseId);
    if (type) p.set('type', type);
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    const { items } = await fetchAllPages<StockMoveItem>(`/inventory/stock/moves?${p}`, 200);
    const cols: ExportColumn<StockMoveItem>[] = [
      { header: 'Date', value: (m) => m.createdAt, type: 'date', numFmt: FMT.date, width: 18 },
      { header: 'Type', value: (m) => MOVE_TYPES[m.type].label, width: 13 },
      { header: 'Reference', value: (m) => m.reference, width: 17 },
      { header: 'Reason', value: (m) => m.reason, width: 24 },
      { header: 'SKU', value: (m) => m.product.sku, width: 18 },
      { header: 'Product', value: (m) => m.product.name, width: 30 },
      { header: 'Warehouse', value: (m) => m.warehouse.code },
      { header: 'Quantity', value: (m) => m.quantity, type: 'number', numFmt: FMT.qty },
      { header: 'Unit', value: (m) => m.product.baseUnitCode },
    ];
    if (showCost) {
      cols.push({
        header: 'Unit cost',
        value: (m) => m.unitCost,
        type: 'number',
        numFmt: FMT.cost,
      });
    }
    cols.push({ header: 'By', value: (m) => m.createdBy, width: 22 });
    await exportRows({
      format,
      fileName: 'stock-movements',
      sheetName: 'Movements',
      columns: cols,
      rows: items,
    });
    return items.length;
  }

  return (
    <section className="animate-fade-up overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
      {error && (
        <div className="p-3">
          <ErrorBanner message={error} onRetry={reload} />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
        {product && (
          <span className="animate-pop inline-flex items-center gap-1.5 rounded-full bg-emerald-50 py-1 pr-1.5 pl-3 text-sm font-medium text-mod-inventory ring-1 ring-emerald-200">
            {product.name}
            <button
              onClick={onClearProduct}
              aria-label="Show all products"
              className="rounded-full p-0.5 hover:bg-emerald-100"
            >
              <X className="size-3.5" />
            </button>
          </span>
        )}
        <select
          value={warehouseId}
          onChange={(e) => setWarehouseId(e.target.value)}
          aria-label="Warehouse"
          className={inputClass() + ' w-full sm:w-48'}
        >
          <option value="">All warehouses</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.code} · {w.name}
            </option>
          ))}
        </select>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as StockMoveTypeCode | '')}
          aria-label="Type"
          className={inputClass() + ' w-full sm:w-44'}
        >
          <option value="">All types</option>
          {Object.entries(MOVE_TYPES).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-slate-500">
          From
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className={inputClass() + ' w-38'}
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-500">
          To
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className={inputClass() + ' w-38'}
          />
        </label>
        <div className="ml-auto flex items-center gap-3">
          {data && (
            <span className="hidden text-xs text-slate-500 md:block">
              {data.total.toLocaleString()} {data.total === 1 ? 'movement' : 'movements'}
            </span>
          )}
          <ExportMenu
            onExport={exportMoves}
            disabled={!data || data.total === 0}
            onDone={(n, f) =>
              onExported(`${n} ${n === 1 ? 'movement' : 'movements'} exported to ${formatName(f)}`)
            }
            onError={onExportError}
          />
        </div>
      </div>

      {loading && !data ? (
        <SkeletonRows rows={6} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon={History}
          title="No movement found"
          text="Movements appear here as soon as stock is received, sold, adjusted or transferred."
        />
      ) : (
        <div className={clsx('overflow-x-auto transition-opacity', loading && 'opacity-60')}>
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-slate-50/70 text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5">Type</th>
                <th className="px-4 py-2.5">Reference</th>
                <th className="px-4 py-2.5">Product</th>
                <th className="px-4 py-2.5">Wh.</th>
                <th className="px-4 py-2.5 text-right">Quantity</th>
                {showCost && <th className="px-4 py-2.5 text-right">Unit cost</th>}
                <th className="px-4 py-2.5">By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((m, i) => (
                <tr
                  key={m.id}
                  className="animate-fade-up hover:bg-slate-50/60"
                  style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                >
                  <td className="px-4 py-2.5 whitespace-nowrap text-slate-500">
                    {formatDateTime(m.createdAt)}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={clsx(
                        'rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1',
                        MOVE_TYPES[m.type].className,
                      )}
                    >
                      {MOVE_TYPES[m.type].label}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-mono text-xs text-slate-700">{m.reference ?? '—'}</span>
                    {m.reason && (
                      <p className="max-w-48 truncate text-xs text-slate-400" title={m.reason}>
                        {m.reason}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <p className="text-slate-800">{m.product.name}</p>
                    <p className="font-mono text-xs text-slate-400">{m.product.sku}</p>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-600">
                    {m.warehouse.code}
                  </td>
                  <td
                    className={clsx(
                      'px-4 py-2.5 text-right font-semibold whitespace-nowrap tabular-nums',
                      isNegative(m.quantity) ? 'text-red-600' : 'text-emerald-700',
                    )}
                  >
                    {isNegative(m.quantity) ? '' : '+'}
                    {formatDecimal(m.quantity)}{' '}
                    <span className="text-xs font-normal text-slate-400">
                      {m.product.baseUnitCode}
                    </span>
                  </td>
                  {showCost && (
                    <td className="px-4 py-2.5 text-right text-slate-500 tabular-nums">
                      {formatDecimal(m.unitCost, 2)}
                    </td>
                  )}
                  <td className="px-4 py-2.5 whitespace-nowrap text-slate-500">{m.createdBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && (
        <Pager page={data.page} total={data.total} pageSize={data.pageSize} onPage={setPage} />
      )}
    </section>
  );
}

// ── Small pieces ────────────────────────────────────────────────────────────

function Toggle({
  on,
  onClick,
  icon: Icon,
  label,
  tone = 'emerald',
}: {
  on: boolean;
  onClick: () => void;
  icon: LucideIcon;
  label: string;
  tone?: 'emerald' | 'amber';
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium ring-1 transition-all active:scale-95',
        on
          ? tone === 'amber'
            ? 'bg-amber-500 text-white ring-amber-500'
            : 'bg-emerald-600 text-white ring-emerald-600'
          : 'bg-white text-slate-600 ring-slate-200 hover:ring-slate-300',
      )}
    >
      <Icon className="size-3.5" /> {label}
    </button>
  );
}

function Pager({
  page,
  total,
  pageSize,
  onPage,
}: {
  page: number;
  total: number;
  pageSize: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const btn =
    'grid size-8 place-items-center rounded-md border border-slate-200 bg-white transition-all hover:bg-slate-50 active:scale-95 disabled:opacity-40';
  return (
    <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 text-sm text-slate-500">
      <span>
        Page {page} of {pages}
      </span>
      <div className="flex gap-1">
        <button
          className={btn}
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          className={btn}
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}
