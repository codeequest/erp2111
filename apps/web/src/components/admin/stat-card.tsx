'use client';

import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { useCountUp } from '@/lib/use-count-up';

const TONES = {
  indigo: { icon: 'from-indigo-500 to-violet-500', ring: 'ring-indigo-500', glow: 'from-indigo-500/10' },
  emerald: { icon: 'from-emerald-500 to-teal-500', ring: 'ring-emerald-500', glow: 'from-emerald-500/10' },
  sky: { icon: 'from-sky-500 to-blue-500', ring: 'ring-sky-500', glow: 'from-sky-500/10' },
  amber: { icon: 'from-amber-500 to-orange-500', ring: 'ring-amber-500', glow: 'from-amber-500/10' },
  rose: { icon: 'from-rose-500 to-pink-500', ring: 'ring-rose-500', glow: 'from-rose-500/10' },
  slate: { icon: 'from-slate-500 to-slate-700', ring: 'ring-slate-500', glow: 'from-slate-500/10' },
} as const;

export type StatTone = keyof typeof TONES;

/** KPI tile with a count-up number. Clickable when `onClick` is given (e.g. to filter a list). */
export function StatCard({
  label,
  value,
  icon: Icon,
  tone = 'indigo',
  hint,
  active = false,
  loading = false,
  onClick,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tone?: StatTone;
  hint?: string;
  active?: boolean;
  loading?: boolean;
  onClick?: () => void;
}) {
  const n = useCountUp(loading ? 0 : value);
  const t = TONES[tone];
  const body = (
    <>
      <div
        className={clsx(
          'pointer-events-none absolute -top-10 -right-10 size-32 rounded-full bg-gradient-to-br to-transparent',
          t.glow,
        )}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</p>
          <p className="mt-1.5 text-2xl font-semibold text-slate-900 tabular-nums">
            {loading ? (
              <span className="shimmer inline-block h-7 w-12 rounded-md align-middle" />
            ) : (
              n.toLocaleString()
            )}
          </p>
          {hint && <p className="mt-0.5 truncate text-xs text-slate-400">{hint}</p>}
        </div>
        <div
          className={clsx(
            'grid size-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-white shadow-sm transition-transform duration-200 group-hover:scale-110',
            t.icon,
          )}
        >
          <Icon className="size-4" />
        </div>
      </div>
    </>
  );
  const cls = clsx(
    'group relative overflow-hidden rounded-xl border border-slate-200/80 bg-white p-4 text-left shadow-sm',
    onClick && 'lift cursor-pointer',
    active && clsx('ring-2', t.ring),
  );
  return onClick ? (
    <button type="button" onClick={onClick} aria-pressed={active} className={cls}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}
