import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';

const HALOS = {
  indigo: 'from-indigo-100 to-violet-100 text-indigo-600',
  rose: 'from-rose-100 to-pink-100 text-rose-600',
  amber: 'from-amber-100 to-orange-100 text-amber-700',
  slate: 'from-slate-100 to-slate-200 text-slate-500',
};

/** Friendly empty / error state: icon in a soft gradient halo, one-line guidance, optional action. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  tone = 'indigo',
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  tone?: keyof typeof HALOS;
  className?: string;
}) {
  const halo = HALOS[tone];
  return (
    <div className={clsx('animate-fade-up flex flex-col items-center px-6 py-14 text-center', className)}>
      <div className="relative mb-4">
        <div
          className={clsx(
            'absolute inset-0 scale-150 rounded-full bg-gradient-to-br opacity-60 blur-xl',
            halo,
          )}
        />
        <div
          className={clsx(
            'relative grid size-14 place-items-center rounded-2xl bg-gradient-to-br shadow-sm',
            halo,
          )}
        >
          <Icon className="size-7" />
        </div>
      </div>
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
