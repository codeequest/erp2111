'use client';

import { useCallback, useMemo, useState } from 'react';
import { Plus, Ruler, Search } from 'lucide-react';
import type { UnitItem } from '@erp/shared';
import { api, ApiRequestError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApiData } from '@/lib/use-api-data';
import { CatalogHeader } from '@/components/inventory/catalog-header';
import {
  AccessDenied,
  Dialog,
  EmptyState,
  ErrorBanner,
  Field,
  inputClass,
  PrimaryButton,
  SecondaryButton,
  SkeletonRows,
  SuccessState,
} from '@/components/ui';

export default function UnitsPage() {
  const { can } = useAuth();
  const canRead = can('inventory.product.read');
  const canWrite = can('inventory.product.write');
  const { data, error, loading, reload } = useApiData<UnitItem[]>(
    canRead ? '/inventory/units' : null,
  );
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);

  const units = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? []).filter(
      (u) => !q || u.code.toLowerCase().includes(q) || u.name.toLowerCase().includes(q),
    );
  }, [data, query]);

  const onCreated = useCallback(
    (unit: UnitItem) => {
      setHighlight(unit.id);
      void reload();
    },
    [reload],
  );

  if (!canRead) return <AccessDenied permission="inventory.product.read" what="units" />;

  const newButton = canWrite && (
    <PrimaryButton onDark onClick={() => setCreating(true)}>
      <Plus className="size-4" /> New unit
    </PrimaryButton>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <CatalogHeader
        title="Units of measure"
        description="How products are counted. Stock is always kept in a product's base unit."
        icon={Ruler}
        actions={newButton}
      />

      {error && <ErrorBanner message={error} onRetry={reload} />}

      <section
        className="animate-fade-up overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs"
        style={{ animationDelay: '80ms' }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-3">
          <div className="relative w-full max-w-xs">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search code or name…"
              className={inputClass() + ' pl-9'}
            />
          </div>
          {data && (
            <span className="hidden text-xs text-slate-500 sm:block">
              {units.length} of {data.length} units
            </span>
          )}
        </div>

        {loading && !data ? (
          <SkeletonRows rows={4} />
        ) : units.length === 0 ? (
          <EmptyState
            icon={Ruler}
            title={query ? 'No unit matches your search' : 'No units yet'}
            text={
              query
                ? 'Try another code or name.'
                : 'Add the units you buy and sell in, e.g. PCS, CTN or KG.'
            }
            action={
              !query &&
              canWrite && (
                <PrimaryButton onClick={() => setCreating(true)}>
                  <Plus className="size-4" /> New unit
                </PrimaryButton>
              )
            }
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50/70 text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-2.5">Code</th>
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5 text-right">Products</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {units.map((u, i) => (
                <tr
                  key={u.id}
                  className={
                    'animate-fade-up transition-colors hover:bg-emerald-50/40 ' +
                    (highlight === u.id ? 'bg-emerald-50/70' : '')
                  }
                  style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
                >
                  <td className="px-4 py-3">
                    <span className="rounded-md bg-emerald-50 px-2 py-0.5 font-mono text-xs font-semibold text-mod-inventory ring-1 ring-emerald-200/60">
                      {u.code}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-800">{u.name}</td>
                  <td className="px-4 py-3 text-right text-slate-500 tabular-nums">
                    {u.productCount.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <NewUnitDialog open={creating} onClose={() => setCreating(false)} onCreated={onCreated} />
    </div>
  );
}

function NewUnitDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (unit: UnitItem) => void;
}) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [errors, setErrors] = useState<{ code?: string; name?: string; form?: string }>({});
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const close = useCallback(() => {
    setCode('');
    setName('');
    setErrors({});
    setDone(false);
    onClose();
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!/^[A-Za-z0-9_-]{1,10}$/.test(code.trim()))
      next.code = 'Up to 10 letters, digits, "-" or "_".';
    if (!name.trim()) next.name = 'Give the unit a name.';
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    try {
      const unit = await api<UnitItem>('/inventory/units', {
        method: 'POST',
        body: JSON.stringify({ code, name }),
      });
      setDone(true);
      onCreated(unit);
      setTimeout(close, 1100);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not save';
      setErrors(
        err instanceof ApiRequestError && err.status === 409 ? { code: msg } : { form: msg },
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="New unit"
      description="Used as a product's base unit or as a purchase / sale unit."
    >
      {done ? (
        <SuccessState message={`Unit ${code.trim().toUpperCase()} created`} />
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {errors.form && <ErrorBanner message={errors.form} />}
          <Field label="Code" hint="Short and upper-case, e.g. CTN" error={errors.code}>
            {(id, invalid) => (
              <input
                id={id}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={10}
                placeholder="CTN"
                autoComplete="off"
                className={inputClass(invalid) + ' font-mono'}
              />
            )}
          </Field>
          <Field label="Name" error={errors.name}>
            {(id, invalid) => (
              <input
                id={id}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={50}
                placeholder="Carton"
                className={inputClass(invalid)}
              />
            )}
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton type="button" onClick={close}>
              Cancel
            </SecondaryButton>
            <PrimaryButton type="submit" loading={saving}>
              Create unit
            </PrimaryButton>
          </div>
        </form>
      )}
    </Dialog>
  );
}
