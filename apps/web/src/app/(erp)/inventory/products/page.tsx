'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { ChevronRight, Download, FileSpreadsheet, ImagePlus, Lock, Pencil, Plus, Power, Search, Upload, X, Zap } from 'lucide-react';
import { api, ApiRequestError, getAccessToken } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { MODULE_COLORS } from '@/components/icons';

interface Unit {
  id: string;
  code: string;
  name: string;
}
interface Category {
  id: string;
  name: string;
}
interface Product {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  brand: string | null;
  model: string | null;
  engineCc: number | null;
  isElectric: boolean;
  color: string | null;
  modelYear: number | null;
  condition: 'NEW' | 'USED';
  imageUrl: string | null;
  categoryId: string | null;
  baseUnitId: string;
  salePrice: string;
  salePriceTnd: string;
  averageCost?: string;
  minStock: string;
  isActive: boolean;
  category: Category | null;
  baseUnit: Unit;
}
interface Page {
  items: Product[];
  total: number;
  page: number;
  pageSize: number;
}

interface FormState {
  sku: string;
  name: string;
  brand: string;
  model: string;
  engineCc: string;
  isElectric: boolean;
  color: string;
  modelYear: string;
  condition: 'NEW' | 'USED';
  categoryId: string;
  baseUnitId: string;
  salePrice: string;
  salePriceTnd: string;
  imageUrl: string;
  minStock: string;
  barcode: string;
  description: string;
}

const EMPTY: FormState = {
  sku: '',
  name: '',
  brand: '',
  model: '',
  engineCc: '',
  isElectric: false,
  color: '',
  modelYear: '',
  condition: 'NEW',
  categoryId: '',
  baseUnitId: '',
  salePrice: '0',
  salePriceTnd: '0',
  imageUrl: '',
  minStock: '0',
  barcode: '',
  description: '',
};

const money = (v: string, cur: 'USD' | 'TND') =>
  new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: cur,
    maximumFractionDigits: cur === 'TND' ? 3 : 2,
  }).format(Number(v));

