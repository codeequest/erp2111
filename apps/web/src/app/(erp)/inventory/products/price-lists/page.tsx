'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { Check, ChevronRight, Loader2, Pencil, Plus, Tags, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import {
  createPriceList,
  listPriceLists,
  toNum,
  updatePriceList,
  type PriceList,
} from '@/lib/inventory';
import {
  Alert,
  PageHeader,
  ProductTabs,
  RequirePermission,
  StatusBadge,
  btnPrimary,
  inputBase,
} from '@/components/inventory/ui';

export default function PriceListsPage() {
  return (
    <RequirePermission permission="inventory.product.read">
      <PriceLists />
    </RequirePermission>
  );
}

const pctValid = (v: string) =>
  v.trim() === '' || (!Number.isNaN(toNum(v)) && toNum(v) >= -100 && toNum(v) <= 500);
const ruleText = (pct: string | number) => {
  const n = Number(pct);
  return n === 0 ? 'Same as retail' : n < 0 ? `${-n} % below retail` : `${n} % above retail`;
};

function PriceLists() {
  const { can } = useAuth();
  const canWrite = can('inventory.product.write');
  const [lists, setLists] = useState<PriceList[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [pct, setPct] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string; pct: string } | null>(null);

  const load = useCallback(() => {
    listPriceLists()
      .then(setLists)
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      load();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Price lists"
        subtitle="Wholesale, resellers… Retail is the product's sale price."
        crumbs={[{ label: 'Price lists' }]}
      />
      <ProductTabs />

      {error && <Alert>{error}</Alert>}

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        Each price list has a <b>rule</b> (e.g. 10 % below retail) that applies to every product,
        and you can set a <b>fixed price</b> for any product — it replaces the rule. Customers will
        be linked to a price list when the Sales module is built.
      </div>

      {canWrite && (
        <form
          className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!code.trim() || !name.trim() || !pctValid(pct)) return;
            const ok = await run(() =>
              createPriceList({
                code: code.trim(),
                name: name.trim(),
                adjustmentPct: pct.trim() ? toNum(pct) : 0,
              }),
            );
            if (ok) {
              setCode('');
              setName('');
              setPct('');
            }
          }}
        >
          <label className="w-36">
            <span className="mb-1 block text-sm font-medium text-slate-700">Code</span>
            <input
              className={clsx(inputBase, 'w-full uppercase')}
              value={code}
              maxLength={20}
              placeholder="WHOLESALE"
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <label className="min-w-48 flex-1">
            <span className="mb-1 block text-sm font-medium text-slate-700">Name</span>
            <input
              className={clsx(inputBase, 'w-full')}
              value={name}
              placeholder="Wholesale"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="w-40">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              Rule vs retail (%)
            </span>
            <input
              className={clsx(inputBase, 'w-full', !pctValid(pct) && 'border-red-400')}
              value={pct}
              inputMode="decimal"
              placeholder="-10"
              onChange={(e) => setPct(e.target.value)}
            />
          </label>
          <button
            className={btnPrimary}
            disabled={busy || !code.trim() || !name.trim() || !pctValid(pct)}
          >
            <Plus className="size-4" /> Add price list
          </button>
        </form>
      )}

      <div className="rounded-xl border border-slate-200 bg-white">
        {!lists ? (
          <Loader2 className="mx-auto my-12 size-6 animate-spin text-slate-400" />
        ) : lists.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <Tags className="mx-auto size-8 text-slate-300" />
            <p className="mt-3 font-medium text-slate-900">No price lists yet</p>
            <p className="mt-1 text-sm text-slate-500">Only the retail price is used for now.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-2.5">Price list</th>
                <th className="px-4 py-2.5">Rule</th>
                <th className="px-4 py-2.5 text-right">Fixed prices</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lists.map((l) =>
                editing?.id === l.id ? (
                  <tr key={l.id} className="bg-slate-50">
                    <td className="px-4 py-2">
                      <input
                        aria-label="Name"
                        autoFocus
                        className={clsx(inputBase, 'w-full py-1.5')}
                        value={editing.name}
                        onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                      />
                    </td>
                    <td className="px-4 py-2" colSpan={3}>
                      <label className="flex items-center gap-2 text-slate-600">
                        <input
                          aria-label="Rule in %"
                          inputMode="decimal"
                          className={clsx(
                            inputBase,
                            'w-24 py-1.5',
                            !pctValid(editing.pct) && 'border-red-400',
                          )}
                          value={editing.pct}
                          onChange={(e) => setEditing({ ...editing, pct: e.target.value })}
                        />
                        % vs retail
                      </label>
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <button
                        aria-label="Save"
                        disabled={busy || !editing.name.trim() || !pctValid(editing.pct)}
                        className="rounded p-1.5 text-emerald-600 hover:bg-emerald-50 disabled:opacity-40"
                        onClick={async () => {
                          const ok = await run(() =>
                            updatePriceList(l.id, {
                              name: editing.name.trim(),
                              adjustmentPct: editing.pct.trim() ? toNum(editing.pct) : 0,
                            }),
                          );
                          if (ok) setEditing(null);
                        }}
                      >
                        <Check className="size-4" />
                      </button>
                      <button
                        aria-label="Cancel"
                        className="rounded p-1.5 text-slate-400 hover:bg-slate-100"
                        onClick={() => setEditing(null)}
                      >
                        <X className="size-4" />
                      </button>
                    </td>
                  </tr>
                ) : (
                  <tr key={l.id} className={clsx(!l.isActive && 'text-slate-400')}>
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/inventory/products/price-lists/${l.id}`}
                        className="font-medium text-slate-900 hover:underline"
                      >
                        {l.name}
                      </Link>
                      <span className="ml-2 font-mono text-xs text-slate-400">{l.code}</span>
                    </td>
                    <td className="px-4 py-2.5">{ruleText(l.adjustmentPct)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {l.fixedPriceCount ?? 0}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge active={l.isActive} />
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap text-slate-500">
                      {canWrite && (
                        <>
                          <button
                            className="mr-3 inline-flex items-center gap-1 hover:text-slate-800"
                            onClick={() =>
                              setEditing({
                                id: l.id,
                                name: l.name,
                                pct: String(Number(l.adjustmentPct)),
                              })
                            }
                          >
                            <Pencil className="size-3.5" /> Edit
                          </button>
                          <button
                            className="mr-3 hover:text-slate-800"
                            disabled={busy}
                            onClick={() =>
                              void run(() => updatePriceList(l.id, { isActive: !l.isActive }))
                            }
                          >
                            {l.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                        </>
                      )}
                      <Link
                        href={`/inventory/products/price-lists/${l.id}`}
                        className="inline-flex items-center gap-0.5 font-medium text-blue-600 hover:underline"
                      >
                        Prices <ChevronRight className="size-3.5" />
                      </Link>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
