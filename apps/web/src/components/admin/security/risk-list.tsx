import Link from 'next/link';
import clsx from 'clsx';
import { ArrowRight, CheckCircle2, type LucideIcon } from 'lucide-react';
import type { SecurityUserMini } from '@erp/shared';
import { Avatar } from '../avatar';

const TONES = {
  rose: { tile: 'from-rose-500 to-pink-600', count: 'text-rose-700 bg-rose-50 ring-rose-200' },
  amber: {
    tile: 'from-amber-500 to-orange-600',
    count: 'text-amber-800 bg-amber-50 ring-amber-200',
  },
  sky: { tile: 'from-sky-500 to-blue-600', count: 'text-sky-700 bg-sky-50 ring-sky-200' },
  violet: {
    tile: 'from-violet-500 to-purple-600',
    count: 'text-violet-700 bg-violet-50 ring-violet-200',
  },
  slate: {
    tile: 'from-slate-500 to-slate-700',
    count: 'text-slate-700 bg-slate-100 ring-slate-200',
  },
};

/** One "needs attention" list on the security overview. */
export function RiskList({
  title,
  hint,
  icon: Icon,
  tone,
  count,
  users,
  href,
}: {
  title: string;
  hint: string;
  icon: LucideIcon;
  tone: keyof typeof TONES;
  count: number;
  users: SecurityUserMini[];
  href?: string;
}) {
  const t = TONES[tone];
  return (
    <section className="flex h-full flex-col rounded-xl border border-slate-200/80 bg-white shadow-sm">
      <header className="flex items-start gap-3 border-b border-slate-100 p-4">
        <span
          className={clsx(
            'grid size-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-white shadow-sm',
            count ? t.tile : 'from-emerald-400 to-teal-500',
          )}
        >
          {count ? <Icon className="size-4" /> : <CheckCircle2 className="size-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <p className="text-xs text-slate-500">{hint}</p>
        </div>
        <span
          className={clsx(
            'rounded-full px-2 py-0.5 text-sm font-semibold tabular-nums ring-1',
            count ? t.count : 'bg-emerald-50 text-emerald-700 ring-emerald-200',
          )}
        >
          {count}
        </span>
      </header>
      {count === 0 ? (
        <p className="flex-1 p-4 text-sm text-emerald-700">All clear.</p>
      ) : (
        <ul className="flex-1 divide-y divide-slate-100">
          {users.map((u) => (
            <li key={u.id}>
              <Link
                href={`/admin/users/${u.id}`}
                className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-slate-50"
              >
                <Avatar id={u.id} name={u.fullName} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900">
                    {u.fullName}
                  </span>
                  <span className="block truncate text-xs text-slate-500">{u.note ?? u.email}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {href && count > 0 && (
        <Link
          href={href}
          className="flex items-center justify-center gap-1.5 border-t border-slate-100 py-2.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50/50 hover:text-indigo-700"
        >
          {count > users.length ? `See all ${count}` : 'Open in users list'}
          <ArrowRight className="size-3.5" />
        </Link>
      )}
    </section>
  );
}
