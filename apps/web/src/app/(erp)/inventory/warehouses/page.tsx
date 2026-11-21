'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { Boxes, ChevronRight, Loader2, MapPin, Pencil, Plus, Power, Warehouse } from 'lucide-react';
import type { WarehouseItem } from '@erp/shared';
import { api, ApiRequestError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApiData } from '@/lib/use-api-data';
import {
  AccessDenied,
  Dialog,
  EmptyState,
  ErrorBanner,
  Field,
  inputClass,
  PrimaryButton,
  SecondaryButton,
  SuccessState,
  Toast,
} from '@/components/ui';

type Editor = { mode: 'create' } | { mode: 'edit'; warehouse: WarehouseItem } | null;

export default function WarehousesPage() {
  const { can } = useAuth();
  const canRead = can('inventory.stock.read');
  const canManage = can('inventory.warehouse.manage');
  const { data, error, loading, reload } = useApiData<WarehouseItem[]>(
    canRead ? '/inventory/warehouses' : null,
  );
  const [editor, setEditor] = useState<Editor>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const clearToast = useCallback(() => setToast(null), []);

  async function setActive(w: WarehouseItem, isActive: boolean) {
    setBusyId(w.id);
    setActionError(null);
    try {
      await api(`/inventory/warehouses/${w.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive }),
      });
      setToast(`${w.name} ${isActive ? 'reactivated' : 'deactivated'}`);
      await reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not update the warehouse');
    } finally {
      setBusyId(null);
    }
  }

  if (!canRead) return <AccessDenied permission="inventory.stock.read" what="warehouses" />;

  const activeCount = data?.filter((w) => w.isActive).length ?? 0;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="animate-fade-up space-y-5">
        <nav className="flex items-center gap-1 text-xs text-slate-500">
          <Link href="/dashboard" className="hover:text-slate-700">
            Home
          </Link>
          <ChevronRight className="size-3" />
          <span className="text-mod-inventory">Inventory</span>
          <ChevronRight className="size-3" />
          <span>Warehouses</span>
        </nav>
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 via-mod-inventory to-teal-700 p-5 text-white shadow-lg shadow-emerald-700/15 sm:p-6">
          <div className="pointer-events-none absolute -top-16 -right-10 size-48 rounded-full bg-white/10 blur-2xl" />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="grid size-11 place-items-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
                <Warehouse className="size-5.5" />
              </div>
              <div>
                <h1 className="text-xl font-semibold sm:text-2xl">Warehouses</h1>
                <p className="text-sm text-emerald-50/90">
                  Shops, depots and storage locations
                  {data && ` · ${activeCount} active`}
                </p>
              </div>
            </div>
            {canManage && (
              <PrimaryButton onDark onClick={() => setEditor({ mode: 'create' })}>
                <Plus className="size-4" /> New warehouse
              </PrimaryButton>
            )}
          </div>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={reload} />}
      {actionError && <ErrorBanner message={actionError} />}

      {loading && !data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-40 animate-pulse rounded-xl border border-slate-200 bg-white"
            />
          ))}
        </div>
      ) : data && data.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white">
          <EmptyState
            icon={Warehouse}
            title="No warehouses yet"
            text="Add the places where you keep stock: a shop, a depot, a back room."
          />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data?.map((w, i) => (
            <article
              key={w.id}
              className={clsx(
                'group animate-fade-up relative flex flex-col rounded-xl border bg-white p-5 shadow-xs transition-all duration-200',
                w.isActive
                  ? 'border-slate-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-emerald-900/5 hover:ring-1 hover:ring-emerald-200'
                  : 'border-dashed border-slate-300 bg-slate-50/60',
              )}
              style={{ animationDelay: `${80 + i * 60}ms` }}
            >
              <div className="flex items-start justify-between gap-3">
                <div
                  className={clsx(
                    'grid size-10 place-items-center rounded-lg transition-transform duration-200 group-hover:scale-105',
                    w.isActive
                      ? 'bg-gradient-to-br from-emerald-50 to-teal-100 text-mod-inventory ring-1 ring-emerald-200/60'
                      : 'bg-slate-100 text-slate-400',
                  )}
                >
                  <Warehouse className="size-5" />
                </div>
                <span
                  className={clsx(
                    'rounded-md px-2 py-0.5 font-mono text-xs font-semibold ring-1',
                    w.isActive
                      ? 'bg-emerald-50 text-mod-inventory ring-emerald-200/60'
                      : 'bg-slate-100 text-slate-500 ring-slate-200',
                  )}
                >
                  {w.code}
                </span>
              </div>

              <h2
                className={clsx(
                  'mt-4 font-semibold',
                  w.isActive ? 'text-slate-900' : 'text-slate-500',
                )}
              >
                {w.name}
                {!w.isActive && (
                  <span className="ml-2 rounded-full bg-slate-200/70 px-2 py-0.5 align-middle text-[11px] font-medium text-slate-500">
                    Inactive
                  </span>
                )}
              </h2>
              <p className="mt-1 flex min-h-5 items-start gap-1.5 text-sm text-slate-500">
                {w.address && (
                  <>
                    <MapPin className="mt-0.5 size-3.5 shrink-0" /> {w.address}
                  </>
                )}
              </p>

              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                <span className="flex items-center gap-1.5 text-sm text-slate-600">
                  <Boxes className="size-4 text-slate-400" />
                  <span className="font-medium tabular-nums">{w.productsInStock}</span>
                  {w.productsInStock === 1 ? 'product' : 'products'} in stock
                </span>
                {canManage && (
                  <div className="flex gap-0.5">
                    <button
                      onClick={() => setEditor({ mode: 'edit', warehouse: w })}
                      title="Edit"
                      aria-label={`Edit ${w.name}`}
                      className="grid size-8 place-items-center rounded-md text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-700 active:scale-90"
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      onClick={() => setActive(w, !w.isActive)}
                      disabled={busyId === w.id}
                      title={w.isActive ? 'Deactivate' : 'Reactivate'}
                      aria-label={`${w.isActive ? 'Deactivate' : 'Reactivate'} ${w.name}`}
                      className={clsx(
                        'grid size-8 place-items-center rounded-md text-slate-400 transition-all active:scale-90 disabled:opacity-50',
                        w.isActive
                          ? 'hover:bg-red-50 hover:text-red-600'
                          : 'hover:bg-emerald-50 hover:text-mod-inventory',
                      )}
                    >
                      {busyId === w.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Power className="size-4" />
                      )}
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <Dialog
        open={editor !== null}
        onClose={() => setEditor(null)}
        title={editor?.mode === 'edit' ? 'Edit warehouse' : 'New warehouse'}
        description={
          editor?.mode === 'edit'
            ? 'The code identifies the warehouse on documents and cannot change.'
            : 'Each warehouse keeps its own stock levels.'
        }
      >
        {editor && (
          <WarehouseForm
            key={editor.mode === 'edit' ? editor.warehouse.id : 'new'}
            warehouse={editor.mode === 'edit' ? editor.warehouse : null}
            onClose={() => setEditor(null)}
            onSaved={() => void reload()}
          />
        )}
      </Dialog>

      <Toast message={toast} onDone={clearToast} />
    </div>
  );
}

function WarehouseForm({
  warehouse,
  onClose,
  onSaved,
}: {
  warehouse: WarehouseItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [code, setCode] = useState(warehouse?.code ?? '');
  const [name, setName] = useState(warehouse?.name ?? '');
  const [address, setAddress] = useState(warehouse?.address ?? '');
  const [errors, setErrors] = useState<{ code?: string; name?: string; form?: string }>({});
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!warehouse && !/^[A-Za-z0-9_-]{1,20}$/.test(code.trim()))
      next.code = 'Up to 20 letters, digits, "-" or "_".';
    if (!name.trim()) next.name = 'Give the warehouse a name.';
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    try {
      if (warehouse) {
        await api(`/inventory/warehouses/${warehouse.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name, address }),
        });
      } else {
        await api('/inventory/warehouses', {
          method: 'POST',
          body: JSON.stringify({ code, name, address }),
        });
      }
      setDone(true);
      onSaved();
      setTimeout(onClose, 1100);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not save';
      setErrors(
        err instanceof ApiRequestError && err.status === 409 ? { code: msg } : { form: msg },
      );
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return <SuccessState message={warehouse ? 'Warehouse updated' : `${name.trim()} created`} />;
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {errors.form && <ErrorBanner message={errors.form} />}
      <Field
        label="Code"
        hint={warehouse ? 'Cannot be changed.' : 'Short, e.g. SHOP1 or DEPOT'}
        error={errors.code}
      >
        {(id, invalid) => (
          <input
            id={id}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            disabled={Boolean(warehouse)}
            maxLength={20}
            placeholder="SHOP1"
            autoComplete="off"
            className={
              inputClass(invalid) + ' font-mono disabled:bg-slate-50 disabled:text-slate-500'
            }
          />
        )}
      </Field>
      <Field label="Name" error={errors.name}>
        {(id, invalid) => (
          <input
            id={id}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            placeholder="Downtown shop"
            className={inputClass(invalid)}
          />
        )}
      </Field>
      <Field label="Address" hint="Optional. Printed on delivery notes.">
        {(id) => (
          <textarea
            id={id}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            maxLength={300}
            rows={2}
            className={inputClass() + ' resize-none'}
          />
        )}
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <SecondaryButton type="button" onClick={onClose}>
          Cancel
        </SecondaryButton>
        <PrimaryButton type="submit" loading={saving}>
          {warehouse ? 'Save changes' : 'Create warehouse'}
        </PrimaryButton>
      </div>
    </form>
  );
}
