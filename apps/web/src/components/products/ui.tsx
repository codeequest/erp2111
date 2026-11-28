'use client';

import Link from 'next/link';
import clsx from 'clsx';
import { ChevronRight } from 'lucide-react';

import { tr } from '@/lib/i18n';
/** Small building blocks shared by the product screens. */

export function Breadcrumbs({ trail }: { trail: { label: string; href?: string }[] }) {
  return (
    <nav className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
      <Link href="/dashboard" className="hover:text-slate-700">
        {tr("Home")}</Link>
      <ChevronRight className="rtl:-scale-x-100 size-3" />
      <span className="text-mod-inventory">{tr("Inventory")}</span>
      {trail.map((t) => (
        <span key={t.label} className="flex items-center gap-1">
          <ChevronRight className="rtl:-scale-x-100 size-3" />
          {t.href ? (
            <Link href={t.href} className="hover:text-slate-700">
              {t.label}
            </Link>
          ) : (
            <span className="max-w-[16rem] truncate">{t.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
        active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500',
      )}
    >
      <span className={clsx('size-1.5 rounded-full', active ? 'bg-emerald-500' : 'bg-slate-400')} />
      {active ? tr("Active") : tr("Inactive")}
    </span>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      {message}
    </div>
  );
}

export const btnPrimary =
  'inline-flex items-center gap-2 rounded-md bg-mod-inventory px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';

export const btnSecondary =
  'inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';

/** Field styling without a width, for inline controls such as filter dropdowns. */
export const fieldClass =
  'rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-mod-inventory focus:ring-2 focus:ring-mod-inventory/20 disabled:bg-slate-50 disabled:text-slate-500';

export const inputClass = `w-full ${fieldClass}`;
