'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, Loader2, Plus, Upload } from 'lucide-react';
import { SimpleImportDialog, type SimpleImportConfig } from '@/components/simple-import-dialog';
import { useAuth } from '@/lib/auth';
import { createUnit, downloadCsv, listUnits, type Unit } from '@/lib/inventory';
import {
  Alert,
  PageHeader,
  ProductTabs,
  RequirePermission,
  btn,
  btnPrimary,
  input,
} from '@/components/inventory/ui';

export default function UnitsPage() {
  return (
    <RequirePermission permission="inventory.product.read">
      <Units />
    </RequirePermission>
  );
}

function Units() {
  const { can } = useAuth();
  const canWrite = can('inventory.product.write');
  const [units, setUnits] = useState<Unit[] | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    listUnits()
      .then(setUnits)
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const [showImport, setShowImport] = useState(false);
  const importConfig: SimpleImportConfig<{ code: string; name: string }> = {
    title: 'Import units',
    help: (
      <p>
        Columns: <b>code</b> (1–10 letters or digits, e.g. CTN) and <b>name</b> (or nom).
      </p>
    ),
    templateName: 'units-template.csv',
    templateHeader: ['code', 'name'],
    templateRows: [
      ['CTN', 'Carton'],
      ['KG', 'Kilogram'],
      ['L', 'Litre'],
    ],
    parseRow: (r) => {
      const code = (r.code ?? '').toUpperCase();
      const n = r.name ?? r.nom ?? '';
      if (!/^[A-Z0-9_]{1,10}$/.test(code))
        return `code "${r.code ?? ''}" must be 1–10 letters or digits`;
      if (!n) return 'name is missing';
      return { code, name: n };
    },
    label: (i) => i.code,
    save: async (i) => {
      if ((await listUnits()).some((u) => u.code === i.code)) return 'skipped';
      await createUnit(i.code, i.name);
      return 'created';
    },
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createUnit(code.trim().toUpperCase(), name.trim());
      setCode('');
      setName('');
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Units of measure"
        subtitle="Piece, carton, kilogram…"
        crumbs={[{ label: 'Units' }]}
        actions={
          <>
            {canWrite && (
              <button className={btn} onClick={() => setShowImport(true)}>
                <Upload className="size-4" /> Import
              </button>
            )}
            <button
              className={btn}
              disabled={!units?.length}
              onClick={() =>
                downloadCsv(
                  `units-${new Date().toISOString().slice(0, 10)}.csv`,
                  ['code', 'name', 'base_unit_of', 'packaging_of'],
                  (units ?? []).map((u) => [
                    u.code,
                    u.name,
                    u._count?.baseProducts ?? 0,
                    u._count?.productUnits ?? 0,
                  ]),
                )
              }
            >
              <Download className="size-4" /> Export
            </button>
          </>
        }
      />
      <ProductTabs />

      {error && <Alert>{error}</Alert>}

      {canWrite && (
        <form
          onSubmit={submit}
          className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4"
        >
          <label className="w-32">
            <span className="mb-1 block text-sm font-medium text-slate-700">Code</span>
            <input
              className={`${input} uppercase`}
              value={code}
              maxLength={10}
              onChange={(e) => setCode(e.target.value)}
              placeholder="CTN"
            />
          </label>
          <label className="min-w-48 flex-1">
            <span className="mb-1 block text-sm font-medium text-slate-700">Name</span>
            <input
              className={input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Carton"
            />
          </label>
          <button className={btnPrimary} disabled={saving || !code.trim() || !name.trim()}>
            <Plus className="size-4" /> Add unit
          </button>
        </form>
      )}

      <div className="rounded-xl border border-slate-200 bg-white">
        {!units ? (
          <Loader2 className="mx-auto my-12 size-6 animate-spin text-slate-400" />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-2.5">Code</th>
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5 text-right">Base unit of</th>
                <th className="px-4 py-2.5 text-right">Packaging of</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {units.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-2.5 font-mono font-medium">{u.code}</td>
                  <td className="px-4 py-2.5">{u.name}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {u._count?.baseProducts ?? 0} products
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {u._count?.productUnits ?? 0} products
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
