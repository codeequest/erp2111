'use client';

import clsx from 'clsx';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PAGE_SIZES } from '@erp/shared';
import { fieldClass, iconBtn } from './buttons';

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
  noun = 'items',
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
  noun?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  // A compact window of page numbers around the current one.
  const nums: (number | '…')[] = [];
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - page) <= 1) nums.push(p);
    else if (nums[nums.length - 1] !== '…') nums.push('…');
  }

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-600 sm:flex-row">
      <p className="tabular-nums">
        {total === 0 ? (
          `No ${noun}`
        ) : (
          <>
            <span className="font-medium text-slate-900">{from}</span>–
            <span className="font-medium text-slate-900">{to}</span> of{' '}
            <span className="font-medium text-slate-900">{total.toLocaleString()}</span> {noun}
          </>
        )}
      </p>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-slate-500">
          Rows
          <select
            value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value))}
            className={clsx(fieldClass, 'py-1')}
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <nav className="flex items-center gap-1" aria-label="Pagination">
          <button
            className={iconBtn}
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft className="size-4" />
          </button>
          {nums.map((n, i) =>
            n === '…' ? (
              <span key={`e${i}`} className="hidden px-1 text-slate-400 sm:inline">
                …
              </span>
            ) : (
              <button
                key={n}
                onClick={() => onPage(n)}
                aria-current={n === page ? 'page' : undefined}
                className={clsx(
                  'hidden h-8 min-w-8 rounded-lg px-2 text-sm tabular-nums transition sm:inline-block',
                  n === page
                    ? 'bg-gradient-to-r from-indigo-600 to-violet-600 font-medium text-white shadow-sm'
                    : 'hover:bg-slate-100',
                )}
              >
                {n}
              </button>
            ),
          )}
          <button
            className={iconBtn}
            disabled={page >= pages}
            onClick={() => onPage(page + 1)}
            aria-label="Next page"
          >
            <ChevronRight className="size-4" />
          </button>
        </nav>
      </div>
    </div>
  );
}
