'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Download, Package, Plus, Printer, Upload, X } from 'lucide-react';
import type { CategoryDto, Paginated, ProductListItem } from '@erp/shared';
import { apiDownload } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCompany } from '@/lib/company';
import { useI18n } from '@/lib/i18n';
import { errorMessage } from '@/lib/errors';
import { formatPercent } from '@/lib/format';
import { useApiQuery, useDebounced, withQuery } from '@/lib/use-api';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { FilterSelect, SearchInput } from '@/components/ui/form';
import { Badge, PageHeader, RequirePermission } from '@/components/ui/page';
import { useToast } from '@/components/ui/toast';
import { ImportProductsModal } from './import-modal';

const PAGE_SIZE = 25;
type Sort = 'name' | 'sku' | 'salePrice' | 'updatedAt';

export default function ProductsPage() {
  return (
    <RequirePermission permission="inventory.product.read">
      {/* useSearchParams needs a Suspense boundary */}
      <Suspense>
        <ProductsScreen />
      </Suspense>
    </RequirePermission>
  );
}

function ProductsScreen() {
  const { t, locale } = useI18n();
  const { can } = useAuth();
  const { money } = useCompany();
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const canWrite = can('inventory.product.write');
  const canSeeCost = can('inventory.cost.view');

  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState(params.get('category') ?? '');
  const [active, setActive] = useState('true');
  const [sort, setSort] = useState<Sort>('name');
  const [page, setPage] = useState(1);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  // Selected products (kept across pages and filters) for printing labels.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const debouncedSearch = useDebounced(search);

  useEffect(() => setPage(1), [debouncedSearch, categoryId, active, sort]);

  const filters = {
    search: debouncedSearch,
    categoryId,
    active,
    sort,
    order: sort === 'updatedAt' ? 'desc' : 'asc',
  };
  const products = useApiQuery<Paginated<ProductListItem>>(
    withQuery('/products', { ...filters, page, pageSize: PAGE_SIZE }),
  );
  const categories = useApiQuery<CategoryDto[]>('/categories');
  const hasFilters = !!(search || categoryId || active !== 'true');

  const pageIds = products.data?.items.map((p) => p.id) ?? [];
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const toggle = (ids: string[], on: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  const columns: Column<ProductListItem>[] = [
    {
      key: 'select',
      className: 'w-10 pr-0',
      header: (
        <input
          type="checkbox"
          className="size-4 accent-blue-600"
          checked={allOnPage}
          onChange={(e) => toggle(pageIds, e.target.checked)}
          aria-label={t('products.selectPage')}
        />
      ),
      cell: (p) => (
        <input
          type="checkbox"
          className="size-4 accent-blue-600"
          checked={selected.has(p.id)}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => toggle([p.id], e.target.checked)}
          aria-label={t('products.select', { name: p.name })}
        />
      ),
    },
    {
      key: 'photo',
      header: '',
      className: 'w-12 pr-0',
      hideOnMobile: true,
      cell: (p) => (
        <div className="grid size-10 place-items-center overflow-hidden rounded-md border border-slate-200 bg-slate-50">
          {p.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- served by the API
            <img src={p.photoUrl} alt="" loading="lazy" className="size-full object-contain" />
          ) : (
            <Package className="size-4 text-slate-300" />
          )}
        </div>
      ),
    },
    {
      key: 'sku',
      header: t('products.col.sku'),
      cell: (p) => <code className="text-xs whitespace-nowrap text-slate-600">{p.sku}</code>,
    },
    {
      key: 'name',
      header: t('products.col.name'),
      cell: (p) => (
        <div className="min-w-0">
          <p className="font-medium text-slate-900">{p.name}</p>
          {p.barcode && <p className="font-mono text-xs text-slate-400">{p.barcode}</p>}
        </div>
      ),
    },
    {
      key: 'category',
      header: t('products.col.category'),
      hideOnMobile: true,
      cell: (p) =>
        p.category ? (
          <span className="text-slate-600">{p.category.path}</span>
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
    {
      key: 'unit',
      header: t('products.col.unit'),
      hideOnMobile: true,
      cell: (p) => <span className="text-slate-500">{p.baseUnit.code}</span>,
    },
    ...(canSeeCost
      ? [
          {
            key: 'purchase',
            header: t('products.col.purchasePrice'),
            align: 'right' as const,
            hideOnMobile: true,
            cell: (p: ProductListItem) => (
              <span className="whitespace-nowrap text-slate-500">{money(p.purchasePrice)}</span>
            ),
          },
        ]
      : []),
    {
      key: 'price',
      header: t('products.col.priceExcl'),
      align: 'right',
      cell: (p) => <span className="whitespace-nowrap">{money(p.salePrice)}</span>,
    },
    {
      key: 'vat',
      header: t('products.col.vat'),
      align: 'right',
      hideOnMobile: true,
      cell: (p) => (
        <span className="text-slate-500">
          {p.taxRate ? formatPercent(p.taxRate.rate, locale) : '—'}
        </span>
      ),
    },
    {
      key: 'priceTtc',
      header: t('products.col.priceIncl'),
      align: 'right',
      cell: (p) => (
        <span className="font-medium whitespace-nowrap text-slate-900">
          {money(p.salePriceInclTax)}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('products.col.status'),
      hideOnMobile: true,
      cell: (p) =>
        p.isActive ? (
          <Badge tone="green">{t('status.active')}</Badge>
        ) : (
          <Badge>{t('status.inactive')}</Badge>
        ),
    },
  ];

  async function exportCsv() {
    setExporting(true);
    try {
      const date = new Date().toISOString().slice(0, 10);
      await apiDownload(
        withQuery('/products/export', filters),
        `${t('products.exportFile')}-${date}.csv`,
      );
    } catch (err) {
      toast.error(errorMessage(err, t));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        href="/inventory/products"
        actions={
          <>
            {selected.size > 0 && (
              <>
                <Button
                  variant="ghost"
                  icon={X}
                  onClick={() => setSelected(new Set())}
                  aria-label={t('products.clearSelection')}
                />
                <Button
                  variant="secondary"
                  icon={Printer}
                  onClick={() => router.push(`/inventory/labels?ids=${[...selected].join(',')}`)}
                >
                  {t('products.printLabels', { count: selected.size })}
                </Button>
              </>
            )}
            {canWrite && (
              <Button variant="secondary" icon={Upload} onClick={() => setImporting(true)}>
                {t('products.import')}
              </Button>
            )}
            <Button variant="secondary" icon={Download} loading={exporting} onClick={exportCsv}>
              {t('products.export')}
            </Button>
            {canWrite && (
              <Button icon={Plus} onClick={() => router.push('/inventory/products/new')}>
                {t('products.new')}
              </Button>
            )}
          </>
        }
      />

      <DataTable
        columns={columns}
        rows={products.data?.items}
        rowKey={(p) => p.id}
        loading={products.loading}
        error={products.error ? errorMessage(products.error, t) : null}
        onRetry={products.reload}
        emptyMessage={hasFilters ? t('products.emptyFiltered') : t('products.empty')}
        onRowClick={(p) => router.push(`/inventory/products/${p.id}`)}
        rowClassName={(p) => (p.isActive ? undefined : 'opacity-60')}
        pagination={
          products.data && {
            page,
            pageSize: PAGE_SIZE,
            total: products.data.total,
            onPageChange: setPage,
          }
        }
        toolbar={
          <>
            <SearchInput
              className="w-full max-w-sm"
              placeholder={t('products.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
            <FilterSelect
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="max-w-56"
              options={[
                { value: '', label: t('products.filter.allCategories') },
                { value: 'none', label: t('products.filter.noCategory') },
                ...(categories.data ?? []).map((c) => ({ value: c.id, label: c.path })),
              ]}
            />
            <FilterSelect
              value={active}
              onChange={(e) => setActive(e.target.value)}
              options={[
                { value: 'true', label: t('products.filter.active') },
                { value: 'false', label: t('products.filter.inactive') },
                { value: '', label: t('products.filter.all') },
              ]}
            />
            <FilterSelect
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              aria-label={t('products.sort.label')}
              options={[
                { value: 'name', label: t('products.sort.name') },
                { value: 'sku', label: t('products.sort.sku') },
                { value: 'salePrice', label: t('products.sort.price') },
                { value: 'updatedAt', label: t('products.sort.recent') },
              ]}
            />
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                icon={X}
                onClick={() => {
                  setSearch('');
                  setCategoryId('');
                  setActive('true');
                }}
              >
                {t('common.clearFilters')}
              </Button>
            )}
            {products.data && (
              <span className="ml-auto text-xs text-slate-500">
                {t('products.count', { count: products.data.total })}
              </span>
            )}
          </>
        }
      />

      {importing && (
        <ImportProductsModal
          onClose={() => setImporting(false)}
          onImported={() => {
            void products.reload();
            void categories.reload();
          }}
        />
      )}
    </div>
  );
}
