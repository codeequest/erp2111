'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { AlertCircle, CheckCircle2, ChevronDown, Info, X } from 'lucide-react';

type Tone = 'success' | 'error' | 'info';

export interface ToastInput {
  tone?: Tone;
  title: string;
  description?: React.ReactNode;
  /** Shown behind a "Details" toggle (e.g. bulk results). */
  details?: React.ReactNode;
  action?: { label: string; onClick: () => void };
  /** ms; 0 = stays until closed. */
  duration?: number;
}

interface ToastItem extends ToastInput {
  id: number;
}

const ToastContext = createContext<((t: ToastInput) => void) | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);

  const push = useCallback(
    (t: ToastInput) => {
      const id = ++seq.current;
      setItems((xs) => [...xs.slice(-3), { ...t, id }]);
      const duration = t.duration ?? (t.details || t.action ? 9000 : 4500);
      if (duration > 0) setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end"
      >
        {items.map((t) => (
          <Toast key={t.id} item={t} onClose={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const ICONS = { success: CheckCircle2, error: AlertCircle, info: Info };
const TONES = {
  success: 'text-emerald-600 bg-emerald-50',
  error: 'text-rose-600 bg-rose-50',
  info: 'text-indigo-600 bg-indigo-50',
};

function Toast({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  const [open, setOpen] = useState(false);
  const tone = item.tone ?? 'success';
  const Icon = ICONS[tone];
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className="animate-toast-in pointer-events-auto w-full max-w-sm overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-slate-900/10"
    >
      <div className="flex gap-3 p-3.5">
        <div className={clsx('grid size-8 shrink-0 place-items-center rounded-full', TONES[tone])}>
          <Icon className={clsx('size-4.5', tone === 'success' && 'animate-pop')} />
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-sm font-medium text-slate-900">{item.title}</p>
          {item.description && <div className="mt-0.5 text-sm text-slate-500">{item.description}</div>}
          <div className="mt-1 flex gap-3">
            {item.details && (
              <button
                onClick={() => setOpen((o) => !o)}
                className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
              >
                Details
                <ChevronDown className={clsx('size-3 transition', open && 'rotate-180')} />
              </button>
            )}
            {item.action && (
              <button
                onClick={() => {
                  item.action!.onClick();
                  onClose();
                }}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
              >
                {item.action.label}
              </button>
            )}
          </div>
          {open && <div className="animate-fade-in mt-2 max-h-48 overflow-y-auto text-xs">{item.details}</div>}
        </div>
        <button onClick={onClose} className="self-start rounded p-1 text-slate-400 hover:text-slate-600" aria-label="Dismiss">
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}

export function useToast() {
  const push = useContext(ToastContext);
  if (!push) throw new Error('useToast must be used inside <ToastProvider>');
  return useMemo(
    () => ({
      show: push,
      success: (title: string, description?: React.ReactNode) => push({ tone: 'success', title, description }),
      error: (title: string, description?: React.ReactNode) => push({ tone: 'error', title, description }),
      info: (title: string, description?: React.ReactNode) => push({ tone: 'info', title, description }),
    }),
    [push],
  );
}
