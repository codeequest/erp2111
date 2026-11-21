import clsx from 'clsx';
import { daysLeft, fmtDate } from '@/lib/inventory';

/** Expiry date with a colour: red = expired, amber = within 30 days, grey otherwise. */
export function ExpiryBadge({ date }: { date: string | null }) {
  if (!date) return <span className="text-slate-400">No expiry</span>;
  const days = daysLeft(date);
  const text =
    days < 0
      ? `expired ${-days} day${days === -1 ? '' : 's'} ago`
      : days === 0
        ? 'expires today'
        : `in ${days} day${days === 1 ? '' : 's'}`;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="tabular-nums">{fmtDate(date)}</span>
      <span
        className={clsx(
          'rounded-full px-2 py-0.5 text-xs font-medium',
          days < 0
            ? 'bg-red-50 text-red-700'
            : days <= 30
              ? 'bg-amber-50 text-amber-700'
              : 'bg-slate-100 text-slate-500',
        )}
      >
        {text}
      </span>
    </span>
  );
}