async function downloadFile(path: string, filename: string) {
  const res = await fetch(`/api/v1${path}`, {
    headers: { Authorization: `Bearer ${getAccessToken() ?? ''}` },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Same default as the API (USD_TND_RATE); only used to pre-fill the form. */
const USD_TND = 3.1;

const input =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

export default function ProductsPage() {
  const { can } = useAuth();
  const color = MODULE_COLORS.inventory;
  const canWrite = can('inventory.product.write');

  const [data, setData] = useState<Page | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState('');
  const [condition, setCondition] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [active, setActive] = useState<'true' | 'false' | 'all'>('true');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: '20', active });
      if (search.trim()) qs.set('search', search.trim());
      if (condition) qs.set('condition', condition);
      if (categoryFilter) qs.set('categoryId', categoryFilter);
      setData(await api<Page>(`/inventory/products?${qs}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load products');
    } finally {
      setLoading(false);
    }
  }, [page, search, condition, categoryFilter, active]);

  // debounce search / filters
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    void Promise.all([
      api<Unit[]>('/inventory/units'),
      api<Category[]>('/inventory/categories'),
    ]).then(([u, c]) => {
      setUnits(u);
      setCategories(c);
    });
  }, []);

  async function toggleActive(p: Product) {
    try {
      await api(`/inventory/products/${p.id}/${p.isActive ? 'deactivate' : 'activate'}`, {
        method: 'POST',
      });
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    }
  }

  if (!can('inventory.product.read')) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center">
        <Lock className="mx-auto size-8 text-slate-400" />
        <h1 className="mt-3 text-lg font-semibold">Access denied</h1>
      </div>
    );
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <nav className="flex items-center gap-1 text-xs text-slate-500">
          <Link href="/dashboard" className="hover:text-slate-700">
            Home
          </Link>
          <ChevronRight className="size-3" />
          <span className={color.text}>Inventory</span>
          <ChevronRight className="size-3" />
          <span>Products</span>
        </nav>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Scooters</h1>
            <p className="text-sm text-slate-500">
              {data ? `${data.total} product${data.total === 1 ? '' : 's'}` : 'Loading…'}
            </p>
          </div>
          {canWrite && (
            <div className="flex gap-2">
              <button
                onClick={() =>
                  downloadFile('/inventory/products/export', 'products.xlsx').catch((e) =>
                    setError(e instanceof Error ? e.message : 'Export failed'),
                  )
                }
                className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700"
              >
                <Download className="size-4" /> Export Excel
              </button>
              <button
                onClick={() => setImporting(true)}
                className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700"
              >
                <Upload className="size-4" /> Import Excel
              </button>
              <button
                onClick={() => setEditing('new')}
                className={clsx(
                  'inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-white',
                  color.bg,
                )}
              >
                <Plus className="size-4" /> Add product manually
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-3">
          <div className="relative max-w-xs flex-1">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search name, SKU, brand, model, category…"
              className={clsx(input, 'pl-9')}
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(1);
            }}
            className={clsx(input, 'w-auto')}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={condition}
            onChange={(e) => {
              setCondition(e.target.value);
              setPage(1);
            }}
            className={clsx(input, 'w-auto')}
          >
            <option value="">New &amp; used</option>
            <option value="NEW">New</option>
            <option value="USED">Used</option>
          </select>
          <select
            value={active}
            onChange={(e) => {
              setActive(e.target.value as typeof active);
              setPage(1);
            }}
            className={clsx(input, 'w-auto')}
          >
            <option value="true">Active</option>
            <option value="false">Inactive</option>
            <option value="all">All</option>
          </select>
        </div>

        {error && <p className="m-3 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-2">SKU</th>
                <th className="px-4 py-2">Scooter</th>
                <th className="px-4 py-2">Category</th>
                <th className="px-4 py-2">Engine</th>
                <th className="px-4 py-2">Color</th>
                <th className="px-4 py-2">Year</th>
                <th className="px-4 py-2">Condition</th>
                <th className="px-4 py-2 text-right">Price (USD)</th>
                <th className="px-4 py-2 text-right">Price (TND)</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data?.items.map((p) => (
                <tr key={p.id} className={clsx(!p.isActive && 'opacity-50')}>
                  <td className="px-4 py-2 font-mono text-xs">{p.sku}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-3">
                      {p.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.imageUrl}
                          alt={p.name}
                          className="size-12 rounded-md border border-slate-200 bg-white object-contain"
                        />
                      ) : (
                        <div className="size-12 rounded-md border border-dashed border-slate-200" />
                      )}
                      <div>
                        <div className="font-medium text-slate-900">{p.name}</div>
                        <div className="text-xs text-slate-500">
                          {[p.brand, p.model].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2">{p.category?.name ?? '—'}</td>
                  <td className="px-4 py-2">
                    {p.isElectric ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600">
                        <Zap className="size-3.5" /> Electric
                      </span>
                    ) : p.engineCc ? (
                      `${p.engineCc} cc`
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-2">{p.color ?? '—'}</td>
                  <td className="px-4 py-2">{p.modelYear ?? '—'}</td>
                  <td className="px-4 py-2">
                    <span
                      className={clsx(
                        'rounded-full px-2 py-0.5 text-xs font-medium',
                        p.condition === 'NEW'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-amber-50 text-amber-700',
                      )}
                    >
                      {p.condition === 'NEW' ? 'New' : 'Used'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(p.salePrice, 'USD')}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(p.salePriceTnd, 'TND')}</td>
                  <td className="px-4 py-2">
                    {canWrite && (
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => setEditing(p)}
                          title="Edit"
                          className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
                        >
                          <Pencil className="size-4" />
                        </button>
                        <button
                          onClick={() => toggleActive(p)}
                          title={p.isActive ? 'Deactivate' : 'Activate'}
                          className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
                        >
                          <Power className="size-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {data && data.items.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-slate-500">
                    No scooters found.
                  </td>
                </tr>
              )}
              {loading && !data && (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-slate-400">
                    Loading…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2 text-sm text-slate-500">
          <span>
            Page {page} / {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="rounded border border-slate-200 px-3 py-1 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              className="rounded border border-slate-200 px-3 py-1 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {importing && (
        <ImportDialog
          onClose={() => setImporting(false)}
          onDone={() => {
            void load();
          }}
        />
      )}

      {editing && (
        <ProductDialog
          product={editing === 'new' ? null : editing}
          units={units}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function ProductDialog({
  product,
  units,
  categories,
  onClose,
  onSaved,
}: {
  product: Product | null;
  units: Unit[];
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState<FormState>(() =>
    product
      ? {
          sku: product.sku,
          name: product.name,
          brand: product.brand ?? '',
          model: product.model ?? '',
          engineCc: product.engineCc?.toString() ?? '',
          isElectric: product.isElectric,
          color: product.color ?? '',
          modelYear: product.modelYear?.toString() ?? '',
          condition: product.condition,
          categoryId: product.categoryId ?? '',
          baseUnitId: product.baseUnitId,
          salePrice: product.salePrice,
          salePriceTnd: product.salePriceTnd,
          imageUrl: product.imageUrl ?? '',
          minStock: product.minStock,
          barcode: product.barcode ?? '',
          description: product.description ?? '',
        }
      : { ...EMPTY, baseUnitId: units[0]?.id ?? '' },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const body = {
      sku: f.sku.trim(),
      name: f.name.trim(),
      brand: f.brand.trim() || (product ? null : undefined),
      model: f.model.trim() || (product ? null : undefined),
      engineCc: f.isElectric || !f.engineCc ? (product ? null : undefined) : Number(f.engineCc),
      isElectric: f.isElectric,
      color: f.color.trim() || (product ? null : undefined),
      modelYear: f.modelYear ? Number(f.modelYear) : product ? null : undefined,
      condition: f.condition,
      categoryId: f.categoryId || (product ? null : undefined),
      salePrice: Number(f.salePrice) || 0,
      salePriceTnd: Number(f.salePriceTnd) || 0,
      imageUrl: f.imageUrl || (product ? null : undefined),
      minStock: Number(f.minStock) || 0,
      barcode: f.barcode.trim() || (product ? null : undefined),
      description: f.description.trim() || (product ? null : undefined),
      ...(product ? {} : { baseUnitId: f.baseUnitId }),
    };
    try {
      await api(product ? `/inventory/products/${product.id}` : '/inventory/products', {
        method: product ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiRequestError || err instanceof Error ? err.message : 'Save failed');
      setSaving(false);
    }
  }

  const label = 'mb-1 block text-xs font-medium text-slate-600';

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-900/40 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{product ? 'Edit product' : 'Add product manually'}</h2>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-slate-100">
            <X className="size-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={label}>SKU *</label>
            <input required value={f.sku} onChange={(e) => set('sku', e.target.value)} className={input} />
          </div>
          <div>
            <label className={label}>Name *</label>
            <input required value={f.name} onChange={(e) => set('name', e.target.value)} className={input} />
          </div>
          <div>
            <label className={label}>Brand</label>
            <input value={f.brand} onChange={(e) => set('brand', e.target.value)} className={input} />
          </div>
          <div>
            <label className={label}>Model</label>
            <input value={f.model} onChange={(e) => set('model', e.target.value)} className={input} />
          </div>
          <div>
            <label className={label}>Engine (cc)</label>
            <input
              type="number"
              min={0}
              disabled={f.isElectric}
              value={f.isElectric ? '' : f.engineCc}
              onChange={(e) => set('engineCc', e.target.value)}
              className={clsx(input, f.isElectric && 'bg-slate-100')}
            />
          </div>
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input
              type="checkbox"
              checked={f.isElectric}
              onChange={(e) => set('isElectric', e.target.checked)}
            />
            Electric scooter
          </label>
          <div>
            <label className={label}>Color</label>
            <input value={f.color} onChange={(e) => set('color', e.target.value)} className={input} />
          </div>
          <div>
            <label className={label}>Model year</label>
            <input
              type="number"
              min={1980}
              max={2100}
              value={f.modelYear}
              onChange={(e) => set('modelYear', e.target.value)}
              className={input}
            />
          </div>
          <div>
            <label className={label}>Condition</label>
            <select
              value={f.condition}
              onChange={(e) => set('condition', e.target.value as 'NEW' | 'USED')}
              className={input}
            >
              <option value="NEW">New</option>
              <option value="USED">Used</option>
            </select>
          </div>
          <div>
            <label className={label}>Category</label>
            <select value={f.categoryId} onChange={(e) => set('categoryId', e.target.value)} className={input}>
              <option value="">— none —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>Price (USD $)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={f.salePrice}
              onChange={(e) => {
                set('salePrice', e.target.value);
                set('salePriceTnd', String(Math.round(Number(e.target.value) * USD_TND * 1000) / 1000));
              }}
              className={input}
            />
          </div>
          <div>
            <label className={label}>Price (TND — dinar)</label>
            <input
              type="number"
              min={0}
              step="0.001"
              value={f.salePriceTnd}
              onChange={(e) => {
                set('salePriceTnd', e.target.value);
                set('salePrice', String(Math.round((Number(e.target.value) / USD_TND) * 100) / 100));
              }}
              className={input}
            />
          </div>
          <div className="col-span-2 flex items-center gap-4">
            {f.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={f.imageUrl}
                alt=""
                className="size-20 rounded-md border border-slate-200 object-contain"
              />
            ) : (
              <div className="grid size-20 place-items-center rounded-md border border-dashed border-slate-300 text-slate-400">
                <ImagePlus className="size-6" />
              </div>
            )}
            <div>
              <label className={label}>Product photo</label>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const fd = new FormData();
                  fd.append('file', file);
                  try {
                    const r = await api<{ imageUrl: string }>('/inventory/products/image', {
                      method: 'POST',
                      body: fd,
                    });
                    set('imageUrl', r.imageUrl);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Upload failed');
                  }
                }}
                className="text-xs"
              />
            </div>
          </div>
          <div>
            <label className={label}>Low-stock alert at</label>
            <input
              type="number"
              min={0}
              value={f.minStock}
              onChange={(e) => set('minStock', e.target.value)}
              className={input}
            />
          </div>
          <div>
            <label className={label}>Barcode</label>
            <input value={f.barcode} onChange={(e) => set('barcode', e.target.value)} className={input} />
          </div>
          <div>
            <label className={label}>Unit *</label>
            <select
              required
              disabled={!!product}
              value={f.baseUnitId}
              onChange={(e) => set('baseUnitId', e.target.value)}
              className={clsx(input, product && 'bg-slate-100')}
            >
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.code} — {u.name}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className={label}>Description</label>
            <textarea
              rows={2}
              value={f.description}
              onChange={(e) => set('description', e.target.value)}
              className={input}
            />
          </div>
        </div>

        {error && <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm"
          >
            Cancel
          </button>
          <button
            disabled={saving}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}

function ImportDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    created: number;
    updated: number;
    errors: { row: number; message: string }[];
  } | null>(null);

  function pick(f: File | undefined | null) {
    setResult(null);
    setError(null);
    if (f && !/\.xlsx$/i.test(f.name)) {
      setError('Please choose an Excel file (.xlsx).');
      return;
    }
    setFile(f ?? null);
  }

  async function run() {
    if (!file) return;
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.append('file', file);
    try {
      setResult(await api('/inventory/products/import', { method: 'POST', body: fd }));
      setFile(null);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-900/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Import products from Excel</h2>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-slate-100">
            <X className="size-5" />
          </button>
        </div>

        <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
          <li>
            Get the model:{' '}
            <button
              type="button"
              onClick={() =>
                downloadFile('/inventory/products/import/template', 'products-template.xlsx').catch(
                  (e) => setError(e instanceof Error ? e.message : 'Download failed'),
                )
              }
              className="text-blue-600 hover:underline"
            >
              empty template
            </button>{' '}
            or{' '}
            <button
              type="button"
              onClick={() =>
                downloadFile('/inventory/products/export', 'products.xlsx').catch((e) =>
                  setError(e instanceof Error ? e.message : 'Download failed'),
                )
              }
              className="text-blue-600 hover:underline"
            >
              your current products
            </button>
            .
          </li>
          <li>Fill it in Excel (only the name is required).</li>
          <li>Drop the file below.</li>
        </ol>
        <p className="mt-2 text-xs text-slate-500">
          Existing products (same SKU) are updated, new ones created. Prices like “62 475,000 TND”
          or “20 153,23 $US” and “350 cc” are understood. A missing USD or TND price is computed.
        </p>

        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            pick(e.dataTransfer.files[0]);
          }}
          className={clsx(
            'mt-4 flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center text-sm',
            dragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-slate-50',
          )}
        >
          <FileSpreadsheet className="size-8 text-emerald-600" />
          {file ? (
            <span className="font-medium text-slate-800">{file.name}</span>
          ) : (
            <span className="text-slate-600">Click to choose an .xlsx file, or drop it here</span>
          )}
          <input
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              pick(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>

        {error && <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {result && (
          <div className="mt-4 rounded-md bg-slate-50 p-3 text-sm">
            <p className="font-medium text-emerald-700">
              ✓ {result.created} created · {result.updated} updated
              {result.errors.length > 0 && (
                <span className="text-red-700"> · {result.errors.length} error(s)</span>
              )}
            </p>
            {result.errors.length > 0 && (
              <ul className="mt-2 max-h-40 list-disc overflow-y-auto pl-5 text-red-700">
                {result.errors.map((er) => (
                  <li key={er.row}>
                    Row {er.row}: {er.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm"
          >
            Close
          </button>
          <button
            type="button"
            onClick={run}
            disabled={!file || busy}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {busy ? 'Importing…' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
}
