import Link from 'next/link';
import { ChevronRight, Package } from 'lucide-react';

interface Crumb {
  label: string;
  href?: string;
}

/** Breadcrumb + title block shared by the product screens (Inventory colour identity). */
export function ProductsHeader({
  title,
  subtitle,
  crumbs = [],
  actions,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  crumbs?: Crumb[];
  actions?: React.ReactNode;
}) {
  const all: Crumb[] = [
    { label: 'Home', href: '/dashboard' },
    { label: 'Inventory' },
    { label: 'Products', href: '/inventory/products' },
    ...crumbs,
  ];
  return (
    <div className="animate-fade-in-up">
      <nav
        className="flex flex-wrap items-center gap-1 text-xs text-slate-500"
        aria-label="Breadcrumb"
      >
        {all.map((c, i) => (
          <span key={`${c.label}-${i}`} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="size-3" />}
            {c.href && i < all.length - 1 ? (
              <Link href={c.href} className="hover:text-slate-700">
                {c.label}
              </Link>
            ) : (
              <span className={i === 1 ? 'text-mod-inventory' : undefined}>{c.label}</span>
            )}
          </span>
        ))}
      </nav>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-sm shadow-emerald-600/30">
            <Package className="size-5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold text-slate-900">{title}</h1>
            {subtitle && <div className="text-sm text-slate-500">{subtitle}</div>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ' +
        (active
          ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/15'
          : 'bg-slate-100 text-slate-500')
      }
    >
      <span className={'size-1.5 rounded-full ' + (active ? 'bg-emerald-500' : 'bg-slate-400')} />
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

export const primaryBtn =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-sm font-medium text-white shadow-sm shadow-emerald-600/25 transition hover:-translate-y-px hover:shadow-md hover:shadow-emerald-600/30 active:translate-y-0 disabled:pointer-events-none disabled:opacity-60';

export const secondaryBtn =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-60';
