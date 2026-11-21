'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { ChevronRight, Lock, Package } from 'lucide-react';
import type { PermissionCode } from '@erp/shared';
import { useAuth } from '@/lib/auth';

export const btn =
  'inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';
export const btnPrimary =
  'inline-flex items-center gap-2 rounded-md bg-mod-inventory px-3 py-2 text-sm font-medium text-white shadow-sm hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50';
export const btnDanger =
  'inline-flex items-center gap-2 rounded-md border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50';
export const inputBase =
  'rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-mod-inventory focus:ring-2 focus:ring-mod-inventory/20 focus:outline-none disabled:bg-slate-50';
export const input = `w-full ${inputBase}`;

/** Page title + breadcrumb for the Products screens. */
export function PageHeader({
  title,
  subtitle,
  crumbs = [],
  actions,
}: {
  title: string;
  subtitle?: string;
  crumbs?: { label: string; href?: string }[];
  actions?: React.ReactNode;
}) {
  return (
    <div>
      <nav className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
        <Link href="/dashboard" className="hover:text-slate-700">
          Home
        </Link>
        <ChevronRight className="size-3" />
        <span className="text-mod-inventory">Inventory</span>
        <ChevronRight className="size-3" />
        <Link href="/inventory/products" className="hover:text-slate-700">
          Products
        </Link>
        {crumbs.map((c) => (
          <span key={c.label} className="flex items-center gap-1">
            <ChevronRight className="size-3" />
            {c.href ? (
              <Link href={c.href} className="hover:text-slate-700">
                {c.label}
              </Link>
            ) : (
              <span className="max-w-60 truncate">{c.label}</span>
            )}
          </span>
        ))}
      </nav>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-mod-inventory/10">
            <Package className="size-5 text-mod-inventory" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold text-slate-900">{title}</h1>
            {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

const TABS = [
  { label: 'Products', href: '/inventory/products' },
  { label: 'Categories', href: '/inventory/products/categories' },
  { label: 'Units', href: '/inventory/products/units' },
  { label: 'Price lists', href: '/inventory/products/price-lists' },
];

export function ProductTabs() {
  const pathname = usePathname();
  return (
    <div className="flex gap-1 border-b border-slate-200">
      {TABS.map((t) => {
        const active =
          t.href === '/inventory/products'
            ? !TABS.slice(1).some((o) => pathname.startsWith(o.href))
            : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={clsx(
              '-mb-px border-b-2 px-4 py-2 text-sm font-medium',
              active
                ? 'border-mod-inventory text-mod-inventory'
                : 'border-transparent text-slate-500 hover:text-slate-700',
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}

/** Renders children only if the user has the permission. */
export function RequirePermission({
  permission,
  children,
}: {
  permission: PermissionCode;
  children: React.ReactNode;
}) {
  const { can } = useAuth();
  if (can(permission)) return <>{children}</>;
  return (
    <div className="mx-auto mt-16 max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center">
      <Lock className="mx-auto size-8 text-slate-400" />
      <h1 className="mt-3 text-lg font-semibold text-slate-900">Access denied</h1>
      <p className="mt-1 text-sm text-slate-500">
        You need the <code className="rounded bg-slate-100 px-1">{permission}</code> permission. Ask
        an administrator.
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

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={clsx('block', className)}>
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-red-600">{error}</span>
      ) : (
        hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>
      )}
    </label>
  );
}

export function Alert({
  kind = 'error',
  children,
}: {
  kind?: 'error' | 'success';
  children: React.ReactNode;
}) {
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className={clsx(
        'rounded-md border px-3 py-2 text-sm',
        kind === 'error'
          ? 'border-red-200 bg-red-50 text-red-700'
          : 'border-emerald-200 bg-emerald-50 text-emerald-700',
      )}
    >
      {children}
    </div>
  );
}

export function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={clsx(
        'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
        active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500',
      )}
    >
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}
