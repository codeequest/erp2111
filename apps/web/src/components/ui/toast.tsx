'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import clsx from 'clsx';

type ToastKind = 'success' | 'error';

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  description?: string;
  action?: ToastAction;
}

interface ToastContextValue {
  toast: (t: Omit<Toast, 'id'>) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((all) => all.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (t: Omit<Toast, 'id'>) => {
      const id = nextId.current++;
      setToasts((all) => [...all.slice(-3), { ...t, id }]);
      setTimeout(() => dismiss(id), t.action ? 7000 : 4500);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 24, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, transition: { duration: 0.2 } }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl bg-white/95 p-4 shadow-xl ring-1 shadow-slate-900/10 ring-slate-900/5 backdrop-blur"
            >
              {t.kind === 'success' ? (
                <motion.span
                  initial={{ scale: 0, rotate: -45 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 18, delay: 0.05 }}
                >
                  <CheckCircle2 className="size-5 text-emerald-500" />
                </motion.span>
              ) : (
                <AlertCircle className="size-5 shrink-0 text-red-500" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">{t.title}</p>
                {t.description && <p className="mt-0.5 text-sm text-slate-500">{t.description}</p>}
              </div>
              {t.action && (
                <button
                  onClick={() => {
                    t.action!.onClick();
                    dismiss(t.id);
                  }}
                  className={clsx(
                    'shrink-0 rounded-md px-2 py-1 text-sm font-semibold',
                    'text-emerald-700 hover:bg-emerald-50',
                  )}
                >
                  {t.action.label}
                </button>
              )}
              <button
                onClick={() => dismiss(t.id)}
                className="shrink-0 rounded-md p-0.5 text-slate-400 hover:text-slate-600"
                aria-label="Dismiss"
              >
                <X className="size-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx.toast;
}
