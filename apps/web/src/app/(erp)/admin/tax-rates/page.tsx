'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import {
  Check,
  ChevronRight,
  Download,
  Loader2,
  Pencil,
  Percent,
  Plus,
  Star,
  Upload,
  X,
} from 'lucide-react';
import { downloadCsv, toNum } from '@/lib/inventory';
import { createTaxRate, listAllTaxRates, updateTaxRate, type TaxRateRow } from '@/lib/settings';
import { Alert, RequirePermission, StatusBadge, btn, inputBase } from '@/components/inventory/ui';
import { SimpleImportDialog, type SimpleImportConfig } from '@/components/simple-import-dialog';

const btnAdmin =
  'inline-flex items-center gap-2 rounded-md bg-mod-admin px-3 py-2 text-sm font-medium text-white shadow-sm hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50';

export default function TaxRatesPage() {
  return (
    <RequirePermission permission="admin.settings.manage">
      <TaxRates />
    </RequirePermission>
  );
}

function validRate(v: string) {
  const n = toNum(v);
  return v.trim() !== '' && !Number.isNaN(n) && n >= 0 && n <= 100 ? n : null;
}

function TaxRates() {
  const [rates, setRates] = useState<TaxRateRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [rate, setRate] = useState('');
  const [makeDefault, setMakeDefault] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string; rate: string } | null>(null);
  const [showImport, setShowImport] = useState(false);

  const load = useCallback(() => {
    listAllTaxRates()
      .then(setRates)
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  async function run(action: () => Promise<TaxRateRow[]>, message: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setRates(await action());
      setNotice(message);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const newRate = validRate(rate);
  const importConfig: SimpleImportConfig<{ name: string; rate: number; isDefault: boolean }> = {
    title: 'Import tax rates',
    help: (
      <p>
        Columns: <b>name</b> (or nom), <b>rate</b> (or taux, in %), and optionally <b>default</b>{' '}
        (yes / oui / 1) to make one rate the company default.
      </p>
    ),
    templateName: 'tax-rates-template.csv',
    templateHeader: ['name', 'rate', 'default'],
    templateRows: [
      ['TVA 19 %', '19', 'yes'],
      ['TVA 13 %', '13', ''],
      ['TVA 7 %', '7', ''],
      ['Exonéré', '0', ''],
    ],
    parseRow: (r) => {
      const n = r.name ?? r.nom ?? r.libelle ?? '';
      const raw = r.rate ?? r.taux ?? r.tva ?? '';
      const value = validRate(raw.replace('%', ''));
      if (!n) return 'name is missing';
      if (value === null) return `rate "${raw}" must be a number between 0 and 100`;
      const d = (r.default ?? r.defaut ?? r.par_defaut ?? '').toLowerCase();
      return { name: n, rate: value, isDefault: ['yes', 'oui', '1', 'true', 'x'].includes(d) };
    },
    label: (i) => `${i.name} (${i.rate} %)`,
    save: async (i) => {
      const existing = rates?.find((r) => r.name.toLowerCase() === i.name.toLowerCase());
      if (existing) return 'skipped';
      setRates(await createTaxRate(i));
      return 'created';
    },
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <nav className="flex items-center gap-1 text-xs text-slate-500">
          <Link href="/dashboard" className="hover:text-slate-700">
            Home
          </Link>
          <ChevronRight className="size-3" />
          <span className="text-mod-admin">Administration</span>
          <ChevronRight className="size-3" />
          <span>Tax rates (VAT)</span>
        </nav>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-lg bg-mod-admin/10">
              <Percent className="size-5 text-mod-admin" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Tax rates (VAT)</h1>
              <p className="text-sm text-slate-500">
                The default rate applies to every product without its own rate.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button className={btn} onClick={() => setShowImport(true)}>
              <Upload className="size-4" /> Import
            </button>
            <button
              className={btn}
              disabled={!rates?.length}
              onClick={() =>
                downloadCsv(
                  `tax-rates-${new Date().toISOString().slice(0, 10)}.csv`,
                  ['name', 'rate', 'default', 'active', 'products'],
                  (rates ?? []).map((r) => [
                    r.name,
                    Number(r.rate),
                    r.isDefault ? 'yes' : '',
                    r.isActive ? 'yes' : 'no',
                    r.productCount,
                  ]),
                )
              }
            >
              <Download className="size-4" /> Export
            </button>
          </div>
        </div>
      </div>

      {error && <Alert>{error}</Alert>}
      {notice && <Alert kind="success">{notice}</Alert>}

      <form
        className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim() || newRate === null) return;
          const ok = await run(
            () => createTaxRate({ name: name.trim(), rate: newRate, isDefault: makeDefault }),
            `${name.trim()} added.`,
          );
          if (ok) {
            setName('');
            setRate('');
            setMakeDefault(false);
          }
        }}
      >
        <label className="min-w-48 flex-1">
          <span className="mb-1 block text-sm font-medium text-slate-700">Name</span>
          <input
            className={clsx(inputBase, 'w-full')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. TVA 19 %"
          />
        </label>
        <label className="w-32">
          <span className="mb-1 block text-sm font-medium text-slate-700">Rate (%)</span>
          <input
            className={clsx(inputBase, 'w-full', rate && newRate === null && 'border-red-400')}
            value={rate}
            inputMode="decimal"
            onChange={(e) => setRate(e.target.value)}
            placeholder="19"
          />
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={makeDefault}
            onChange={(e) => setMakeDefault(e.target.checked)}
          />
          Company default
        </label>
        <button className={btnAdmin} disabled={busy || !name.trim() || newRate === null}>
          <Plus className="size-4" /> Add rate
        </button>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white">
        {!rates ? (
          <Loader2 className="mx-auto my-12 size-6 animate-spin text-slate-400" />
        ) : rates.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <Percent className="mx-auto size-8 text-slate-300" />
            <p className="mt-3 font-medium text-slate-900">No tax rates yet</p>
            <p className="mt-1 text-sm text-slate-500">
              Add your VAT rates above, or import them from a CSV file.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5">Name</th>
                  <th className="px-4 py-2.5 text-right">Rate</th>
                  <th className="px-4 py-2.5 text-right">Products</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rates.map((r) =>
                  editing?.id === r.id ? (
                    <tr key={r.id} className="bg-slate-50">
                      <td className="px-4 py-2">
                        <input
                          className={clsx(inputBase, 'w-full py-1.5')}
                          aria-label="Name"
                          autoFocus
                          value={editing.name}
                          onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          className={clsx(inputBase, 'ml-auto block w-24 py-1.5 text-right')}
                          aria-label="Rate"
                          inputMode="decimal"
                          value={editing.rate}
                          onChange={(e) => setEditing({ ...editing, rate: e.target.value })}
                        />
                      </td>
                      <td colSpan={2} className="px-4 py-2 text-xs text-slate-500">
                        Existing invoices keep the rate they were issued with.
                      </td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        <button
                          aria-label="Save"
                          className="rounded p-1.5 text-emerald-600 hover:bg-emerald-50 disabled:opacity-40"
                          disabled={
                            busy || !editing.name.trim() || validRate(editing.rate) === null
                          }
                          onClick={async () => {
                            const ok = await run(
                              () =>
                                updateTaxRate(r.id, {
                                  name: editing.name.trim(),
                                  rate: validRate(editing.rate)!,
                                }),
                              'Tax rate updated.',
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
                    <tr key={r.id} className={clsx(!r.isActive && 'text-slate-400')}>
                      <td className="px-4 py-2.5 font-medium">
                        {r.name}
                        {r.isDefault && (
                          <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                            <Star className="size-3 fill-current" /> Default
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{Number(r.rate)} %</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{r.productCount}</td>
                      <td className="px-4 py-2.5">
                        <StatusBadge active={r.isActive} />
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap text-slate-500">
                        {!r.isDefault && r.isActive && (
                          <button
                            className="mr-3 hover:text-slate-800"
                            disabled={busy}
                            onClick={() =>
                              void run(
                                () => updateTaxRate(r.id, { isDefault: true }),
                                `${r.name} is now the default.`,
                              )
                            }
                          >
                            Set as default
                          </button>
                        )}
                        <button
                          className="mr-3 inline-flex items-center gap-1 hover:text-slate-800"
                          onClick={() =>
                            setEditing({ id: r.id, name: r.name, rate: String(Number(r.rate)) })
                          }
                        >
                          <Pencil className="size-3.5" /> Edit
                        </button>
                        {!r.isDefault && (
                          <button
                            className="hover:text-slate-800"
                            disabled={busy}
                            onClick={() =>
                              void run(
                                () => updateTaxRate(r.id, { isActive: !r.isActive }),
                                r.isActive ? `${r.name} deactivated.` : `${r.name} activated.`,
                              )
                            }
                          >
                            {r.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showImport && (
        <SimpleImportDialog
          config={importConfig}
          onClose={() => setShowImport(false)}
          onDone={load}
        />
      )}
    </div>
  );
}
