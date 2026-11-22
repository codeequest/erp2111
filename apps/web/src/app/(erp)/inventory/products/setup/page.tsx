'use client';

import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { Check, FolderTree, Loader2, Pencil, Percent, Plus, Ruler, X } from 'lucide-react';
import type { CategoryNode, TaxRateRow, UnitRow } from '@erp/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  Breadcrumbs,
  ErrorBox,
  StatusBadge,
  btnPrimary,
  btnSecondary,
  fieldClass,
  inputClass,
} from '@/components/products/ui';

type Tab = 'categories' | 'units' | 'taxes';

export default function CatalogueSetupPage() {
  const { can } = useAuth();
  const canWrite = can('inventory.product.write');
  const canTaxes = can('admin.settings.manage');
  const [tab, setTab] = useState<Tab>('categories');

  const tabs: { key: Tab; label: string; icon: typeof FolderTree; show: boolean }[] = [
    { key: 'categories', label: 'Categories', icon: FolderTree, show: true },
    { key: 'units', label: 'Units', icon: Ruler, show: true },
    { key: 'taxes', label: 'Tax rates', icon: Percent, show: canTaxes },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Breadcrumbs
          trail={[{ label: 'Products', href: '/inventory/products' }, { label: 'Catalogue setup' }]}
        />
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Catalogue setup</h1>
        <p className="text-sm text-slate-500">
          Categories, units of measure and tax rates used by products
        </p>
      </div>

      <div className="flex gap-1 border-b border-slate-200" role="tablist">
        {tabs
          .filter((t) => t.show)
          .map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={clsx(
                '-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition',
                tab === t.key
                  ? 'border-mod-inventory text-mod-inventory'
                  : 'border-transparent text-slate-500 hover:text-slate-800',
              )}
            >
              <t.icon className="size-4" /> {t.label}
            </button>
          ))}
      </div>

      {tab === 'categories' && <CategoriesTab canWrite={canWrite} />}
      {tab === 'units' && <UnitsTab canWrite={canWrite} />}
      {tab === 'taxes' && canTaxes && <TaxRatesTab />}
    </div>
  );
}

// ── Categories ────────────────────────────────────────────────────────────────

