'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { Check, ExternalLink, Package, PackagePlus, RefreshCw, Search } from 'lucide-react';
import type { CategoryNode, Paginated, ProductDetail, ProductListItem } from '@erp/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { EmptyState, Modal, Pager, Spinner, btnPrimary, btnSecondary, inputClass } from './ui';

const PAGE_SIZE = 12;

/**
 * The product catalogue (Inventory › Products) in a dialog: filter by name, SKU,
 * barcode or category, tick several products and add them to the order in one go.
 */
export function ProductPicker({
  open,
  onClose,
  onAdd,
  inOrder,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (products: ProductDetail[]) => void;
  /** Product ids already on the order (shown with a badge) */
  inOrder: Set<string>;
}) {
  const { t, money, qty } = useI18n();
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paginated<ProductListItem> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<Map<string, ProductListItem>>(new Map());
  const [adding, setAdding] = useState(false);

  // Fresh state each time the dialog opens
  useEffect(() => {
    if (!open) return;
    setSelected(new Map());
    setSearch('');
    setCategoryId('');
    setPage(1);
    api<CategoryNode[]>('/inventory/categories')
      .then(setCategories)
      .catch(() => setCategories([]));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    const timer = setTimeout(() => {
      const qs = new URLSearchParams({
        status: 'active',
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (search.trim()) qs.set('search', search.trim());
      if (categoryId) qs.set('categoryId', categoryId);
      api<Paginated<ProductListItem>>(`/inventory/products?${qs}`)
        .then((r) => !cancelled && setData(r))
        .catch(() => !cancelled && setError(true))
        .finally(() => !cancelled && setLoading(false));
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, search, categoryId, page, reload]);

  const toggle = (p: ProductListItem) =>
    setSelected((cur) => {
      const next = new Map(cur);
      if (next.has(p.id)) next.delete(p.id);
      else next.set(p.id, p);
      return next;
    });

  async function add() {
    setAdding(true);
    try {
      const details = await Promise.all(
        [...selected.keys()].map((id) => api<ProductDetail>(`/inventory/products/${id}`)),
      );
      onAdd(details);
      onClose();
    } catch {
      setError(true);
    } finally {
      setAdding(false);
    }
  }

  const items = data?.items ?? [];
  const canCreate = can('inventory.product.write');

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={t('pick.title')}
      subtitle={
        <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
          {t('pick.subtitle')}
          <Link
            href="/inventory/products"
            target="_blank"
            className="inline-flex items-center gap-1 font-medium text-orange-700 hover:underline"
          >
            {t('pick.openList')} <ExternalLink className="size-3.5" />
          </Link>
        </span>
      }
      footer={
        <>
          <span className="mr-auto text-sm text-slate-500">
            {selected.size > 0 ? t('pick.selected', { n: selected.size }) : t('pick.tickHint')}
          </span>
          <button className={btnSecondary} onClick={onClose} disabled={adding}>
            {t('common.cancel')}
          </button>
          <button
            className={btnPrimary}
            onClick={() => void add()}
            disabled={selected.size === 0 || adding}
          >
            {adding ? <Spinner /> : <PackagePlus className="size-4" />}
            {t('pick.add', { n: selected.size })}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={t('pick.searchPh')}
              className={clsx(inputClass, 'pl-9')}
            />
          </div>
          <div className="flex gap-2">
            <select
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                setPage(1);
              }}
              className={clsx(inputClass, 'min-w-0 flex-1 sm:w-56')}
            >
              <option value="">{t('pick.allCategories')}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.path}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setReload((n) => n + 1)}
              title={t('pick.refresh')}
              aria-label={t('pick.refresh')}
              className={clsx(btnSecondary, 'shrink-0 justify-center px-3')}
            >
              <RefreshCw className={clsx('size-4', loading && 'animate-spin')} />
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200">
          {error ? (
            <p className="px-4 py-10 text-center text-sm text-red-600">{t('pick.error')}</p>
          ) : !data && loading ? (
            <div className="grid place-items-center py-16">
              <Spinner className="size-6 text-amber-500" />
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={Package}
              title={search || categoryId ? t('pick.noMatch') : t('pick.emptyTitle')}
              text={t('pick.emptyText')}
              action={
                canCreate ? (
                  <Link href="/inventory/products/new" target="_blank" className={btnPrimary}>
                    <PackagePlus className="size-4" /> {t('pick.create')}
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <ul
              className={clsx(
                'max-h-[52vh] divide-y divide-slate-100 overflow-y-auto transition-opacity',
                loading && 'opacity-60',
              )}
            >
              {items.map((p, i) => {
                const on = selected.has(p.id);
                const low = Number(p.stockOnHand) < Number(p.minStock);
                return (
                  <li
                    key={p.id}
                    className="animate-rise"
                    style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
                  >
                    <label
                      className={clsx(
                        'flex cursor-pointer items-center gap-3 px-4 py-2.5 transition',
                        on ? 'bg-amber-50' : 'hover:bg-slate-50',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(p)}
                        className="sr-only"
                      />
                      <span
                        aria-hidden
                        className={clsx(
                          'grid size-5 shrink-0 place-items-center rounded-md border transition',
                          on
                            ? 'animate-pop border-orange-500 bg-gradient-to-br from-amber-500 to-orange-600 text-white'
                            : 'border-slate-300 bg-white',
                        )}
                      >
                        {on && <Check className="size-3.5" strokeWidth={3} />}
                      </span>
                      <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-100">
                        {p.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.imageUrl} alt="" className="size-full object-cover" />
                        ) : (
                          <Package className="size-4 text-slate-400" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-slate-900">
                            {p.name}
                          </span>
                          {inOrder.has(p.id) && (
                            <span className="shrink-0 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-700">
                              {t('pick.onOrder')}
                            </span>
                          )}
                        </span>
                        <span className="block truncate text-xs text-slate-500">
                          <span className="font-mono">{p.sku}</span>
                          {p.category && <> · {p.category.name}</>}
                          {p.barcode && <span className="hidden sm:inline"> · {p.barcode}</span>}
                        </span>
                      </span>
                      <span className="shrink-0 text-right text-xs tabular-nums">
                        <span
                          className={clsx(
                            'block font-medium',
                            low ? 'text-red-600' : 'text-slate-700',
                          )}
                        >
                          {t('pof.inStock', { qty: qty(p.stockOnHand), unit: p.baseUnit.code })}
                        </span>
                        {p.averageCost !== undefined && Number(p.averageCost) > 0 && (
                          <span className="text-slate-400">
                            {t('pick.cost', { cost: money(p.averageCost) })}
                          </span>
                        )}
                        {low && <span className="block text-red-500">{t('pick.low')}</span>}
                      </span>
                      <Link
                        href={`/inventory/products/${p.id}`}
                        target="_blank"
                        onClick={(e) => e.stopPropagation()}
                        title={t('pick.view')}
                        aria-label={t('pick.view')}
                        className="hidden shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-white hover:text-orange-700 sm:block"
                      >
                        <ExternalLink className="size-4" />
                      </Link>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {data && data.total > PAGE_SIZE && (
            <Pager
              page={page}
              pageSize={PAGE_SIZE}
              total={data.total}
              rangeKey="pager.products"
              onPage={setPage}
            />
          )}
        </div>
        {canCreate && items.length > 0 && (
          <p className="text-xs text-slate-500">
            {t('pick.missing')}{' '}
            <Link
              href="/inventory/products/new"
              target="_blank"
              className="font-medium text-orange-700 hover:underline"
            >
              {t('pick.create')}
            </Link>{' '}
            {t('pick.thenRefresh')}
          </p>
        )}
      </div>
    </Modal>
  );
}
