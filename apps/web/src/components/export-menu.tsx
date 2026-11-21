'use client';

import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { ChevronDown, Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import type { ExportFormat } from '@/lib/export';

/**
 * "Export" button with an Excel / CSV choice. `onExport` does the work and
 * returns how many rows were exported (shown in `onDone`).
 */
export function ExportMenu({
  onExport,
  onDone,
  onError,
  disabled,
}: {
  onExport: (format: ExportFormat) => Promise<number>;
  onDone?: (rows: number, format: ExportFormat) => void;
  onError?: (message: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  async function run(format: ExportFormat) {
    setOpen(false);
    setBusy(format);
    try {
      const rows = await onExport(format);
      onDone?.(rows, format);
    } catch (e) {
      onError?.(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setBusy(null);
    }
  }

  const options: { format: ExportFormat; label: string; hint: string; icon: typeof FileText }[] = [
    { format: 'xlsx', label: 'Excel', hint: '.xlsx · formatted numbers', icon: FileSpreadsheet },
    { format: 'csv', label: 'CSV', hint: '.csv · for other tools', icon: FileText },
  ];

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled || busy !== null}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-all hover:border-emerald-300 hover:text-mod-inventory active:scale-[0.98] disabled:opacity-60"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
        {busy ? 'Exporting…' : 'Export'}
        <ChevronDown className={clsx('size-3.5 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div
          role="menu"
          className="animate-pop absolute right-0 z-30 mt-1 w-56 rounded-xl border border-slate-200 bg-white p-1 shadow-xl shadow-slate-900/10"
        >
          {options.map((o) => (
            <button
              key={o.format}
              role="menuitem"
              onClick={() => run(o.format)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-emerald-50"
            >
              <o.icon
                className={clsx(
                  'size-5',
                  o.format === 'xlsx' ? 'text-emerald-600' : 'text-slate-500',
                )}
              />
              <span>
                <span className="block text-sm font-medium text-slate-800">{o.label}</span>
                <span className="block text-xs text-slate-500">{o.hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
