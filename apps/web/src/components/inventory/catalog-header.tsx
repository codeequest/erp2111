'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { ChevronRight, FolderTree, Package, Ruler, type LucideIcon } from 'lucide-react';

const TABS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/inventory/products', label: 'Products', icon: Package },
  { href: '/inventory/products/categories', label: 'Categories', icon: FolderTree },
  { href: '/inventory/products/units', label: 'Units', icon: Ruler },
];

/** Header shared by the product catalogue screens: breadcrumb, title, tabs, actions. */
export function CatalogHeader({
  title,
  description,
  icon: Icon,
  actions,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  actions?: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="animate-fade-up space-y-5">
      <nav className="flex items-center gap-1 text-xs text-slate-500">
        <Link href="/dashboard" className="hover:text-slate-700">
          Home
        </Link>
        <ChevronRight className="size-3" />
        <span className="text-mod-inventory">Inventory</span>
        <ChevronRight className="size-3" />
        <span>{title}</span>
      </nav>

      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 via-mod-inventory to-teal-700 p-5 text-white shadow-lg shadow-emerald-700/15 sm:p-6">
        <div className="pointer-events-none absolute -top-16 -right-10 size-48 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-20 left-1/3 size-56 rounded-full bg-teal-300/20 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="grid size-11 place-items-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
              <Icon className="size-5.5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold sm:text-2xl">{title}</h1>
              <p className="text-sm text-emerald-50/90">{description}</p>
            </div>
          </div>
          {actions}
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xs">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={clsx(
                'flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-all duration-200',
                active
                  ? 'bg-emerald-50 text-mod-inventory shadow-xs ring-1 ring-emerald-200/70'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800',
              )}
            >
              <tab.icon className="size-4" />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
