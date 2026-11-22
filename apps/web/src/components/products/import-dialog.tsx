'use client';

import { useRef, useState } from 'react';
import clsx from 'clsx';
import { CheckCircle2, Download, FileUp, XCircle } from 'lucide-react';
import type { ImportMode, ImportPreview, ImportResult } from '@erp/shared';
import { api, ApiRequestError, downloadFile } from '@/lib/api';
import { Badge, Button, ErrorBox, Modal, useToast } from '@/components/ui';

const MODES: { value: ImportMode; label: string; help: string }[] = [
  {
    value: 'create',
    label: 'Create new products',
    help: 'Rows whose SKU already exists are errors.',
  },
  {
    value: 'update',
    label: 'Update existing products',
    help: 'Matched by SKU. Empty cells keep the current value.',
  },
  {
    value: 'upsert',
    label: 'Create and update',
    help: 'New SKUs are created, existing SKUs are updated.',
  },
];

/** Steps: choose file + mode → preview (nothing saved) → import (all or nothing). */
export function ImportDialog({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<ImportMode>('create');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [onlyErrors, setOnlyErrors] = useState(true);
  const [busy, setBusy] = useState<'preview' | 'import' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setError(null);
    setBusy(null);
  };
  const close = () => {
    if (busy === 'import') return; // never close in the middle of an import
    reset();
    onClose();
  };

  const form = () => {
    const fd = new FormData();
    fd.append('file', file!);
    fd.append('mode', mode);
    return fd;
  };

  const runPreview = async (f: File | null = file) => {
    if (!f) return;
    setBusy('preview');
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', f);
      fd.append('mode', mode);
      const p = await api<ImportPreview>('/inventory/products/import/preview', {
        method: 'POST',
        body: fd,
      });
      setPreview(p);
      setOnlyErrors(p.errorRows > 0);
    } catch (e) {
      setPreview(null);
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const runImport = async () => {
    setBusy('import');
    setError(null);
    try {
      const r = await api<ImportResult>('/inventory/products/import', {
        method: 'POST',
        body: form(),
      });
      toast(`Import finished: ${r.created} created, ${r.updated} updated`);
      onImported();
      reset();
      onClose();
    } catch (e) {
      // The data may have changed since the preview (e.g. someone created the same SKU).
      const body =
        e instanceof ApiRequestError
          ? (e.body as { preview?: ImportPreview } | undefined)
          : undefined;
      if (body?.preview) setPreview(body.preview);
      setError((e as Error).message);
      setBusy(null);
    }
  };

  const rows = preview
    ? onlyErrors
      ? preview.rows.filter((r) => r.errors.length)
      : preview.rows
    : [];

  return (
    <Modal
      open={open}
      onClose={close}
      title="Import products from CSV"
      size="xl"
      footer={
        <>
          <Button onClick={close} disabled={busy === 'import'}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={runImport}
            loading={busy === 'import'}
            disabled={!preview || preview.errorRows > 0 || preview.validRows === 0 || busy !== null}
          >
            {preview && preview.errorRows === 0
              ? `Import ${preview.validRows} product${preview.validRows === 1 ? '' : 's'}`
              : 'Import'}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-3">
          <p className="text-slate-600">
            Use the template so the columns match. Commas or semicolons, UTF-8 or Excel files all
            work.
          </p>
          <Button
            size="sm"
            onClick={() =>
              downloadFile(
                '/inventory/products/import/template',
                'products_import_template.csv',
              ).catch((e: Error) => toast(e.message, 'error'))
            }
          >
            <Download className="size-3.5" /> Download template
          </Button>
        </div>

        <fieldset>
          <legend className="mb-2 font-medium text-slate-700">What should the import do?</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {MODES.map((m) => (
              <label
                key={m.value}
                className={clsx(
                  'cursor-pointer rounded-lg border p-3',
                  mode === m.value
                    ? 'border-mod-inventory bg-mod-inventory/5'
                    : 'border-slate-200 hover:border-slate-300',
                )}
              >
                <input
                  type="radio"
                  name="mode"
                  value={m.value}
                  checked={mode === m.value}
                  className="sr-only"
                  onChange={() => {
                    setMode(m.value);
                    setPreview(null);
                  }}
                />
                <span className="block font-medium text-slate-800">{m.label}</span>
                <span className="text-xs text-slate-500">{m.help}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv,text/plain"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              e.target.value = '';
              setFile(f);
              setPreview(null);
              if (f) void runPreview(f);
            }}
          />
          <Button onClick={() => fileInput.current?.click()} loading={busy === 'preview'}>
            <FileUp className="size-4" /> {file ? 'Choose another file' : 'Choose CSV file'}
          </Button>
          {file && (
            <span className="text-slate-600">
              {file.name} · {(file.size / 1024).toFixed(1)} KB
            </span>
          )}
          {file && !preview && busy === null && (
            <Button variant="ghost" onClick={() => runPreview()}>
              Check file
            </Button>
          )}
        </div>

        {error && <ErrorBox message={error} />}

        {preview && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge tone="slate">{preview.totalRows} rows</Badge>
              <Badge tone="green">{preview.toCreate} to create</Badge>
              <Badge tone="blue">{preview.toUpdate} to update</Badge>
              {preview.errorRows > 0 && <Badge tone="red">{preview.errorRows} with errors</Badge>}
            </div>
            {preview.errorRows > 0 ? (
              <p className="flex items-start gap-2 rounded-md bg-red-50 p-3 text-red-700">
                <XCircle className="mt-0.5 size-4 shrink-0" />
                Fix the rows below in your file, then choose it again. Nothing is imported while
                there are errors, so you never end up with half a file.
              </p>
            ) : (
              <p className="flex items-start gap-2 rounded-md bg-emerald-50 p-3 text-emerald-700">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                The file is valid. Nothing has been saved yet — click Import to save all rows.
              </p>
            )}
            <label className="flex items-center gap-2 text-slate-600">
              <input
                type="checkbox"
                checked={onlyErrors}
                onChange={(e) => setOnlyErrors(e.target.checked)}
              />
              Show only rows with errors
            </label>
            <div className="max-h-72 overflow-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Line</th>
                    <th className="px-3 py-2 font-medium">SKU</th>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Action</th>
                    <th className="px-3 py-2 font-medium">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={r.line} className={r.errors.length ? 'bg-red-50/40' : ''}>
                      <td className="px-3 py-1.5 tabular-nums">{r.line}</td>
                      <td className="px-3 py-1.5 font-mono">
                        {r.sku || <span className="text-slate-400">auto</span>}
                      </td>
                      <td className="px-3 py-1.5">{r.name}</td>
                      <td className="px-3 py-1.5">{r.action}</td>
                      <td className="px-3 py-1.5">
                        {r.errors.length ? (
                          <ul className="list-disc pl-4 text-red-700">
                            {r.errors.map((e, i) => (
                              <li key={i}>{e}</li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-emerald-700">OK</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-4 text-center text-slate-400">
                        No rows to show
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
