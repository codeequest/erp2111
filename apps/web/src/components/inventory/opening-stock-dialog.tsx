'use client';

import { useRef, useState } from 'react';
import { CheckCircle2, Download, FileUp, Loader2, X } from 'lucide-react';
import {
  downloadCsv,
  fmtMoney,
  fmtQty,
  openingBalances,
  type OpeningReport,
} from '@/lib/inventory';
import { Alert, btn, btnPrimary } from './ui';

/**
 * Go-live import of starting stock: quantity and purchase cost per product and warehouse.
 * Step 1 checks the file, step 2 saves it. Nothing is saved if any line has an error.
 */
export function OpeningStockDialog({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [report, setReport] = useState<OpeningReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(text: string, dryRun: boolean) {
    setBusy(true);
    setError(null);
    try {
      const r = await openingBalances({ csv: text, dryRun });
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
          <h2 className="font-semibold text-slate-900">Import opening stock</h2>
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
              Use this once, when you start using the ERP, to load the stock you already have.
              Columns: <b>sku</b>, <b>quantity</b> (in the base unit), <b>unit_cost</b> (purchase
              cost per base unit) and optionally <b>warehouse</b> (code, default MAIN). For
              lot-tracked products also <b>lot_number</b> (required) and <b>expiry_date</b>{' '}
              (YYYY-MM-DD or DD/MM/YYYY) — one line per lot.
            </p>
            <p className="mt-2">
              A product can get an opening balance in a warehouse only once, before any other stock
              movement there. Later corrections are stock adjustments.
            </p>
            <button
              type="button"
              className="mt-2 inline-flex items-center gap-1 font-medium text-blue-600 hover:underline"
              onClick={() =>
                downloadCsv(
                  'opening-stock-template.csv',
                  ['sku', 'warehouse', 'quantity', 'unit_cost', 'lot_number', 'expiry_date'],
                  [
                    ['COCA-33CL', 'MAIN', '240', '0.80', '', ''],
                    ['YOGURT-125', 'MAIN', '60', '0.55', 'L2026-118', '2027-01-15'],
                  ],
                )
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
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              setReport(null);
              setFileName(file.name);
              const text = await file.text();
              setCsv(text);
              await run(text, true);
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-4 py-8 text-slate-500 hover:border-mod-inventory hover:text-mod-inventory"
          >
            <FileUp className="size-7" />
            {fileName ? `${fileName} — choose another file` : 'Choose a CSV file'}
          </button>

          {busy && (
            <p className="flex items-center gap-2 text-slate-500">
              <Loader2 className="size-4 animate-spin" /> Working…
            </p>
          )}
          {error && <Alert>{error}</Alert>}

          {report &&
            !busy &&
            (report.saved ? (
              <Alert kind="success">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="size-4" /> Stock loaded: {report.totalRows} line(s),{' '}
                  {fmtQty(report.totalQuantity)} units, value {fmtMoney(report.totalValue)}.
                </span>
              </Alert>
            ) : report.errors.length > 0 ? (
              <>
                <Alert>
                  {report.errors.length} error(s). Fix the file and choose it again — nothing was
                  saved.
                </Alert>
                <ul className="max-h-60 overflow-y-auto rounded-md border border-slate-200 text-xs">
                  {report.errors.map((e, i) => (
                    <li
                      key={i}
                      className="flex gap-3 border-b border-slate-100 px-3 py-1.5 last:border-0"
                    >
                      <span className="w-14 shrink-0 font-mono text-slate-400">line {e.line}</span>
                      <span className="text-red-700">{e.message}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
                File checked: <b>{report.totalRows}</b> line(s),{' '}
                <b>{fmtQty(report.totalQuantity)}</b> units, stock value{' '}
                <b>{fmtMoney(report.totalValue)}</b>.
              </div>
            ))}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button className={btn} onClick={onClose}>
            {report?.saved ? 'Close' : 'Cancel'}
          </button>
          {report && !report.saved && report.errors.length === 0 && csv && (
            <button className={btnPrimary} disabled={busy} onClick={() => void run(csv, false)}>
              Load the stock
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
