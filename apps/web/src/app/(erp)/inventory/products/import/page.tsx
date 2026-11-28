'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { CheckCircle2, Download, FileUp, Loader2, Upload } from 'lucide-react';
import { PRODUCT_CSV_COLUMNS, type ImportReport, type ImportRowAction } from '@erp/shared';
import { api, apiDownload } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Breadcrumbs, ErrorBox, btnPrimary, btnSecondary } from '@/components/products/ui';

import { tr } from '@/lib/i18n';
const MAX_MB = 10;

const ACTION_STYLE: Record<ImportRowAction, { label: string; className: string }> = {
  create: { label: tr("New"), className: 'bg-emerald-50 text-emerald-700' },
  update: { label: tr("Update"), className: 'bg-blue-50 text-blue-700' },
  unchanged: { label: tr("No change"), className: 'bg-slate-100 text-slate-500' },
  error: { label: tr("Error"), className: 'bg-red-50 text-red-700' },
};

const FIELD_LABELS: Record<string, string> = {
  salePrice: 'Sale price',
  minStock: 'Minimum stock',
  categoryId: 'Category',
  baseUnitId: 'Base unit',
  taxRateId: 'Tax rate',
  isActive: 'Active',
};


export default function ImportProductsPage() {
  const { can } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'preview' | 'import' | null>(null);
  const [onlyProblems, setOnlyProblems] = useState(false);

  async function send(f: File, dryRun: boolean) {
    setError(null);
    setBusy(dryRun ? 'preview' : 'import');
    try {
      const body = new FormData();
      body.append('file', f);
      setReport(
        await api<ImportReport>(`/inventory/products/import?dryRun=${dryRun}`, {
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

  function downloadTemplate() {
    void apiDownload('/inventory/products/import-template', 'products-template.xlsx').catch((e: Error) => setError(e.message));
  }


  if (!can('inventory.product.write')) {
    return (
      <div className="mx-auto max-w-3xl">
        <ErrorBox message={tr("You need the inventory.product.write permission to import products.")} />
      </div>
    );
  }

  const toWrite = report ? report.totals.create + report.totals.update : 0;
  const rows = report?.rows.filter((r) => !onlyProblems || r.action === 'error') ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Breadcrumbs
          trail={[{ label: tr("Products"), href: '/inventory/products' }, { label: tr("Import") }]}
        />
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">{tr("Import products")}</h1>
        <p className="text-sm text-slate-500">
          {tr("Create or update many products at once from an Excel file (.xlsx).")}</p>
      </div>

      {/* Step 1: choose a file */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          choose(e.dataTransfer.files[0]);
        }}
        className="flex flex-col items-center rounded-xl border-2 border-dashed border-slate-300 bg-white px-6 py-10 text-center"
      >
        <FileUp className="size-8 text-slate-400" />
        <p className="mt-3 text-sm text-slate-700">
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
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button onClick={() => inputRef.current?.click()} className={btnPrimary}>
            <Upload className="size-4" /> {file ? tr("Choose another file") : tr("Choose a file")}
          </button>
          <button onClick={downloadTemplate} className={btnSecondary}>
            <Download className="size-4" /> {' '}{tr("Download template")}</button>
        </div>
      </div>

      <details className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        <summary className="cursor-pointer font-medium text-slate-800">
          {tr("How the import works")}</summary>
        <ul className="mt-3 list-disc space-y-1 ps-5">
          <li>
            {tr("Columns:")}{' '}<code className="text-xs">{PRODUCT_CSV_COLUMNS.join(', ')}</code>{tr(". Only")}{' '}
            <code className="text-xs">sku</code> {' '}{tr("is required; leave out a column to keep its current values.")}</li>
          <li>
            {tr("Products are matched by SKU. An unknown SKU creates a product, which needs a name, a base unit and a sale price.")}</li>
          <li>
            {tr("An empty cell clears the barcode, description, category or tax rate. An empty price or minimum stock keeps the current value.")}</li>
          <li>
            {tr("Categories are written as a path, e.g.")}{' '}<code className="text-xs">{tr("Food › Oils")}</code> {' '}{tr("(or")}{' '}
            <code className="text-xs">{tr("Food > Oils")}</code>{tr("), and must already exist.")}</li>
          <li>
            {tr("Files saved by Excel with")}{' '}<code className="text-xs">;</code> {' '}{tr("separators and decimal commas (12,50) are understood.")}</li>
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
              {tr('Import finished: {created} created, {updated} updated.', { created: report.totals.create, updated: report.totals.update })}
              {report.totals.error > 0 && ' ' + tr('{n} skipped because of errors.', { n: report.totals.error })}
              <Link href="/inventory/products" className="ms-auto font-medium hover:underline">
                {tr("Back to products")}</Link>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(['create', 'update', 'unchanged', 'error'] as const).map((a) => (
              <div key={a} className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-sm text-slate-500">
                  {report.dryRun
                    ? {
                        create: tr('Will be created'),
                        update: tr('Will be updated'),
                        unchanged: tr('No change'),
                        error: tr('With errors'),
                      }[a]
                    : {
                        create: tr('Created'),
                        update: tr('Updated'),
                        unchanged: tr('No change'),
                        error: tr('Skipped'),
                      }[a]}
                </p>
                <p
                  className={clsx(
                    'mt-1 text-2xl font-semibold',
                    a === 'error' && report.totals.error > 0 ? 'text-red-600' : 'text-slate-900',
                  )}
                >
                  {report.totals[a]}
                </p>
              </div>
            ))}
          </div>

          {report.dryRun && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-sm text-slate-600">
                {toWrite === 0
                  ? tr("Nothing to import: fix the errors in the file and choose it again.")
                  : tr('Ready to save {n} product(s).', { n: toWrite }) +
                    (report.totals.error
                      ? ' ' + tr('{n} row(s) with errors will be skipped.', { n: report.totals.error })
                      : '')}
              </p>
              <button
                onClick={() => file && send(file, false)}
                disabled={!file || toWrite === 0 || busy !== null}
                className={btnPrimary}
              >
                {busy === 'import' ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-4" />
                )}
                {tr("Import")}{' '}{toWrite} {' '}{tr("product")}{toWrite === 1 ? '' : 's'}
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
            <div className="max-h-[32rem] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-start text-xs font-medium text-slate-500 uppercase">
                  <tr>
                    <th className="w-16 px-4 py-2">{tr("Line")}</th>
                    <th className="px-4 py-2">SKU</th>
                    <th className="px-4 py-2">{tr("Result")}</th>
                    <th className="px-4 py-2">{tr("Details")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={r.line} className="align-top">
                      <td className="px-4 py-2 text-slate-500 tabular-nums">{r.line}</td>
                      <td className="px-4 py-2 font-mono text-xs">{r.sku || '—'}</td>
                      <td className="px-4 py-2">
                        <span
                          className={clsx(
                            'rounded-full px-2 py-0.5 text-xs font-medium',
                            ACTION_STYLE[r.action].className,
                          )}
                        >
                          {ACTION_STYLE[r.action].label}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-slate-600">
                        {r.action === 'error' ? (
                          <ul className="space-y-0.5 text-red-700">
                            {r.errors.map((e) => (
                              <li key={e}>{e}</li>
                            ))}
                          </ul>
                        ) : r.changes.length ? (
                          tr('Changes:') + ' ' + r.changes.map((c) => tr(FIELD_LABELS[c] ?? c)).join('، ')
                        ) : (
                          '—'
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
