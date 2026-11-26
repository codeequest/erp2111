'use client';

import clsx from 'clsx';
import { fieldClass, inputClass } from '../buttons';
import { actionLabel } from './audit-timeline';

export interface AuditFilterState {
  action: string[];
  result: string;
  targetType: string;
  from: string;
  to: string;
}

/** Result / action / target type / date range filters for the audit log. */
export function AuditFilters({
  value,
  actions,
  onChange,
}: {
  value: AuditFilterState;
  actions: string[];
  onChange: (patch: Partial<AuditFilterState>) => void;
}) {
  const groups = new Map<string, string[]>();
  actions.forEach((a) => {
    const g = a.split('.')[0];
    groups.set(g, [...(groups.get(g) ?? []), a]);
  });

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <div className="grid grid-cols-4 gap-1 rounded-lg bg-slate-100 p-1 lg:col-span-2">
        {[
          ['', 'All'],
          ['SUCCESS', 'Success'],
          ['FAILURE', 'Failure'],
          ['DENIED', 'Denied'],
        ].map(([v, l]) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange({ result: v })}
            className={clsx(
              'rounded-md py-1.5 text-xs font-medium transition',
              value.result === v
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900',
            )}
          >
            {l}
          </button>
        ))}
      </div>
      <select
        value={value.action[0] ?? ''}
        onChange={(e) => onChange({ action: e.target.value ? [e.target.value] : [] })}
        className={fieldClass}
        aria-label="Action"
      >
        <option value="">Any action</option>
        {[...groups.entries()].map(([g, list]) => (
          <optgroup key={g} label={g.charAt(0).toUpperCase() + g.slice(1)}>
            {list.map((a) => (
              <option key={a} value={a}>
                {actionLabel(a)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <div className="grid grid-cols-2 gap-2 lg:col-span-2">
        <input
          type="date"
          aria-label="From"
          value={value.from}
          max={value.to || undefined}
          onChange={(e) => onChange({ from: e.target.value })}
          className={clsx(inputClass, 'text-xs')}
        />
        <input
          type="date"
          aria-label="To"
          value={value.to}
          min={value.from || undefined}
          onChange={(e) => onChange({ to: e.target.value })}
          className={clsx(inputClass, 'text-xs')}
        />
      </div>
    </div>
  );
}
