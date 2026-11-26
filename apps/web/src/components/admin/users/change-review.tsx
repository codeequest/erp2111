import { ArrowRight } from 'lucide-react';

export interface ChangeRow {
  label: string;
  before: React.ReactNode;
  after: React.ReactNode;
}

/** Before → after list shown before saving sensitive edits. */
export function ChangeReview({ rows }: { rows: ChangeRow[] }) {
  return (
    <ul className="stagger divide-y divide-slate-100 rounded-xl border border-slate-200">
      {rows.map((r, i) => (
        <li
          key={r.label}
          style={{ '--i': i } as React.CSSProperties}
          className="grid gap-1 p-3 sm:grid-cols-[8rem_1fr]"
        >
          <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
            {r.label}
          </span>
          <span className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-md bg-rose-50 px-1.5 py-0.5 text-rose-700 line-through decoration-rose-300">
              {r.before || '—'}
            </span>
            <ArrowRight className="size-3.5 text-slate-400" />
            <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-700">
              {r.after || '—'}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
