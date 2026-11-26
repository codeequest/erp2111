'use client';

import { cloneElement, isValidElement, useEffect, useId, useState } from 'react';
import clsx from 'clsx';
import { AlertCircle } from 'lucide-react';

/**
 * Label + control + hint/error. The error fades in and the control shakes each
 * time a new error appears.
 */
export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
  optional,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  required?: boolean;
  optional?: boolean;
  children: React.ReactElement<{
    id?: string;
    'aria-invalid'?: boolean;
    'aria-describedby'?: string;
    className?: string;
  }>;
  className?: string;
}) {
  const id = useId();
  const [shakeKey, setShakeKey] = useState(0);
  useEffect(() => {
    if (error) setShakeKey((k) => k + 1);
  }, [error]);

  const control = isValidElement(children)
    ? cloneElement(children, {
        id: children.props.id ?? id,
        'aria-invalid': !!error || undefined,
        'aria-describedby': error || hint ? `${id}-msg` : undefined,
        className: clsx(
          children.props.className,
          error && 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/20',
        ),
      })
    : children;

  return (
    <div className={clsx('space-y-1.5', className)}>
      <label htmlFor={children.props.id ?? id} className="block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
        {optional && <span className="ml-1 font-normal text-slate-400">(optional)</span>}
      </label>
      <div key={shakeKey} className={clsx(shakeKey > 0 && error && 'animate-shake')}>
        {control}
      </div>
      {error ? (
        <p
          id={`${id}-msg`}
          className="animate-fade-in flex items-center gap-1.5 text-xs text-rose-600"
        >
          <AlertCircle className="size-3.5 shrink-0" />
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-msg`} className="text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Pretty switch for booleans. */
export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
  icon,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <label
      className={clsx(
        'flex items-start gap-3 rounded-xl border p-3.5 transition',
        checked ? 'border-indigo-200 bg-indigo-50/50' : 'border-slate-200 bg-white',
        disabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer hover:border-indigo-300',
      )}
    >
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-slate-900">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-slate-500">{description}</span>}
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="h-5 w-9 rounded-full bg-slate-300 transition peer-checked:bg-gradient-to-r peer-checked:from-indigo-600 peer-checked:to-violet-600 peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500/40" />
        <span className="absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
      </span>
    </label>
  );
}
