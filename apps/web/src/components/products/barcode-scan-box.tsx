'use client';

import { useRef, useState } from 'react';
import clsx from 'clsx';
import { Loader2, ScanBarcode } from 'lucide-react';
import type { BarcodeMatch } from '@erp/shared';
import { api } from '@/lib/api';

/**
 * Looks a scanned code up: the product barcode, or the barcode of one of its pack sizes.
 * Returns null when no product has this barcode.
 */
export async function lookupBarcode(code: string): Promise<BarcodeMatch | null> {
  const term = code.trim();
  if (!term) return null;
  try {
    return await api<BarcodeMatch>(`/inventory/products/barcode/${encodeURIComponent(term)}`);
  } catch {
    return null;
  }
}

/**
 * Barcode field: a scanner types the code and presses Enter. `onMatch` receives the
 * product (and the pack size when it is a pack barcode) and may return an error
 * message to show under the field (e.g. "not on this order").
 */
export function BarcodeScanBox({
  onMatch,
  placeholder,
  notFound,
  disabled,
  className,
  accent = 'indigo',
}: {
  onMatch: (match: BarcodeMatch) => Promise<string | void> | string | void;
  placeholder: string;
  /** Message for an unknown code; {code} is replaced */
  notFound: string;
  disabled?: boolean;
  className?: string;
  accent?: 'indigo' | 'amber';
}) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function go() {
    const term = code.trim();
    if (!term) return;
    setBusy(true);
    const match = await lookupBarcode(term);
    const error = match ? await onMatch(match) : notFound.replace('{code}', term);
    setBusy(false);
    setCode('');
    input.current?.focus();
    if (error) {
      setMessage(error);
      setTimeout(() => setMessage(null), 2500);
    } else {
      setOk(true);
      setTimeout(() => setOk(false), 700);
    }
  }

  return (
    <div className={clsx('relative w-full sm:w-80', className)}>
      <ScanBarcode
        className={clsx(
          'pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 transition',
          ok ? 'scale-125 text-emerald-500' : 'text-slate-400',
        )}
      />
      <input
        ref={input}
        value={code}
        disabled={disabled}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void go();
          }
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className={clsx(
          'w-full rounded-lg border border-slate-300 bg-white py-2 pr-9 pl-9 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:ring-4',
          accent === 'indigo'
            ? 'focus:border-indigo-500 focus:ring-indigo-500/15'
            : 'focus:border-amber-500 focus:ring-amber-500/15',
          message && 'animate-shake border-red-400!',
          ok && 'border-emerald-400 bg-emerald-50/40',
        )}
      />
      {busy && (
        <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-slate-400" />
      )}
      {message && (
        <p className="animate-fade absolute top-full right-0 z-10 mt-1 rounded bg-white px-1 text-xs text-red-600">
          {message}
        </p>
      )}
    </div>
  );
}
