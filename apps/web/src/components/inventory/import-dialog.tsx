'use client';

import { useRef, useState } from 'react';
import { CheckCircle2, Download, FileUp, Loader2, X } from 'lucide-react';
import { downloadCsv, importProducts, type ImportReport } from '@/lib/inventory';
import { Alert, btn, btnPrimary } from './ui';

const TEMPLATE_HEADER = [
  'sku',
  'name',
  'barcode',
  'category',
  'unit',
  'purchase_price',
  'sale_price',
  'min_stock',
  'description',
];

/** Two steps: check the file (dry run), then import it. Nothing is saved if any row has an error. */
export function ImportDialog({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setReport(null);
    setError(null);
    if (file.size > 5_000_000) {
      setError('The file is larger than 5 MB.');
      return;
    }
    setFileName(file.name);
    const text = await file.text();
    setCsv(text);
    await run(text, true);
  }

  async function run(text: string, dryRun: boolean) {
    setBusy(true);
    setError(null);
    try {
      const r = await importProducts(text, dryRun);
      setReport(r);
      if (r.saved) onImported();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="font-semibold text-slate-900">Import products from CSV</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-slate-400 hover:bg-slate-100"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-4 p-5 text-sm">
          <div className="text-slate-600">
            <p>
              One product per line. Required columns: <b>sku</b> and <b>name</b>. Optional: barcode,
              category, unit (code, default PCS), purchase_price, sale_price, min_stock,
              description. Comma or semicolon separated; French headers (référence, désignation,
              prix…) also work.
            </p>
            <p className="mt-2">
              Existing SKUs are <b>updated</b>, new ones <b>created</b>. Unknown categories are
              created. Nothing is saved if any line has an error.
            </p>
            <button
              type="button"
              className="mt-2 inline-flex items-center gap-1 font-medium text-blue-600 hover:underline"
              onClick={() =>
                downloadCsv('products-template.csv', TEMPLATE_HEADER, [
                  [
                    'COCA-33CL',
                    'Coca-Cola 33cl',
                    '5449000000996',
                    'Beverages',
                    'PCS',
                    '0.80',
                    '1.50',
                    '48',
                    '',
                  ],
                ])
              }
            >
              <Download className="size-4" /> Download a template
            </button>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              void pick(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-4 py-8 text-slate-500 hover:border-mod-inventory hover:text-mod-inventory"
          >
            <FileUp className="size-7" />
            {fileName ? (
              <span className="font-medium">{fileName} — choose another file</span>
            ) : (
              'Choose a CSV file'
            )}
          </button>

          {busy && (
            <p className="flex items-center gap-2 text-slate-500">
              <Loader2 className="size-4 animate-spin" /> Working…
            </p>
          )}
          {error && <Alert>{error}</Alert>}

          {report && !busy && (
            <div className="space-y-3">
              {report.saved ? (
                <Alert kind="success">
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="size-4" /> Imported: {report.created} created,{' '}
                    {report.updated} updated.
                  </span>
                </Alert>
              ) : report.errors.length > 0 ? (
                <>
                  <Alert>
                    {report.errors.length} error(s) in {report.totalRows} line(s). Fix the file and
                    choose it again — nothing was saved.
                  </Alert>
                  <ul className="max-h-60 overflow-y-auto rounded-md border border-slate-200 text-xs">
                    {report.errors.map((e, i) => (
                      <li
                        key={i}
                        className="flex gap-3 border-b border-slate-100 px-3 py-1.5 last:border-0"
                      >
                        <span className="w-14 shrink-0 font-mono text-slate-400">
                          line {e.line}
                        </span>
                        <span className="text-red-700">{e.message}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
                  File checked: <b>{report.created}</b> product(s) to create,{' '}
                  <b>{report.updated}</b> to update.
                  {report.newCategories.length > 0 && (
                    <> New categories: {report.newCategories.join(', ')}.</>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button className={btn} onClick={onClose}>
            {report?.saved ? 'Close' : 'Cancel'}
          </button>
          {report && !report.saved && report.errors.length === 0 && csv && (
            <button className={btnPrimary} disabled={busy} onClick={() => void run(csv, false)}>
              Import {report.totalRows} product(s)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
