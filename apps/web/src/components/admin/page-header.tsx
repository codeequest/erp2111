import Link from 'next/link';
import { ChevronRight, type LucideIcon } from 'lucide-react';

export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumbs({ trail }: { trail: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
      <Link href="/dashboard" className="transition hover:text-slate-800">
        Home
      </Link>
      <ChevronRight className="size-3" />
      <span className="font-medium text-indigo-600">Administration</span>
      {trail.map((t) => (
        <span key={t.label} className="flex items-center gap-1">
          <ChevronRight className="size-3" />
          {t.href ? (
            <Link href={t.href} className="transition hover:text-slate-800">
              {t.label}
            </Link>
          ) : (
            <span className="max-w-[16rem] truncate text-slate-700">{t.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

/** Title block of an admin page: breadcrumbs, gradient icon tile, title, description, actions. */
export function PageHeader({
  icon: Icon,
  title,
  description,
  trail = [],
  actions,
}: {
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  trail?: Crumb[];
  actions?: React.ReactNode;
}) {
  return (
    <header className="animate-fade-up space-y-3">
      <Breadcrumbs trail={trail} />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          {Icon && (
            <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/25">
              <Icon className="size-5" />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
            {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
