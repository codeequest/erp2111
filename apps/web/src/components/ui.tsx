'use client';

/** Small shared UI building blocks for ERP screens (forms, dialogs, states). */
import { useEffect, useId, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { AlertCircle, Loader2, Lock, X } from 'lucide-react';
import type { PermissionCode } from '@erp/shared';

// ── Buttons ─────────────────────────────────────────────────────────────────

/** `onDark` = white button for use on the gradient page header. */
const primaryClass = (onDark?: boolean, className?: string) =>
  clsx(
    'inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium shadow-sm',
    onDark
      ? 'bg-white text-mod-inventory shadow-emerald-900/20 hover:bg-emerald-50'
      : 'bg-gradient-to-br from-emerald-500 to-mod-inventory text-white shadow-emerald-600/20 hover:shadow-emerald-600/25',
    'transition-all duration-150 hover:-translate-y-px hover:shadow-md active:translate-y-0 active:scale-[0.98]',
    'focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:outline-none',
    'disabled:pointer-events-none disabled:opacity-60',
    className,
  );

/** A link that looks like the primary button. */
export function PrimaryLink({
  href,
  onDark,
  children,
}: {
  href: string;
  onDark?: boolean;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={primaryClass(onDark)}>
      {children}
    </Link>
  );
}

export function PrimaryButton({
  children,
  loading,
  onDark,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  onDark?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={primaryClass(onDark, className)}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

export function SecondaryButton({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700',
        'transition-all duration-150 hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98]',
        'focus-visible:ring-2 focus-visible:ring-slate-400/40 focus-visible:outline-none disabled:opacity-50',
        className,
      )}
    />
  );
}

// ── Form fields ─────────────────────────────────────────────────────────────

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: (id: string, invalid: boolean) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children(id, Boolean(error))}
      {error ? (
        <p key={error} className="animate-fade-in flex items-center gap-1 text-xs text-red-600">
          <AlertCircle className="size-3.5 shrink-0" /> {error}
        </p>
      ) : (
        hint && <p className="text-xs text-slate-500">{hint}</p>
      )}
    </div>
  );
}

export const inputClass = (invalid = false) =>
  clsx(
    'w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 shadow-xs transition-colors',
    'placeholder:text-slate-400 focus:ring-2 focus:outline-none',
    invalid
      ? 'animate-shake border-red-300 focus:border-red-400 focus:ring-red-500/20'
      : 'border-slate-200 focus:border-emerald-500 focus:ring-emerald-500/20',
  );

// ── Dialog ──────────────────────────────────────────────────────────────────

export function Dialog({
  open,
  title,
  description,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const el = panel.current;
    (
      el?.querySelector<HTMLElement>('input:not([disabled]), select, textarea') ??
      el?.querySelector<HTMLElement>('form button, [data-autofocus]')
    )?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-end p-0 sm:place-items-center sm:p-4">
      <div
        className="animate-fade-in absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="animate-pop relative w-full rounded-t-2xl bg-white shadow-2xl ring-1 ring-slate-900/5 sm:max-w-md sm:rounded-2xl"
      >
        <div className="h-1 rounded-t-2xl bg-gradient-to-r from-emerald-400 via-mod-inventory to-teal-500" />
        <div className="flex items-start justify-between gap-4 px-5 pt-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="px-5 pt-4 pb-5">{children}</div>
      </div>
    </div>
  );
}

/** Animated check mark shown briefly after a successful save. */
export function SuccessState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center py-6 text-center">
      <div className="animate-pop grid size-14 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-mod-inventory shadow-lg shadow-emerald-600/30">
        <svg viewBox="0 0 24 24" className="size-7 text-white" fill="none" stroke="currentColor">
          <path
            d="M5 12.5l4.5 4.5L19 7.5"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={24}
            className="animate-draw"
          />
        </svg>
      </div>
      <p className="animate-fade-up mt-3 text-sm font-medium text-slate-700">{message}</p>
    </div>
  );
}

// ── Page states ─────────────────────────────────────────────────────────────

export function EmptyState({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="animate-fade-up flex flex-col items-center px-6 py-14 text-center">
      <div className="relative">
        <div className="absolute inset-0 scale-150 rounded-full bg-emerald-400/10 blur-xl" />
        <div className="relative grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-100 ring-1 ring-emerald-200/60">
          <Icon className="size-7 text-mod-inventory" />
        </div>
      </div>
      <h3 className="mt-4 font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="animate-fade-in flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <span className="flex items-center gap-2">
        <AlertCircle className="size-4 shrink-0" /> {message}
      </span>
      {onRetry && (
        <button onClick={onRetry} className="font-medium underline-offset-2 hover:underline">
          Retry
        </button>
      )}
    </div>
  );
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="divide-y divide-slate-100">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3.5">
          <div className="h-4 w-16 animate-pulse rounded bg-slate-100" />
          <div
            className="h-4 animate-pulse rounded bg-slate-100"
            style={{ width: `${30 + ((i * 17) % 35)}%` }}
          />
        </div>
      ))}
    </div>
  );
}

export function AccessDenied({ permission, what }: { permission: PermissionCode; what: string }) {
  return (
    <div className="animate-fade-up mx-auto mt-16 max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center">
      <Lock className="mx-auto size-8 text-slate-400" />
      <h1 className="mt-3 text-lg font-semibold text-slate-900">Access denied</h1>
      <p className="mt-1 text-sm text-slate-500">
        You need the <code className="rounded bg-slate-100 px-1">{permission}</code> permission to
        open {what}. Ask an administrator.
      </p>
      <Link
        href="/dashboard"
        className="mt-5 inline-block text-sm font-medium text-blue-600 hover:underline"
      >
        Back to dashboard
      </Link>
    </div>
  );
}

// ── Toast ───────────────────────────────────────────────────────────────────

/** Small confirmation that slides in at the bottom and hides itself. */
export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, 2600);
    return () => clearTimeout(t);
  }, [message, onDone]);

  if (!message) return null;
  return (
    <div
      role="status"
      className="animate-fade-up fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-sm items-center gap-3 rounded-xl bg-slate-900/95 px-4 py-3 text-sm text-white shadow-2xl ring-1 ring-white/10 backdrop-blur sm:right-6 sm:left-auto sm:mx-0"
    >
      <span className="animate-pop grid size-6 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-mod-inventory">
        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor">
          <path
            d="M5 12.5l4.5 4.5L19 7.5"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={24}
            className="animate-draw"
          />
        </svg>
      </span>
      {message}
    </div>
  );
}
