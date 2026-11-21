'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import clsx from 'clsx';
import { AlertTriangle, ChevronRight, ImageOff, Lock, PackageX, X } from 'lucide-react';
import type { StockStatus } from '@/lib/inventory';

/** Small building blocks shared by the Products screens (same look as the rest of the app). */

export const inputCls =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:bg-slate-50 disabled:text-slate-500 aria-[invalid=true]:border-red-400';

export const btn = {
  primary:
    'inline-flex items-center justify-center gap-2 rounded-md bg-mod-inventory px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60',
  secondary:
    'inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60',
  ghost:
    'inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50',
  danger:
    'inline-flex items-center justify-center gap-2 rounded-md border border-red-200 bg-white px-3.5 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60',
};

export function Breadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex flex-wrap items-center gap-1 text-xs text-slate-500"
    >
      <Link href="/dashboard" className="hover:text-slate-700">
        Home
      </Link>
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1">
          <ChevronRight className="size-3" />
          {it.href ? (
            <Link href={it.href} className="hover:text-slate-700">
              {it.label}
            </Link>
          ) : (
            <span className="text-slate-700">{it.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  hint?: React.ReactNode;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-xs text-red-600">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

export function Card({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx('rounded-xl border border-slate-200 bg-white', className)}>
      {title && (
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
          <div>
            <h2 className="font-semibold text-slate-900">{title}</h2>
            {description && <p className="text-xs text-slate-500">{description}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

const STOCK_STYLES: Record<StockStatus, { cls: string; label: string }> = {
  ok: { cls: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', label: 'In stock' },
  low: { cls: 'bg-amber-50 text-amber-800 ring-amber-600/25', label: 'Low stock' },
  out: { cls: 'bg-red-50 text-red-700 ring-red-600/20', label: 'Out of stock' },
};

export function StockBadge({ status }: { status: StockStatus }) {
  const s = STOCK_STYLES[status];
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset',
        s.cls,
      )}
    >
      {status === 'low' && <AlertTriangle className="size-3" />}
      {status === 'out' && <PackageX className="size-3" />}
      {s.label}
    </span>
  );
}

export function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={clsx(
        'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
        active ? 'bg-slate-100 text-slate-700' : 'bg-slate-200 text-slate-500 line-through',
      )}
    >
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

export function ProductThumb({
  src,
  alt,
  size = 'sm',
}: {
  src: string | null;
  alt: string;
  size?: 'sm' | 'lg';
}) {
  const box = size === 'sm' ? 'size-10 rounded-md' : 'aspect-square w-full rounded-lg';
  if (!src) {
    return (
      <div className={clsx(box, 'grid shrink-0 place-items-center bg-slate-100 text-slate-400')}>
        <ImageOff className={size === 'sm' ? 'size-4' : 'size-8'} />
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- images come from the API, sizes vary
  return (
    <img
      src={src}
      alt={alt}
      className={clsx(box, 'shrink-0 border border-slate-200 bg-white object-cover')}
    />
  );
}

export function ErrorNotice({ message, onClose }: { message: string; onClose?: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <p className="flex-1">{message}</p>
      {onClose && (
        <button onClick={onClose} aria-label="Dismiss" className="text-red-500 hover:text-red-700">
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

export function AccessDenied({ permission, what }: { permission: string; what: string }) {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center">
      <Lock className="mx-auto size-8 text-slate-400" />
      <h1 className="mt-3 text-lg font-semibold text-slate-900">Access denied</h1>
      <p className="mt-1 text-sm text-slate-500">
        You need the <code className="rounded bg-slate-100 px-1">{permission}</code> permission to{' '}
        {what}. Ask an administrator.
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

/** Accessible dialog: Esc closes it, focus moves inside on open. */
export function Modal({
  title,
  open,
  onClose,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-md rounded-xl bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <h2 className="font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} aria-label="Close" className={btn.ghost}>
            <X className="size-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
