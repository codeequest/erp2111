'use client';

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { AlertCircle, Check, Hash, Info, Loader2, X } from 'lucide-react';
import {
  SEQUENCE_PREFIX,
  formatSequenceValue,
  nextNumberProblem,
  type SequenceSetting,
} from '@erp/shared';
import { ApiRequestError } from '@/lib/api';
import { settingsApi } from '@/lib/settings';

/** Edits one numbering sequence (prefix, digits, next number) with a live preview. */
export function SequenceDialog({
  sequence,
  onClose,
  onSaved,
}: {
  sequence: SequenceSetting;
  onClose: () => void;
  onSaved: (s: SequenceSetting) => void;
}) {
  const isProduct = sequence.type === 'PRODUCT';
  const [prefix, setPrefix] = useState(sequence.prefix);
  const [padding, setPadding] = useState(sequence.padding);
  const [nextNumber, setNextNumber] = useState(String(sequence.nextNumber));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !saving && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const n = Number(nextNumber);
  const prefixError = !SEQUENCE_PREFIX.test(prefix)
    ? 'Letters, digits and . _ - / only (max 20)'
    : !isProduct && prefix === ''
      ? 'Documents need a prefix, e.g. INV or PO'
      : null;
  const numberError = nextNumberProblem(sequence.type, sequence.nextNumber, n);
  const valid = !prefixError && !numberError;
  const changed =
    prefix !== sequence.prefix || padding !== sequence.padding || n !== sequence.nextNumber;
  const preview = (k: number) => formatSequenceValue({ prefix, padding, year: sequence.year }, k);

  async function save() {
    if (!valid || !changed) return;
    setSaving(true);
    setError(null);
    try {
      const result = await settingsApi.updateSequence(sequence.id, {
        prefix,
        padding,
        nextNumber: n,
      });
      setSaved(true);
      setTimeout(() => onSaved(result), 650);
    } catch (e) {
      const msg =
        e instanceof ApiRequestError
          ? ([] as string[]).concat(e.body?.message ?? e.message)
          : [(e as Error).message];
      setError(msg.join(' · '));
    } finally {
      setSaving(false);
    }
  }

  const field = (hasError: boolean, extra?: string) =>
    clsx(
      'mt-1 block w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition outline-none',
      hasError
        ? 'border-rose-300 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20'
        : 'border-slate-200 focus:border-slate-500 focus:ring-2 focus:ring-slate-500/20',
      extra,
    );

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4 backdrop-blur-sm"
      onClick={() => !saving && onClose()}
    >
      <div
        className="animate-pop w-full max-w-md rounded-2xl bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sequence-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-slate-100 p-5">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-slate-600 to-slate-800 text-white shadow-sm">
              <Hash className="size-5" />
            </div>
            <div>
              <h2 id="sequence-dialog-title" className="font-semibold text-slate-900">
                {sequence.label}
              </h2>
              <p className="text-xs text-slate-500">
                {isProduct ? 'Used when no code is typed by hand' : `Numbers for ${sequence.year}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="rounded-xl bg-gradient-to-r from-slate-50 to-slate-100 p-4 text-center">
            <p className="text-xs text-slate-500">The next ones will be</p>
            <p className="mt-1 font-mono text-lg font-semibold text-slate-800">
              {valid ? (
                <>
                  {preview(n)}, <span className="text-slate-500">{preview(n + 1)}</span>…
                </>
              ) : (
                '—'
              )}
            </p>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Starts with</span>
            <input
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              placeholder={isProduct ? 'e.g. ART-' : 'e.g. INV'}
              className={field(!!prefixError, 'font-mono')}
              autoFocus
            />
            <span
              className={clsx(
                'mt-1 block text-xs',
                prefixError ? 'text-rose-600' : 'text-slate-500',
              )}
            >
              {prefixError ??
                (isProduct
                  ? 'Can be empty. Letters, digits and . _ - /'
                  : `The year is added automatically: ${prefix || 'PREFIX'}-${sequence.year}-…`)}
            </span>
          </label>

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Digits</span>
              <select
                value={padding}
                onChange={(e) => setPadding(Number(e.target.value))}
                className={field(false)}
              >
                {[...new Set([3, 4, 5, 6, 7, 8, padding])]
                  .sort((a, b) => a - b)
                  .map((d) => (
                    <option key={d} value={d}>
                      {d} ({'0'.repeat(d - 1)}1)
                    </option>
                  ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Next number</span>
              <input
                inputMode="numeric"
                value={nextNumber}
                onChange={(e) => setNextNumber(e.target.value.replace(/\D/g, ''))}
                className={field(!!numberError, 'text-right tabular-nums')}
              />
            </label>
          </div>
          {numberError && (
            <p key={numberError} className="animate-shake text-xs text-rose-600">
              {numberError}
            </p>
          )}

          <p className="flex items-start gap-1.5 rounded-lg bg-slate-50 p-2.5 text-xs text-slate-600">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            {isProduct
              ? 'Codes already in use are skipped automatically, so going back is safe.'
              : 'Document numbers can only move forward, so the same number is never used twice.'}
          </p>

          {error && (
            <p
              key={error}
              className="animate-shake flex items-start gap-1.5 rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700"
            >
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" /> {error}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-100 p-4">
          <button
            onClick={onClose}
            disabled={saving}
            className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!valid || !changed || saving || saved}
            className="inline-flex min-w-28 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-slate-700 to-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:-translate-y-px hover:shadow-md disabled:pointer-events-none disabled:opacity-50"
          >
            {saved ? (
              <span className="animate-pop inline-flex items-center gap-2">
                <Check className="size-4" /> Saved
              </span>
            ) : saving ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Saving…
              </>
            ) : (
              'Save'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
