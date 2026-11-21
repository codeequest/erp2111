'use client';

import { AnimatePresence, motion } from 'motion/react';
import clsx from 'clsx';

export const inputClass = (invalid?: boolean) =>
  clsx(
    'w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400',
    'focus:ring-4 disabled:bg-slate-50 disabled:text-slate-500',
    invalid
      ? 'border-red-300 focus:border-red-400 focus:ring-red-500/15'
      : 'border-slate-200 hover:border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/15',
  );

interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: React.ReactNode;
  required?: boolean;
  /** Changing this number replays the shake animation (e.g. on each failed submit). */
  shakeKey?: number;
  className?: string;
  children: React.ReactNode;
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  shakeKey = 0,
  className,
  children,
}: FieldProps) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      <motion.div
        key={error ? `err-${shakeKey}` : 'ok'}
        animate={error ? { x: [0, -6, 6, -4, 4, 0] } : undefined}
        transition={{ duration: 0.35 }}
      >
        {children}
      </motion.div>
      <AnimatePresence mode="wait" initial={false}>
        {error ? (
          <motion.p
            key="error"
            id={`${htmlFor}-error`}
            role="alert"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="mt-1.5 text-xs font-medium text-red-600"
          >
            {error}
          </motion.p>
        ) : hint ? (
          <motion.p
            key="hint"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mt-1.5 text-xs text-slate-500"
          >
            {hint}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
