import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';

/** White card with an optional header (icon, title, description, actions). */
export function Card({
  title,
  description,
  icon: Icon,
  actions,
  children,
  className,
  bodyClassName,
  tone = 'indigo',
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  tone?: 'indigo' | 'emerald' | 'amber' | 'rose' | 'sky' | 'slate';
}) {
  const tile = {
    indigo: 'from-indigo-50 to-violet-100 text-indigo-600',
    emerald: 'from-emerald-50 to-teal-100 text-emerald-600',
    amber: 'from-amber-50 to-orange-100 text-amber-700',
    rose: 'from-rose-50 to-pink-100 text-rose-600',
    sky: 'from-sky-50 to-blue-100 text-sky-600',
    slate: 'from-slate-50 to-slate-200 text-slate-600',
  }[tone];
  return (
    <section
      className={clsx('rounded-xl border border-slate-200/80 bg-white shadow-sm', className)}
    >
      {(title || actions) && (
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            {Icon && (
              <div
                className={clsx(
                  'grid size-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br',
                  tile,
                )}
              >
                <Icon className="size-4" />
              </div>
            )}
            <div className="min-w-0">
              {title && <h2 className="text-sm font-semibold text-slate-900">{title}</h2>}
              {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
            </div>
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={clsx('px-5 py-4', bodyClassName)}>{children}</div>
    </section>
  );
}
