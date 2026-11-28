'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ImageIcon,
  Loader2,
  Pencil,
  Plus,
  Search,
  Tags,
  X,
} from 'lucide-react';
import type {
  Paginated,
  PriceLine,
  PriceListProductRow,
  PriceListRow,
  SetProductPricesInput,
} from '@erp/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatMoney } from '@/lib/format';
import {
  Breadcrumbs,
  ErrorBox,
  StatusBadge,
  btnPrimary,
  btnSecondary,
  fieldClass,
  inputClass,
} from '@/components/products/ui';

import { tr } from '@/lib/i18n';
const PRICE = /^\d{1,14}(\.\d{1,4})?$/;
const PERCENT = /^-?\d{1,4}(\.\d{1,2})?$/;

function describePercent(p: string) {
  const n = Number(p);
  if (n === 0) return tr('Same as the sale price');
  return n < 0 ? tr('{n}% below the sale price', { n: -n }) : tr('{n}% above the sale price', { n });
}

export default function PriceListsPage() {
  const { can } = useAuth();
  const canWrite = can('inventory.product.write');
  const [lists, setLists] = useState<PriceListRow[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<PriceListRow | 'new' | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await api<PriceListRow[]>('/inventory/price-lists?includeInactive=true');
      setLists(rows);
      setSelectedId((id) => id ?? rows.find((r) => r.isActive)?.id ?? rows[0]?.id ?? null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const selected = lists?.find((l) => l.id === selectedId) ?? null;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <Breadcrumbs
          trail={[{ label: tr("Products"), href: '/inventory/products' }, { label: tr("Price lists") }]}
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-lg bg-mod-inventory/10">
              <Tags className="size-5 text-mod-inventory" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">{tr("Price lists")}</h1>
              <p className="text-sm text-slate-500">
                {tr("Different selling prices for different kinds of customers")}</p>
            </div>
          </div>
          {canWrite && (
            <button onClick={() => setEditing('new')} className={btnPrimary}>
              <Plus className="size-4" /> {' '}{tr("New price list")}</button>
          )}
        </div>
      </div>

      {error && <ErrorBox message={error} />}

      {editing && (
        <PriceListForm
          list={editing === 'new' ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={async (row) => {
            setEditing(null);
            setSelectedId(row.id);
            await load();
          }}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        {/* Lists */}
        <aside className="space-y-2">
          {!lists ? (
            <Loader2 className="mx-auto my-6 size-5 animate-spin text-slate-400" />
          ) : lists.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
              {tr("No price lists yet.")}{canWrite && ' ' + tr('Create one, e.g. “Wholesale” at −10%.')}
            </div>
          ) : (
            lists.map((l) => (
              <button
                key={l.id}
                onClick={() => setSelectedId(l.id)}
                className={clsx(
                  'w-full rounded-xl border bg-white p-4 text-start transition',
                  l.id === selectedId
                    ? 'border-mod-inventory ring-2 ring-mod-inventory/15'
                    : 'border-slate-200 hover:border-slate-300',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={clsx('font-medium', !l.isActive && 'text-slate-400')}>
                    {l.name}
                  </span>
                  {!l.isActive && <StatusBadge active={false} />}
                </div>
                <p className="mt-1 text-xs text-slate-500">{describePercent(l.adjustPercent)}</p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {l.itemCount} {' '}{tr("fixed price")}{l.itemCount === 1 ? '' : 's'}
                </p>
              </button>
            ))
          )}
        </aside>

        {/* Prices of the selected list */}
        {selected && (
          <PriceEditor
            key={selected.id}
            list={selected}
            canWrite={canWrite}
            onEdit={() => setEditing(selected)}
            onToggle={async () => {
              try {
                await api(`/inventory/price-lists/${selected.id}`, {
                  method: 'PATCH',
                  body: JSON.stringify({ isActive: !selected.isActive }),
                });
                await load();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
            onPricesChanged={load}
          />
        )}
      </div>
    </div>
  );
}

// ── Create / edit a list ─────────────────────────────────────────────────────

function PriceListForm({
  list,
  onCancel,
  onSaved,
}: {
  list: PriceListRow | null;
  onCancel: () => void;
  onSaved: (row: PriceListRow) => void;
}) {
  const [name, setName] = useState(list?.name ?? '');
  const [description, setDescription] = useState(list?.description ?? '');
  const [percent, setPercent] = useState(list ? String(Number(list.adjustPercent)) : '0');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const p = percent.trim().replace(/^\+/, '');
    if (!name.trim()) return setError(tr("Enter a name"));
    if (!PERCENT.test(p) || Number(p) <= -90 || Number(p) > 1000) {
      return setError(tr("The percentage must be a number above -90 and at most 1000"));
    }
    setBusy(true);
    try {
      const body = JSON.stringify({ name, description, adjustPercent: p });
      const row = await api<PriceListRow>(
        list ? `/inventory/price-lists/${list.id}` : '/inventory/price-lists',
        { method: list ? 'PATCH' : 'POST', body },
      );
      onSaved(row);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={save}
      className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-[1fr_1fr_10rem_auto] sm:items-end"
    >
      <label>
        <span className="mb-1 block text-sm font-medium text-slate-700">{tr("Name")}</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
          placeholder={tr("Wholesale")}
          maxLength={60}
          autoFocus
        />
      </label>
      <label>
        <span className="mb-1 block text-sm font-medium text-slate-700">{tr("Description")}</span>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={inputClass}
          placeholder={tr("Shops and resellers")}
          maxLength={300}
        />
      </label>
      <label>
        <span className="mb-1 block text-sm font-medium text-slate-700">{tr("Default change (%)")}</span>
        <input
          value={percent}
          onChange={(e) => setPercent(e.target.value)}
          inputMode="decimal"
          className={clsx(inputClass, 'tabular-nums')}
          placeholder="-10"
        />
      </label>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className={btnSecondary}>
          {tr("Cancel")}</button>
        <button type="submit" disabled={busy} className={btnPrimary}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          {list ? tr("Save") : tr("Create")}
        </button>
      </div>
      <p className="text-xs text-slate-500 sm:col-span-4">
        {tr("Products without their own price in this list are sold at their sale price changed by this percentage (e.g. −10 for 10% off).")}{' '}{describePercent(PERCENT.test(percent) ? percent : '0')}.
      </p>
      {error && (
        <div className="sm:col-span-4">
          <ErrorBox message={error} />
        </div>
      )}
    </form>
  );
}

// ── Prices of one list ───────────────────────────────────────────────────────

function PriceEditor({
  list,
  canWrite,
  onEdit,
  onToggle,
  onPricesChanged,
}: {
  list: PriceListRow;
  canWrite: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onPricesChanged: () => void;
}) {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [onlyFixed, setOnlyFixed] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paginated<PriceListProductRow> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (search) params.set('search', search);
    if (onlyFixed) params.set('onlyFixed', 'true');
    api<Paginated<PriceListProductRow>>(`/inventory/price-lists/${list.id}/products?${params}`)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [list.id, search, onlyFixed, page]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  function replaceRow(row: PriceListProductRow) {
    setData((d) =>
      d ? { ...d, items: d.items.map((i) => (i.product.id === row.product.id ? row : i)) } : d,
    );
    onPricesChanged();
  }

  return (
    <section className="min-w-0 rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 p-4">
        <div>
          <h2 className="font-semibold text-slate-900">{list.name}</h2>
          <p className="text-sm text-slate-500">
            {list.description ? `${list.description} · ` : ''}
            {describePercent(list.adjustPercent)}
          </p>
        </div>
        {canWrite && (
          <div className="flex gap-2">
            <button onClick={onToggle} className={clsx(btnSecondary, 'px-2 py-1 text-xs')}>
              {list.isActive ? tr("Deactivate") : tr("Activate")}
            </button>
            <button onClick={onEdit} className={clsx(btnSecondary, 'px-2 py-1 text-xs')}>
              <Pencil className="size-3.5" /> {' '}{tr("Edit")}</button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-3">
        <div className="relative min-w-[14rem] flex-1 sm:max-w-sm">
          <Search className="absolute top-1/2 start-3 size-4 -translate-y-1/2 text-slate-400" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={tr("Search products…")}
            aria-label={tr("Search products")}
            className={clsx(inputClass, 'py-1.5 ps-9')}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={onlyFixed}
            onChange={(e) => {
              setOnlyFixed(e.target.checked);
              setPage(1);
            }}
          />
          {tr("Only products with their own price")}</label>
      </div>

      {error && (
        <div className="p-3">
          <ErrorBox message={error} />
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-start text-xs font-medium text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-2.5">{tr("Product")}</th>
              <th className="px-4 py-2.5">{tr("Unit")}</th>
              <th className="px-4 py-2.5 text-end">{tr("Sale price")}</th>
              <th className="w-56 px-4 py-2.5">{tr("Price in")}{' '}{list.name}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data?.items.map((row) =>
              row.lines.map((line, i) => (
                <tr key={`${row.product.id}-${line.unit.id}`} className={i > 0 ? 'border-t-0' : ''}>
                  {i === 0 && (
                    <td className="px-4 py-2 align-top" rowSpan={row.lines.length}>
                      <Link
                        href={`/inventory/products/${row.product.id}`}
                        className="flex items-center gap-3"
                      >
                        <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded bg-slate-100">
                          {row.product.imageUrl ? (
                            <img
                              src={row.product.imageUrl}
                              alt=""
                              className="size-full object-cover"
                            />
                          ) : (
                            <ImageIcon className="size-4 text-slate-300" />
                          )}
                        </span>
                        <span>
                          <span className="block font-medium text-slate-900 hover:text-mod-inventory">
                            {row.product.name}
                          </span>
                          <span className="font-mono text-xs text-slate-500">
                            {row.product.sku}
                          </span>
                        </span>
                      </Link>
                    </td>
                  )}
                  <td className="px-4 py-2 text-slate-600">
                    {line.unit.code}
                    {line.factor !== '1' && (
                      <span className="text-xs text-slate-400"> ({Number(line.factor)})</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-end text-slate-500 tabular-nums">
                    {formatMoney(line.standardPrice)}
                  </td>
                  <td className="px-4 py-2">
                    <PriceCell
                      listId={list.id}
                      productId={row.product.id}
                      line={line}
                      canWrite={canWrite}
                      onSaved={replaceRow}
                    />
                  </td>
                </tr>
              )),
            )}
          </tbody>
        </table>
        {!data && <Loader2 className="mx-auto my-10 size-6 animate-spin text-slate-400" />}
        {data?.items.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-slate-500">
            {onlyFixed ? tr("No product has its own price in this list yet.") : tr("No products found.")}
          </p>
        )}
      </div>

      {data && data.total > data.pageSize && (
        <div className="flex items-center justify-end gap-1 border-t border-slate-200 px-4 py-2 text-sm text-slate-600">
          <button
            onClick={() => setPage(page - 1)}
            disabled={page <= 1}
            aria-label={tr("Previous page")}
            className="rounded p-1.5 hover:bg-slate-100 disabled:opacity-40"
          >
            <ChevronLeft className="rtl:-scale-x-100 size-4" />
          </button>
          <span className="px-2">
            {tr("Page")}{' '}{page} {' '}{tr("of")}{' '}{totalPages}
          </span>
          <button
            onClick={() => setPage(page + 1)}
            disabled={page >= totalPages}
            aria-label={tr("Next page")}
            className="rounded p-1.5 hover:bg-slate-100 disabled:opacity-40"
          >
            <ChevronRight className="rtl:-scale-x-100 size-4" />
          </button>
        </div>
      )}
    </section>
  );
}

/** Shows the list price; click to set a fixed price, or reset it to the computed one. */
function PriceCell({
  listId,
  productId,
  line,
  canWrite,
  onSaved,
}: {
  listId: string;
  productId: string;
  line: PriceLine;
  canWrite: boolean;
  onSaved: (row: PriceListProductRow) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(price: string | null) {
    if (price !== null && !PRICE.test(price)) return setError(tr("Enter a price like 12.50"));
    setBusy(true);
    setError(null);
    try {
      const body: SetProductPricesInput = { prices: [{ unitId: line.unit.id, price }] };
      onSaved(
        await api<PriceListProductRow>(`/inventory/price-lists/${listId}/products/${productId}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        }),
      );
      setEditing(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div>
        <div className="flex items-center gap-1">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save(value.trim());
              if (e.key === 'Escape') setEditing(false);
            }}
            inputMode="decimal"
            aria-label={tr('Price for {unit}', { unit: line.unit.code })}
            className={clsx(fieldClass, 'w-28 py-1 tabular-nums')}
            autoFocus
          />
          <button
            onClick={() => save(value.trim())}
            disabled={busy}
            className="rounded p-1 text-emerald-600 hover:bg-emerald-50"
            aria-label={tr("Save price")}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          </button>
          <button
            onClick={() => setEditing(false)}
            className="rounded p-1 text-slate-500 hover:bg-slate-100"
            aria-label={tr("Cancel")}
          >
            <X className="size-4" />
          </button>
        </div>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span
        className={clsx(
          'tabular-nums',
          line.fixed ? 'font-semibold text-slate-900' : 'text-slate-600',
        )}
      >
        {formatMoney(line.price)}
      </span>
      {line.fixed ? (
        <span className="rounded bg-mod-inventory/10 px-1.5 py-0.5 text-[10px] font-medium text-mod-inventory uppercase">
          {tr("Own price")}</span>
      ) : (
        <span className="text-[10px] text-slate-400 uppercase">{tr("Auto")}</span>
      )}
      {canWrite && (
        <span className="ms-auto flex gap-1">
          <button
            onClick={() => {
              setValue(line.price);
              setEditing(true);
            }}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label={tr('Set price for {unit}', { unit: line.unit.code })}
          >
            <Pencil className="size-3.5" />
          </button>
          {line.fixed && (
            <button
              onClick={() => save(null)}
              disabled={busy}
              className="rounded px-1.5 text-[11px] text-slate-500 hover:bg-slate-100"
              title={tr("Remove the own price and use the list percentage again")}
            >
              {tr("Reset")}</button>
          )}
        </span>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