function CategoriesTab({ canWrite }: { canWrite: boolean }) {
  const [rows, setRows] = useState<CategoryNode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(() => {
    api<CategoryNode[]>('/inventory/categories?includeInactive=true')
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api('/inventory/categories', {
        method: 'POST',
        body: JSON.stringify({ name, parentId: parentId || null }),
      });
      setName('');
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setError(null);
    try {
      await api(`/inventory/categories/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      setEditing(null);
      load();
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    }
  }

  return (
    <div className="space-y-4">
      {canWrite && (
        <form
          onSubmit={add}
          className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4"
        >
          <label className="min-w-[12rem] flex-1">
            <span className="mb-1 block text-sm font-medium text-slate-700">New category</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              placeholder="e.g. Oils"
              maxLength={100}
            />
          </label>
          <label className="min-w-[12rem] flex-1">
            <span className="mb-1 block text-sm font-medium text-slate-700">Inside</span>
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className={inputClass}
            >
              <option value="">Top level</option>
              {rows
                ?.filter((c) => c.isActive)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.path}
                  </option>
                ))}
            </select>
          </label>
          <button type="submit" disabled={busy || !name.trim()} className={btnPrimary}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Add
          </button>
        </form>
      )}

      {error && <ErrorBox message={error} />}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {!rows ? (
          <Loader2 className="mx-auto my-10 size-6 animate-spin text-slate-400" />
        ) : rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">No categories yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((c) =>
              editing === c.id ? (
                <CategoryEditor
                  key={c.id}
                  category={c}
                  all={rows}
                  onCancel={() => setEditing(null)}
                  onSave={(body) => patch(c.id, body)}
                />
              ) : (
                <li key={c.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span
                    style={{ paddingLeft: `${c.depth * 1.5}rem` }}
                    className={clsx('flex-1', !c.isActive && 'text-slate-400')}
                  >
                    {c.depth > 0 && <span className="mr-1.5 text-slate-300">└</span>}
                    <span className="font-medium">{c.name}</span>
                  </span>
                  <span className="text-xs text-slate-500">
                    {c.productCount} product{c.productCount === 1 ? '' : 's'}
                  </span>
                  <StatusBadge active={c.isActive} />
                  {canWrite && (
                    <span className="flex gap-1">
                      <button
                        onClick={() => setEditing(c.id)}
                        className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
                        aria-label={`Edit ${c.name}`}
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        onClick={() => patch(c.id, { isActive: !c.isActive })}
                        className="rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
                      >
                        {c.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </span>
                  )}
                </li>
              ),
            )}
          </ul>
        )}
      </div>
      <p className="text-xs text-slate-500">
        Inactive categories are hidden from the product form; their products keep them. Filtering
        the product list by a category also shows the products of its sub-categories.
      </p>
    </div>
  );
}

function CategoryEditor({
  category,
  all,
  onCancel,
  onSave,
}: {
  category: CategoryNode;
  all: CategoryNode[];
  onCancel: () => void;
  onSave: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [name, setName] = useState(category.name);
  const [parentId, setParentId] = useState(category.parentId ?? '');
  // A category cannot move inside itself or its own sub-categories.
  const blocked = new Set([category.id]);
  for (const c of all) if (c.parentId && blocked.has(c.parentId)) blocked.add(c.id);

  return (
    <li className="flex flex-wrap items-center gap-2 bg-slate-50 px-4 py-2.5">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className={clsx(fieldClass, 'min-w-[10rem] flex-1 py-1.5')}
        aria-label="Category name"
        autoFocus
      />
      <select
        value={parentId}
        onChange={(e) => setParentId(e.target.value)}
        className={clsx(fieldClass, 'py-1.5')}
        aria-label="Parent category"
      >
        <option value="">Top level</option>
        {all
          .filter((c) => !blocked.has(c.id))
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.path}
            </option>
          ))}
      </select>
      <button
        onClick={() => onSave({ name, parentId: parentId || null })}
        className="rounded p-1.5 text-emerald-600 hover:bg-emerald-50"
        aria-label="Save"
      >
        <Check className="size-4" />
      </button>
      <button
        onClick={onCancel}
        className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
        aria-label="Cancel"
      >
        <X className="size-4" />
      </button>
    </li>
  );
}

// ── Units ─────────────────────────────────────────────────────────────────────

function UnitsTab({ canWrite }: { canWrite: boolean }) {
  const [rows, setRows] = useState<UnitRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const load = useCallback(() => {
    api<UnitRow[]>('/inventory/units')
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/inventory/units', { method: 'POST', body: JSON.stringify({ code, name }) });
      setCode('');
      setName('');
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function rename() {
    if (!editing) return;
    setError(null);
    try {
      await api(`/inventory/units/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: editing.name }),
      });
      setEditing(null);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      {canWrite && (
        <form
          onSubmit={add}
          className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4"
        >
          <label className="w-32">
            <span className="mb-1 block text-sm font-medium text-slate-700">Code</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className={clsx(inputClass, 'font-mono')}
              placeholder="CTN"
              maxLength={10}
            />
          </label>
          <label className="min-w-[12rem] flex-1">
            <span className="mb-1 block text-sm font-medium text-slate-700">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              placeholder="Carton"
              maxLength={50}
            />
          </label>
          <button
            type="submit"
            disabled={busy || !code.trim() || !name.trim()}
            className={btnPrimary}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Add
            unit
          </button>
        </form>
      )}

      {error && <ErrorBox message={error} />}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-2.5">Code</th>
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5 text-right">Used by</th>
              {canWrite && <th className="w-24 px-4 py-2.5" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows?.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-2.5 font-mono text-xs">{u.code}</td>
                <td className="px-4 py-2.5">
                  {editing?.id === u.id ? (
                    <span className="flex items-center gap-2">
                      <input
                        value={editing.name}
                        onChange={(e) => setEditing({ id: u.id, name: e.target.value })}
                        onKeyDown={(e) => e.key === 'Enter' && rename()}
                        className={clsx(fieldClass, 'py-1')}
                        aria-label="Unit name"
                        autoFocus
                      />
                      <button
                        onClick={rename}
                        className="rounded p-1 text-emerald-600 hover:bg-emerald-50"
                        aria-label="Save"
                      >
                        <Check className="size-4" />
                      </button>
                      <button
                        onClick={() => setEditing(null)}
                        className="rounded p-1 text-slate-500 hover:bg-slate-100"
                        aria-label="Cancel"
                      >
                        <X className="size-4" />
                      </button>
                    </span>
                  ) : (
                    u.name
                  )}
                </td>
                <td className="px-4 py-2.5 text-right text-slate-500">
                  {u.productCount} product{u.productCount === 1 ? '' : 's'}
                </td>
                {canWrite && (
                  <td className="px-4 py-2.5 text-right">
                    {editing?.id !== u.id && (
                      <button
                        onClick={() => setEditing({ id: u.id, name: u.name })}
                        className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
                        aria-label={`Rename ${u.code}`}
                      >
                        <Pencil className="size-4" />
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows && <Loader2 className="mx-auto my-10 size-6 animate-spin text-slate-400" />}
      </div>
      <p className="text-xs text-slate-500">
        Unit codes cannot be changed after creation, because they appear on documents.
      </p>
    </div>
  );
}

// ── Tax rates ─────────────────────────────────────────────────────────────────

function TaxRatesTab() {
  const [rows, setRows] = useState<TaxRateRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [rate, setRate] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<TaxRateRow[]>('/settings/tax-rates')
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/settings/tax-rates', { method: 'POST', body: JSON.stringify({ name, rate }) });
      setName('');
      setRate('');
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(t: TaxRateRow) {
    setError(null);
    try {
      await api(`/settings/tax-rates/${t.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !t.isActive }),
      });
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={add}
        className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4"
      >
        <label className="min-w-[12rem] flex-1">
          <span className="mb-1 block text-sm font-medium text-slate-700">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            placeholder="VAT 19%"
            maxLength={50}
          />
        </label>
        <label className="w-32">
          <span className="mb-1 block text-sm font-medium text-slate-700">Rate (%)</span>
          <input
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            inputMode="decimal"
            className={clsx(inputClass, 'tabular-nums')}
            placeholder="19"
          />
        </label>
        <button
          type="submit"
          disabled={busy || !name.trim() || !rate.trim()}
          className={btnPrimary}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Add
          rate
        </button>
      </form>

      {error && <ErrorBox message={error} />}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5 text-right">Rate</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="w-28 px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows?.map((t) => (
              <tr key={t.id}>
                <td className="px-4 py-2.5 font-medium">{t.name}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {Number(t.rate).toFixed(2)}%
                </td>
                <td className="px-4 py-2.5">
                  <StatusBadge active={t.isActive} />
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button
                    onClick={() => toggle(t)}
                    className={clsx(btnSecondary, 'px-2 py-1 text-xs')}
                  >
                    {t.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows?.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-slate-500">No tax rates yet.</p>
        )}
        {!rows && <Loader2 className="mx-auto my-10 size-6 animate-spin text-slate-400" />}
      </div>
      <p className="text-xs text-slate-500">
        Changing a rate affects only documents created afterwards. Tax rates are company settings,
        so this tab needs the admin.settings.manage permission.
      </p>
    </div>
  );
}
