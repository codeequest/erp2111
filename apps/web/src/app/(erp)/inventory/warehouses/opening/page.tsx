'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { CheckCircle2, Download, FileUp, Loader2, Upload } from 'lucide-react';
import {
  OPENING_CSV_COLUMNS,
  type OpeningImportReport,
  type WarehouseRow,
} from '@erp/shared';
import { api, apiDownload } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatMoney, formatQty } from '@/lib/format';
import { Breadcrumbs, ErrorBox, btnPrimary, btnSecondary, inputClass } from '@/components/products/ui';

import { tr } from '@/lib/i18n';
const MAX_MB = 10;


export default function OpeningStockPage() {
  const { can } = useAuth();
  const canSeeCost = can('inventory.cost.view');
  const inputRef = useRef<HTMLInputElement>(null);
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<OpeningImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'preview' | 'import' | null>(null);
  const [onlyProblems, setOnlyProblems] = useState(false);

  useEffect(() => {
    api<WarehouseRow[]>('/inventory/warehouses')
      .then((rows) => {
        setWarehouses(rows);
        setWarehouseId((current) => current || (rows.find((w) => w.code === 'MAIN') ?? rows[0])?.id || '');
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  async function send(f: File, dryRun: boolean, whId = warehouseId) {
    setError(null);
    setBusy(dryRun ? 'preview' : 'import');
    try {
      const body = new FormData();
      body.append('file', f);
      const query = new URLSearchParams({ dryRun: String(dryRun) });
      if (whId) query.set('warehouseId', whId);
      setReport(
        await api<OpeningImportReport>(`/inventory/stock/opening-balances?${query}`, {
          method: 'POST',
          body,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function choose(f: File | undefined) {
    if (!f) return;
    setReport(null);
    if (f.size > MAX_MB * 1024 * 1024) {
      setFile(null);
      setError(tr('The file is larger than {n} MB', { n: MAX_MB }));
      return;
    }
    setFile(f);
    void send(f, true);
  }

  function changeWarehouse(id: string) {
    setWarehouseId(id);
    // The default warehouse changes the result: check the file again.
    if (file && (!report || report.dryRun)) void send(file, true, id);
  }

  function downloadTemplate() {
    void apiDownload('/inventory/stock/opening-balances/template', 'opening-stock-template.xlsx').catch((e: Error) => setError(e.message));
  }


  if (!can('inventory.stock.adjust')) {
    return (
      <div className="mx-auto max-w-3xl">
        <ErrorBox message={tr("You need the inventory.stock.adjust permission to import opening stock.")} />
      </div>
    );
  }

  const rows = report?.rows.filter((r) => !onlyProblems || r.errors.length) ?? [];
  const ok = report?.totals.ok ?? 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Breadcrumbs
          trail={[{ label: tr("Warehouses"), href: '/inventory/warehouses' }, { label: tr("Opening stock") }]}
        />
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">{tr("Import opening stock")}</h1>
        <p className="text-sm text-slate-500">
          {tr("Enter the stock already on the shelves when you start using the ERP, from an Excel file (.xlsx).")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
        <label className="rounded-xl border border-slate-200 bg-white p-4">
          <span className="mb-1 block text-sm font-medium text-slate-700">{tr("Default warehouse")}</span>
          <select
            value={warehouseId}
            onChange={(e) => changeWarehouse(e.target.value)}
            className={inputClass}
          >
            <option value="">{tr("None — every row gives its warehouse")}</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code} — {w.name}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-slate-500">
            {tr("Used for rows whose")}{' '}<code>warehouse</code> {' '}{tr("cell is empty.")}</span>
        </label>

        {/* Step 1: choose a file */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            choose(e.dataTransfer.files[0]);
          }}
          className="flex flex-col items-center rounded-xl border-2 border-dashed border-slate-300 bg-white px-6 py-6 text-center"
        >
          <FileUp className="size-7 text-slate-400" />
          <p className="mt-2 text-sm text-slate-700">
            {file ? (
              <>
                <span className="font-medium">{file.name}</span> ({Math.ceil(file.size / 1024)} {' '}{tr("KB)")}</>
            ) : (
              'Drop an Excel file here, or'
            )}
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="hidden"
            onChange={(e) => {
              choose(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <button onClick={() => inputRef.current?.click()} className={btnPrimary}>
              <Upload className="size-4" /> {file ? tr("Choose another file") : tr("Choose a file")}
            </button>
            <button onClick={downloadTemplate} className={btnSecondary}>
              <Download className="size-4" /> {' '}{tr("Download template")}</button>
          </div>
        </div>
      </div>

      <details className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        <summary className="cursor-pointer font-medium text-slate-800">{tr("How the import works")}</summary>
        <ul className="mt-3 list-disc space-y-1 ps-5">
          <li>
            {tr("Columns:")}{' '}<code className="text-xs">{OPENING_CSV_COLUMNS.join(', ')}</code>.{' '}
            <code className="text-xs">sku</code> {' '}{tr("and")}{' '}<code className="text-xs">quantity</code> {' '}{tr("are required.")}</li>
          <li>
            <code className="text-xs">warehouse</code> {' '}{tr("is the warehouse code (e.g. MAIN). Empty = the default warehouse chosen above.")}</li>
          <li>{tr("Quantities are in the product's base unit (e.g. pieces, not cartons).")}</li>
          <li>
            <code className="text-xs">unit_cost</code> {' '}{tr("is the cost of one base unit. Empty = the product's current average cost.")}{!canSeeCost && ' ' + tr('You need the inventory.cost.view permission to set costs.')}
          </li>
          <li>
            {tr("Opening stock is entered")}{' '}<strong>{tr("once")}</strong> {' '}{tr("per product and warehouse. A product that already has stock history in a warehouse is refused there: use a stock adjustment instead.")}</li>
          <li>{tr("Nothing is saved until you confirm. Rows with errors are skipped.")}</li>
        </ul>
      </details>

      {error && <ErrorBox message={error} />}
      {busy === 'preview' && (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="size-4 animate-spin" /> {' '}{tr("Checking the file…")}</p>
      )}

      {/* Step 2: preview, step 3: confirm */}
      {report && (
        <div className="space-y-4">
          {!report.dryRun && (
            <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <CheckCircle2 className="size-4" />
              {tr('Opening stock saved for {n} line(s) (reference {ref}).', { n: report.totals.ok, ref: report.reference ?? '' })}
              {report.totals.error > 0 && ' ' + tr('{n} skipped because of errors.', { n: report.totals.error })}
              <Link href="/inventory/warehouses" className="ms-auto font-medium hover:underline">
                {tr("Back to warehouses")}</Link>
            </div>
          )}

          <div className={clsx('grid gap-3', canSeeCost ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-sm text-slate-500">{report.dryRun ? tr("Ready to import") : tr("Imported")}</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{report.totals.ok}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-sm text-slate-500">{report.dryRun ? tr("With errors") : tr("Skipped")}</p>
              <p
                className={clsx(
                  'mt-1 text-2xl font-semibold',
                  report.totals.error ? 'text-red-600' : 'text-slate-900',
                )}
              >
                {report.totals.error}
              </p>
            </div>
            {canSeeCost && (
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-sm text-slate-500">{tr("Stock value")}</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">
                  {formatMoney(report.totalValue)}
                </p>
              </div>
            )}
          </div>

          {report.dryRun && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-sm text-slate-600">
                {ok === 0
                  ? tr("Nothing to import: fix the errors in the file and choose it again.")
                  : tr('Ready to save opening stock for {n} line(s).', { n: ok }) +
                    (report.totals.error
                      ? ' ' + tr('{n} row(s) with errors will be skipped.', { n: report.totals.error })
                      : '')}
              </p>
              <button
                onClick={() => file && send(file, false)}
                disabled={!file || ok === 0 || busy !== null}
                className={btnPrimary}
              >
                {busy === 'import' ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-4" />
                )}
                {tr("Import")}{' '}{ok} {' '}{tr("line")}{ok === 1 ? '' : 's'}
              </button>
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2 text-sm">
              <span className="font-medium text-slate-800">{tr("Rows")}</span>
              <label className="flex items-center gap-2 text-slate-600">
                <input
                  type="checkbox"
                  checked={onlyProblems}
                  onChange={(e) => setOnlyProblems(e.target.checked)}
                />
                {tr("Only rows with errors")}</label>
            </div>
            <div className="max-h-[32rem] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-start text-xs font-medium text-slate-500 uppercase">
                  <tr>
                    <th className="w-16 px-4 py-2">{tr("Line")}</th>
                    <th className="px-4 py-2">SKU</th>
                    <th className="px-4 py-2">{tr("Warehouse")}</th>
                    <th className="px-4 py-2 text-end">{tr("Quantity")}</th>
                    {canSeeCost && <th className="px-4 py-2 text-end">{tr("Unit cost")}</th>}
                    <th className="px-4 py-2">{tr("Result")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={r.line} className="align-top">
                      <td className="px-4 py-2 text-slate-500 tabular-nums">{r.line}</td>
                      <td className="px-4 py-2 font-mono text-xs">{r.sku || '—'}</td>
                      <td className="px-4 py-2 font-mono text-xs">{r.warehouse || '—'}</td>
                      <td className="px-4 py-2 text-end tabular-nums">
                        {r.quantity ? formatQty(r.quantity) : '—'}
                      </td>
                      {canSeeCost && (
                        <td className="px-4 py-2 text-end tabular-nums">
                          {formatMoney(r.unitCost)}
                        </td>
                      )}
                      <td className="px-4 py-2">
                        {r.errors.length ? (
                          <ul className="space-y-0.5 text-red-700">
                            {r.errors.map((e) => (
                              <li key={e}>{e}</li>
                            ))}
                          </ul>
                        ) : (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            {report.dryRun ? 'OK' : tr("Imported")}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length === 0 && (
                <p className="px-4 py-8 text-center text-sm text-slate-500">{tr("No rows with errors.")}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
