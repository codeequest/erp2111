'use client';

import clsx from 'clsx';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

/** Scroll container + table with a sticky, blurred header. */
export function TableShell({
  children,
  className,
  minWidth = 'min-w-[720px]',
}: {
  children: React.ReactNode;
  className?: string;
  minWidth?: string;
}) {
  return (
    <div className={clsx('overflow-x-auto', className)}>
      <table className={clsx('w-full border-separate border-spacing-0 text-sm', minWidth)}>
        {children}
      </table>
    </div>
  );
}

export function Th({
  children,
  className,
  align = 'left',
}: {
  children?: React.ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
}) {
  return (
    <th
      scope="col"
      className={clsx(
        'sticky top-0 z-10 border-b border-slate-200 bg-slate-50/90 px-4 py-2.5 text-xs font-semibold tracking-wide whitespace-nowrap text-slate-500 uppercase backdrop-blur',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {children}
    </th>
  );
}

/** Header cell that toggles sort: click once = asc, again = desc. */
export function SortTh<K extends string>({
  label,
  field,
  sort,
  order,
  onSort,
  className,
}: {
  label: string;
  field: K;
  sort: string;
  order: 'asc' | 'desc';
  onSort: (field: K, order: 'asc' | 'desc') => void;
  className?: string;
}) {
  const active = sort === field;
  const Icon = !active ? ArrowUpDown : order === 'asc' ? ArrowUp : ArrowDown;
  return (
    <Th className={className}>
      <button
        type="button"
        onClick={() => onSort(field, active && order === 'asc' ? 'desc' : 'asc')}
        className={clsx(
          'group inline-flex items-center gap-1 uppercase transition hover:text-slate-800',
          active && 'text-indigo-600',
        )}
        aria-label={`Sort by ${label}`}
      >
        {label}
        <Icon
          className={clsx('size-3 transition', !active && 'opacity-0 group-hover:opacity-60')}
        />
      </button>
    </Th>
  );
}

/** Checkbox with an indeterminate state. */
export function Checkbox({
  checked,
  indeterminate = false,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      ref={(el) => {
        if (el) el.indeterminate = indeterminate && !checked;
      }}
      onChange={(e) => onChange(e.target.checked)}
      onClick={(e) => e.stopPropagation()}
      className="size-4 cursor-pointer rounded border-slate-300 accent-indigo-600 disabled:cursor-not-allowed disabled:opacity-40"
    />
  );
}
