'use client';

import Link from 'next/link';
import { ArrowLeft, ChevronRight, Package } from 'lucide-react';

/** Breadcrumb + gradient title bar for the product create / edit pages. */
export function ProductHeader({
  title,
  subtitle,
  badge,
  actions,
  monoSubtitle,
}: {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  /** Show the subtitle as code (used for the SKU). */
  monoSubtitle?: boolean;
}) {
  return (
    <div className="animate-fade-up space-y-4">
      <nav className="flex items-center gap-1 text-xs text-slate-500">
        <Link href="/dashboard" className="hover:text-slate-700">
          Home
        </Link>
        <ChevronRight className="size-3" />
        <span className="text-mod-inventory">Inventory</span>
        <ChevronRight className="size-3" />
        <Link href="/inventory/products" className="hover:text-slate-700">
          Products
        </Link>
        <ChevronRight className="size-3" />
        <span className="max-w-48 truncate">{title}</span>
      </nav>
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 via-mod-inventory to-teal-700 p-5 text-white shadow-lg shadow-emerald-700/15 sm:p-6">
        <div className="pointer-events-none absolute -top-16 -right-10 size-48 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3.5">
            <Link
              href="/inventory/products"
              aria-label="Back to products"
              className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur transition-all hover:bg-white/25 active:scale-95"
            >
              <ArrowLeft className="size-5" />
            </Link>
            <div className="min-w-0">
              <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold sm:text-2xl">
                <Package className="size-5 opacity-80" />
                <span className="truncate">{title}</span>
                {badge}
              </h1>
              {subtitle && (
                <p className={(monoSubtitle ? 'font-mono ' : '') + 'text-sm text-emerald-50/90'}>
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          {actions}
        </div>
      </div>
    </div>
  );
}
