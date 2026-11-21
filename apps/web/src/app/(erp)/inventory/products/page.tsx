'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Boxes,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  PackageSearch,
  Plus,
  Printer,
  ScanLine,
  Search,
  Upload,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import {
  downloadCsv,
  findProductByCode,
  flattenCategories,
  fmtMoney,
  fmtQty,
  listCategories,
  listPriceLists,
  listProducts,
  marginPct,
  type CategoryNode,
  type PriceList,
  type Page,
  type ProductListItem,
  type ProductQuery,
} from '@/lib/inventory';
import { BarcodeScanner } from '@/components/inventory/barcode-scanner';
import { ImportDialog } from '@/components/inventory/import-dialog';
import { OpeningStockDialog } from '@/components/inventory/opening-stock-dialog';
import { ProductThumb } from '@/components/inventory/product-thumb';
import {
  Alert,
  PageHeader,
  ProductTabs,
  RequirePermission,
  StatusBadge,
  btn,
  btnPrimary,
  input,
  inputBase,
} from '@/components/inventory/ui';

const PAGE_SIZE = 25;

export default function ProductsPage() {
  return (
    <RequirePermission permission="inventory.product.read">
      <Suspense>
        <ProductList />
      </Suspense>
    </RequirePermission>
  );
}

function ProductList() {
  const router = useRouter();
  const { can } = useAuth();
  const canWrite = can('inventory.product.write');
  const canSeeCost = can('inventory.cost.view');
  const canOpening = can('inventory.stock.adjust');
  // ?lowStock=1 comes from the dashboard tile
  const params = useSearchParams();
  const lowStockParam = params.get('lowStock') === '1';
  const expiringParam = params.get('expiring') === '1';

  const [search, setSearch] = useState('');
  const [query, setQuery] = useState<ProductQuery>({
    status: 'active',
    sort: 'name',
    page: 1,
    pageSize: PAGE_SIZE,
    lowStock: lowStockParam || undefined,
    expiring: expiringParam || undefined,
  });
  const [data, setData] = useState<Page<ProductListItem> | null>(null);
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showOpening, setShowOpening] = useState(false);
  const [notFound, setNotFound] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  /** Opens the product with this exact barcode / SKU, or offers to create it. */
  async function openByCode(code: string) {
    setNotFound(null);
    try {
      const { product } = await findProductByCode(code);
      if (product) router.push(`/inventory/products/${product.id}`);
      else setNotFound(code);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const pageIds = data?.items.map((p) => p.id) ?? [];
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  // Debounced search
  useEffect(() => {
    const t = setTimeout(
      () => setQuery((q) => (q.q === search ? q : { ...q, q: search, page: 1 })),
      300,
    );
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    listProducts(query)
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [query]);

  useEffect(load, [load]);
  useEffect(() => {
    listCategories()
      .then(setCategories)
      .catch(() => undefined);
    listPriceLists()
      .then((l) => setPriceLists(l.filter((x) => x.isActive)))
      .catch(() => undefined);
  }, []);

  const update = (patch: Partial<ProductQuery>) => setQuery((q) => ({ ...q, page: 1, ...patch }));

  function toggleSort(field: string) {
    const current = query.sort ?? 'name';
    update({ sort: current === field ? `-${field}` : field });
  }

  const selectedList = priceLists.find((l) => l.id === query.priceListId);

  async function exportCsv() {
    setExporting(true);
    try {
      const all: ProductListItem[] = [];
      for (let page = 1; ; page++) {
        const res = await listProducts({ ...query, page, pageSize: 500 });
        all.push(...res.items);
        if (all.length >= res.total || res.items.length === 0) break;
      }
      const header = [
        'sku',
        'name',
        'barcode',
        'category',
        'unit',
        ...(canSeeCost ? ['purchase_price'] : []),
        'sale_price',
        ...(canSeeCost ? ['margin_pct'] : []),
        ...(selectedList ? [`price_${selectedList.code.toLowerCase()}`] : []),
        'min_stock',
        'on_hand',
        'track_lots',
        'active',
      ];
      if (canSeeCost) header.push('average_cost');
      downloadCsv(
        `products-${new Date().toISOString().slice(0, 10)}.csv`,
        header,
        all.map((p) => {
          const row: (string | number | null)[] = [
            p.sku,
            p.name,
            p.barcode,
            p.category?.name ?? null,
            p.baseUnit.code,
            ...(canSeeCost ? [p.purchasePrice ?? null] : []),
            p.salePrice,
            ...(canSeeCost
              ? [fmtPctCsv(marginPct(Number(p.salePrice), Number(p.purchasePrice ?? 0)))]
              : []),
            ...(selectedList ? [p.listPrice ?? null] : []),
            p.minStock,
            p.onHand,
            p.trackLots ? 'yes' : 'no',
            p.isActive ? 'yes' : 'no',
          ];
          if (canSeeCost) row.push(p.averageCost ?? null);
          return row;
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const colCount = 9 + (canSeeCost ? 2 : 0) + (selectedList ? 1 : 0);
  const flatCategories = flattenCategories(categories);
  const hasFilters = !!(
    query.q ||
    query.categoryId ||
    query.lowStock ||
    query.expiring ||
    query.status !== 'active'
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Products"
        subtitle="Product catalogue, categories and units"
        actions={
          <>
            <button className={btn} onClick={() => setShowScanner(true)}>
              <ScanLine className="size-4" /> Scan
            </button>
            {selected.size > 0 && (
              <Link
                className={btn}
                href={`/inventory/products/labels?ids=${[...selected].join(',')}`}
              >
                <Printer className="size-4" /> Labels ({selected.size})
              </Link>
            )}
            {canOpening && (
              <button className={btn} onClick={() => setShowOpening(true)}>
                <Boxes className="size-4" /> Opening stock
              </button>
            )}
            {canWrite && (
              <button className={btn} onClick={() => setShowImport(true)}>
                <Upload className="size-4" /> Import
              </button>
            )}
            <button
              className={btn}
              onClick={() => void exportCsv()}
              disabled={exporting || !data?.total}
            >
              {exporting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              Export
            </button>
            {canWrite && (
              <Link href="/inventory/products/new" className={btnPrimary}>
                <Plus className="size-4" /> New product
              </Link>
            )}
          </>
        }
      />

      <ProductTabs />

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-3">
          <div className="relative min-w-48 flex-1 sm:max-w-xs">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                // USB scanners type the code then press Enter: open the exact match directly.
                if (e.key === 'Enter' && search.trim()) void openByCode(search.trim());
              }}
              placeholder="Search or scan SKU, name, barcode…"
              aria-label="Search products"
              className={clsx(input, 'py-1.5 pl-9')}
            />
          </div>
          <select
            aria-label="Category"
            className={clsx(inputBase, 'py-1.5')}
            value={query.categoryId ?? ''}
            onChange={(e) => update({ categoryId: e.target.value || undefined })}
          >
            <option value="">All categories</option>
            {flatCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {'  '.repeat(c.depth)}
                {c.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Status"
            className={clsx(inputBase, 'py-1.5')}
            value={query.status}
            onChange={(e) => update({ status: e.target.value as ProductQuery['status'] })}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={!!query.lowStock}
              onChange={(e) => update({ lowStock: e.target.checked })}
            />
            Low stock only
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={!!query.expiring}
              onChange={(e) => update({ expiring: e.target.checked })}
            />
            Expiring ≤ 30 days
          </label>
          {priceLists.length > 0 && (
            <select
              aria-label="Show prices of a price list"
              className={clsx(inputBase, 'py-1.5')}
              value={query.priceListId ?? ''}
              onChange={(e) =>
                setQuery((q) => ({ ...q, priceListId: e.target.value || undefined }))
              }
            >
              <option value="">Retail prices only</option>
              {priceLists.map((l) => (
                <option key={l.id} value={l.id}>
                  + {l.name} prices
                </option>
              ))}
            </select>
          )}
          {hasFilters && (
            <button
              className="text-sm text-blue-600 hover:underline"
              onClick={() => {
                setSearch('');
                setQuery({
                  status: 'active',
                  sort: query.sort,
                  page: 1,
                  pageSize: PAGE_SIZE,
                  priceListId: query.priceListId,
                });
              }}
            >
              Clear filters
            </button>
          )}
          <span className="ml-auto text-sm text-slate-500">
            {data ? `${data.total} product${data.total === 1 ? '' : 's'}` : ''}
          </span>
        </div>

        {error && (
          <div className="p-3">
            <Alert>{error}</Alert>
          </div>
        )}
        {notFound && (
          <div className="flex flex-wrap items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
            <span>
              No product has the code <code className="font-mono font-semibold">{notFound}</code>.
            </span>
            {canWrite && (
              <Link
                href={`/inventory/products/new?barcode=${encodeURIComponent(notFound)}`}
                className="font-medium text-blue-700 hover:underline"
              >
                Create a product with this barcode
              </Link>
            )}
            <button
              className="ml-auto text-amber-700 hover:underline"
              onClick={() => setNotFound(null)}
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="w-10 px-4 py-2.5">
                  <input
                    type="checkbox"
                    aria-label="Select all on this page"
                    checked={allOnPage}
                    onChange={() =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        pageIds.forEach((id) => (allOnPage ? next.delete(id) : next.add(id)));
                        return next;
                      })
                    }
                  />
                </th>
                <SortTh label="SKU" field="sku" sort={query.sort} onSort={toggleSort} />
                <SortTh label="Name" field="name" sort={query.sort} onSort={toggleSort} />
                <th className="px-4 py-2.5">Category</th>
                <th className="px-4 py-2.5">Unit</th>
                {canSeeCost && <th className="px-4 py-2.5 text-right">Purchase price</th>}
                <SortTh
                  label="Sale price"
                  field="salePrice"
                  sort={query.sort}
                  onSort={toggleSort}
                  right
                />
                {canSeeCost && <th className="px-4 py-2.5 text-right">Margin</th>}
                {selectedList && <th className="px-4 py-2.5 text-right">{selectedList.name}</th>}
                <th className="px-4 py-2.5 text-right">On hand</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className={clsx('divide-y divide-slate-100', loading && data && 'opacity-60')}>
              {loading && !data ? (
                <tr>
                  <td colSpan={colCount} className="py-16 text-center text-slate-400">
                    <Loader2 className="mx-auto size-6 animate-spin" />
                  </td>
                </tr>
              ) : data && data.items.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="px-6 py-16 text-center">
                    <PackageSearch className="mx-auto size-8 text-slate-300" />
                    <p className="mt-3 font-medium text-slate-900">
                      {hasFilters ? 'No product matches these filters' : 'No products yet'}
                    </p>
                    {!hasFilters && canWrite && (
                      <p className="mt-1 text-slate-500">
                        <Link
                          href="/inventory/products/new"
                          className="text-blue-600 hover:underline"
                        >
                          Create a product
                        </Link>{' '}
                        or{' '}
                        <button
                          className="text-blue-600 hover:underline"
                          onClick={() => setShowImport(true)}
                        >
                          import a CSV file
                        </button>
                        .
                      </p>
                    )}
                  </td>
                </tr>
              ) : (
                data?.items.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => router.push(`/inventory/products/${p.id}`)}
                    className={clsx(
                      'cursor-pointer hover:bg-slate-50',
                      selected.has(p.id) && 'bg-emerald-50/50',
                    )}
                  >
                    <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${p.name}`}
                        checked={selected.has(p.id)}
                        onChange={() => toggle(p.id)}
                      />
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap text-slate-600">
                      <Link
                        href={`/inventory/products/${p.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="hover:underline"
                      >
                        {p.sku}
                      </Link>
                    </td>
                    <td className="min-w-56 px-4 py-2 font-medium text-slate-900">
                      <span className="flex items-center gap-3">
                        <ProductThumb product={p} />
                        {p.name}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{p.category?.name ?? '—'}</td>
                    <td className="px-4 py-2.5 text-slate-600">{p.baseUnit.code}</td>
                    {canSeeCost && (
                      <td className="px-4 py-2.5 text-right text-slate-600 tabular-nums">
                        {fmtMoney(p.purchasePrice ?? 0)}
                      </td>
                    )}
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                      {fmtMoney(p.salePrice)}
                    </td>
                    {canSeeCost && <MarginCell sale={p.salePrice} purchase={p.purchasePrice} />}
                    {selectedList && (
                      <td className="px-4 py-2.5 text-right text-slate-600 tabular-nums">
                        {p.listPrice !== undefined ? fmtMoney(p.listPrice) : '—'}
                      </td>
                    )}
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      <span
                        className={clsx(
                          'inline-flex items-center gap-1',
                          p.isLowStock && 'font-medium text-amber-600',
                        )}
                      >
                        {p.isLowStock && (
                          <AlertTriangle className="size-3.5" aria-label="Low stock" />
                        )}
                        {fmtQty(p.onHand)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge active={p.isActive} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {data && data.total > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
            <span>
              Page {data.page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                className={btn}
                disabled={data.page <= 1}
                onClick={() => setQuery((q) => ({ ...q, page: (q.page ?? 1) - 1 }))}
              >
                <ChevronLeft className="size-4" /> Previous
              </button>
              <button
                className={btn}
                disabled={data.page >= totalPages}
                onClick={() => setQuery((q) => ({ ...q, page: (q.page ?? 1) + 1 }))}
              >
                Next <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {showImport && <ImportDialog onClose={() => setShowImport(false)} onImported={load} />}
      {showOpening && (
        <OpeningStockDialog onClose={() => setShowOpening(false)} onImported={load} />
      )}
      {showScanner && (
        <BarcodeScanner
          title="Find a product"
          onClose={() => setShowScanner(false)}
          onCode={(code) => {
            setShowScanner(false);
            void openByCode(code);
          }}
        />
      )}
    </div>
  );
}

function SortTh({
  label,
  field,
  sort,
  onSort,
  right,
}: {
  label: string;
  field: string;
  sort?: string;
  onSort: (field: string) => void;
  right?: boolean;
}) {
  const dir = sort === field ? 'asc' : sort === `-${field}` ? 'desc' : null;
  return (
    <th
      className={clsx('px-4 py-2.5', right && 'text-right')}
      aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'}
    >
      <button
        className={clsx(
          'inline-flex items-center gap-1 uppercase hover:text-slate-700',
          right && 'flex-row-reverse',
        )}
        onClick={() => onSort(field)}
      >
        {label}
        {dir === 'asc' && <ArrowUp className="size-3" />}
        {dir === 'desc' && <ArrowDown className="size-3" />}
      </button>
    </th>
  );
}

const fmtPctCsv = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);

function MarginCell({ sale, purchase }: { sale: string; purchase?: string }) {
  const pct = marginPct(Number(sale), Number(purchase ?? 0));
  return (
    <td
      className={clsx(
        'px-4 py-2.5 text-right tabular-nums',
        pct === null
          ? 'text-slate-400'
          : pct < 0
            ? 'font-medium text-red-600'
            : pct < 10
              ? 'text-amber-600'
              : 'text-emerald-700',
      )}
    >
      {pct === null ? '—' : `${pct.toFixed(1)} %`}
    </td>
  );
}
