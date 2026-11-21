'use client';

import { useRef, useState } from 'react';
import { CheckCircle2, Download, FileUp, Loader2, X } from 'lucide-react';
import { downloadCsv, normHeader, parseCsvText } from '@/lib/inventory';

export type RowResult = 'created' | 'skipped';

export interface SimpleImportConfig<T> {
  title: string;
  /** Shown above the file picker */
  help: React.ReactNode;
  templateName: string;
  templateHeader: string[];
  templateRows: string[][];
  /** Turns one CSV row (header → value, headers normalised) into an item or an error message. */
  parseRow: (row: Record<string, string>) => T | string;
  /** Short label of an item for the preview */
  label: (item: T) => string;
  /** Saves one item; returns 'skipped' when it already exists. Throws on errors. */
  save: (item: T) => Promise<RowResult>;
}

/**
 * Import for small reference lists (tax rates, categories, units).
 * Step 1 checks the file in the browser, step 2 saves the rows one by one;
 * rows that already exist are skipped, never overwritten.
 */
export function SimpleImportDialog<T>({
  config,
  onClose,
  onDone,
}: {
  config: SimpleImportConfig<T>;
  onClose: () => void;
  onDone: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [items, setItems] = useState<T[] | null>(null);
  const [errors, setErrors] = useState<{ line: number; message: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    created: number;
    skipped: number;
    failed: string[];
  } | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setResult(null);
    setFileName(file.name);
    const rows = parseCsvText(await file.text());
    const header = (rows[0] ?? []).map(normHeader);
    const parsed: T[] = [];
    const errs: { line: number; message: string }[] = [];
    rows.slice(1).forEach((cells, i) => {
      const rec: Record<string, string> = {};
      header.forEach((h, j) => (rec[h] = (cells[j] ?? '').trim()));
      const r = config.parseRow(rec);
      if (typeof r === 'string') errs.push({ line: i + 2, message: r });
      else parsed.push(r);
    });
    if (rows.length < 2) errs.push({ line: 1, message: 'The file has no data rows' });
    setItems(parsed);
    setErrors(errs);
  }

  async function run() {
    if (!items) return;
    setBusy(true);
    let created = 0;
    let skipped = 0;
    const failed: string[] = [];
    // Sequential on purpose: later rows may depend on earlier ones (e.g. a parent category).
    for (const item of items) {
      try {
        if ((await config.save(item)) === 'created') created++;
        else skipped++;
      } catch (e) {
        failed.push(`${config.label(item)}: ${(e as Error).message}`);
      }
    }
    setResult({ created, skipped, failed });
    setBusy(false);
    onDone();
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal
    >
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="font-semibold text-slate-900">{config.title}</h2>
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
            {config.help}
            <p className="mt-2">Rows that already exist are skipped, never overwritten.</p>
            <button
              type="button"
              className="mt-2 inline-flex items-center gap-1 font-medium text-blue-600 hover:underline"
              onClick={() =>
                downloadCsv(config.templateName, config.templateHeader, config.templateRows)
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
            className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-4 py-6 text-slate-500 hover:border-slate-400 hover:text-slate-700"
          >
            <FileUp className="size-6" />
            {fileName ? `${fileName} — choose another file` : 'Choose a CSV file'}
          </button>

          {errors.length > 0 && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700">
              <p className="font-medium">{errors.length} line(s) have errors — fix the file:</p>
              <ul className="mt-1 max-h-40 list-disc overflow-y-auto pl-5 text-xs">
                {errors.map((e, i) => (
                  <li key={i}>
                    line {e.line}: {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {items && errors.length === 0 && !result && (
            <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
              {items.length} row(s) ready: {items.slice(0, 5).map(config.label).join(', ')}
              {items.length > 5 ? '…' : ''}
            </p>
          )}

          {result && (
            <div className="space-y-2">
              <p className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700">
                <CheckCircle2 className="size-4" /> {result.created} created, {result.skipped}{' '}
                skipped (already there)
                {result.failed.length > 0 ? `, ${result.failed.length} failed` : ''}.
              </p>
              {result.failed.length > 0 && (
                <ul className="list-disc rounded-md border border-red-200 bg-red-50 py-2 pr-3 pl-8 text-xs text-red-700">
                  {result.failed.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button
            className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={onClose}
          >
            {result ? 'Close' : 'Cancel'}
          </button>
          {items && items.length > 0 && errors.length === 0 && !result && (
            <button
              className="inline-flex items-center gap-2 rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
              disabled={busy}
              onClick={() => void run()}
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              Import {items.length} row(s)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
