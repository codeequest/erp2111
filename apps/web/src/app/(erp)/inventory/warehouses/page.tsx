'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { Check, FileUp, Loader2, Pencil, Plus, Power, Warehouse, X } from 'lucide-react';
import type { WarehouseRow } from '@erp/shared';
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

import { tr } from '@/lib/i18n';
interface Editing {
  id: string;
  name: string;
  address: string;
}

export default function WarehousesPage() {
  const { can } = useAuth();
  const canManage = can('inventory.warehouse.manage');
  const canOpening = can('inventory.stock.adjust');

  const [rows, setRows] = useState<WarehouseRow[] | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  const load = useCallback(() => {
    api<WarehouseRow[]>(`/inventory/warehouses?includeInactive=${showInactive}`)
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  }, [showInactive]);
  useEffect(load, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/inventory/warehouses', {
        method: 'POST',
        body: JSON.stringify({ code, name, address: address || null }),
      });
      setCode('');
      setName('');
      setAddress('');
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
      await api(`/inventory/warehouses/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      load();
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    }
  }

  async function saveEdit() {
    if (!editing || !editing.name.trim()) return;
    if (await patch(editing.id, { name: editing.name, address: editing.address || null })) {
      setEditing(null);
    }
  }

  async function toggle(w: WarehouseRow) {
    if (w.isActive && !confirm(tr('Deactivate {code} — {name}?', { code: w.code, name: w.name }))) return;
    setToggling(w.id);
    await patch(w.id, { isActive: !w.isActive });
    setToggling(null);
  }

  if (!can('inventory.stock.read')) {
    return (
      <div className="mx-auto max-w-3xl">
        <ErrorBox message={tr("You need the inventory.stock.read permission to see warehouses.")} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Breadcrumbs trail={[{ label: tr("Warehouses") }]} />
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">{tr("Warehouses")}</h1>
          <p className="text-sm text-slate-500">
            {tr("Shops, depots and storage places where the company keeps its goods")}</p>
        </div>
        {canOpening && (
          <Link href="/inventory/warehouses/opening" className={btnSecondary}>
            <FileUp className="size-4" /> {' '}{tr("Import opening stock")}</Link>
        )}
      </div>

      {canManage && (
        <form
          onSubmit={add}
          className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4"
        >
          <label className="w-32">
            <span className="mb-1 block text-sm font-medium text-slate-700">{tr("Code")}</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className={clsx(inputClass, 'font-mono')}
              placeholder="SFAX"
              maxLength={20}
            />
          </label>
          <label className="min-w-[12rem] flex-1">
            <span className="mb-1 block text-sm font-medium text-slate-700">{tr("Name")}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              placeholder={tr("Sfax shop")}
              maxLength={100}
            />
          </label>
          <label className="min-w-[12rem] flex-1">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              {tr("Address")}{' '}<span className="font-normal text-slate-400">{tr("(optional)")}</span>
            </span>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className={inputClass}
              maxLength={300}
            />
          </label>
          <button
            type="submit"
            disabled={busy || !code.trim() || !name.trim()}
            className={btnPrimary}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} {' '}{tr("Add warehouse")}</button>
        </form>
      )}

      {error && <ErrorBox message={error} />}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2 text-sm">
          <span className="font-medium text-slate-800">
            {rows ? `${rows.length} warehouse${rows.length === 1 ? '' : 's'}` : tr("Warehouses")}
          </span>
          <label className="flex items-center gap-2 text-slate-600">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            {tr("Show inactive")}</label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-start text-xs font-medium text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-2.5">{tr("Code")}</th>
                <th className="px-4 py-2.5">{tr("Name")}</th>
                <th className="px-4 py-2.5">{tr("Address")}</th>
                <th className="px-4 py-2.5 text-end">{tr("Products in stock")}</th>
                <th className="px-4 py-2.5">{tr("Status")}</th>
                {canManage && <th className="w-24 px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows?.map((w) =>
                editing?.id === w.id ? (
                  <tr key={w.id} className="bg-slate-50/60">
                    <td className="px-4 py-2.5 font-mono text-xs">{w.code}</td>
                    <td className="px-4 py-2">
                      <input
                        value={editing.name}
                        onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                        onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                        className={clsx(fieldClass, 'w-full py-1')}
                        aria-label={tr("Warehouse name")}
                        maxLength={100}
                        autoFocus
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        value={editing.address}
                        onChange={(e) => setEditing({ ...editing, address: e.target.value })}
                        onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                        className={clsx(fieldClass, 'w-full py-1')}
                        aria-label={tr("Warehouse address")}
                        maxLength={300}
                      />
                    </td>
                    <td className="px-4 py-2.5 text-end text-slate-500">{w.productsInStock}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge active={w.isActive} />
                    </td>
                    <td className="px-4 py-2.5 text-end whitespace-nowrap">
                      <button
                        onClick={saveEdit}
                        disabled={!editing.name.trim()}
                        className="rounded p-1.5 text-emerald-600 hover:bg-emerald-50 disabled:opacity-40"
                        aria-label={tr("Save")}
                      >
                        <Check className="size-4" />
                      </button>
                      <button
                        onClick={() => setEditing(null)}
                        className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
                        aria-label={tr("Cancel")}
                      >
                        <X className="size-4" />
                      </button>
                    </td>
                  </tr>
                ) : (
                  <tr key={w.id} className={clsx(!w.isActive && 'text-slate-400')}>
                    <td className="px-4 py-2.5 font-mono text-xs">{w.code}</td>
                    <td className="px-4 py-2.5 font-medium">{w.name}</td>
                    <td className="px-4 py-2.5 text-slate-500">{w.address ?? '—'}</td>
                    <td className="px-4 py-2.5 text-end tabular-nums">{w.productsInStock}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge active={w.isActive} />
                    </td>
                    {canManage && (
                      <td className="px-4 py-2.5 text-end whitespace-nowrap">
                        <button
                          onClick={() =>
                            setEditing({ id: w.id, name: w.name, address: w.address ?? '' })
                          }
                          className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
                          aria-label={tr('Edit {name}', { name: w.code })}
                          title={tr("Edit")}
                        >
                          <Pencil className="size-4" />
                        </button>
                        <button
                          onClick={() => toggle(w)}
                          disabled={toggling === w.id}
                          className={clsx(
                            'rounded p-1.5 hover:bg-slate-100',
                            w.isActive ? 'text-red-500' : 'text-emerald-600',
                          )}
                          aria-label={`${w.isActive ? tr("Deactivate") : tr("Activate")} ${w.code}`}
                          title={w.isActive ? tr("Deactivate") : tr("Activate")}
                        >
                          {toggling === w.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Power className="size-4" />
                          )}
                        </button>
                      </td>
                    )}
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
        {rows === null && !error && (
          <p className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-slate-500">
            <Loader2 className="size-4 animate-spin" /> {' '}{tr("Loading…")}</p>
        )}
        {rows?.length === 0 && (
          <div className="flex flex-col items-center px-4 py-10 text-center text-sm text-slate-500">
            <Warehouse className="size-8 text-slate-300" />
            <p className="mt-2">{tr("No warehouse yet.")}</p>
          </div>
        )}
      </div>

      <p className="text-xs text-slate-500">
        {tr("A warehouse is never deleted, so its stock history stays complete. It can be deactivated once its stock is zero; at least one warehouse always stays active.")}</p>
    </div>
  );
}
