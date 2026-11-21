'use client';

import clsx from 'clsx';
import { ChevronLeft, ChevronRight, Inbox, Loader2, RotateCw } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { Button } from './button';

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  className?: string;
  /** Hide on small screens to keep the table readable on phones. */
  hideOnMobile?: boolean;
  align?: 'left' | 'right' | 'center';
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
  /** Server-side pagination. Omit for small, unpaginated lists. */
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    onPageChange: (page: number) => void;
  };
  toolbar?: React.ReactNode;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  error,
  onRetry,
  emptyMessage,
  onRowClick,
  rowClassName,
  pagination,
  toolbar,
}: DataTableProps<T>) {
  const { t } = useI18n();
  const alignClass = (a?: Column<T>['align']) =>
    a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left';
  const firstLoad = loading && rows === undefined;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      {toolbar && (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3">
          {toolbar}
        </div>
      )}

      <div className="relative overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={clsx(
                    'px-4 py-2.5 whitespace-nowrap',
                    alignClass(c.align),
                    c.hideOnMobile && 'hidden md:table-cell',
                    c.className,
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows?.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={clsx(
                  onRowClick && 'cursor-pointer',
                  'hover:bg-slate-50/70',
                  rowClassName?.(row),
                )}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={clsx(
                      'px-4 py-3 align-middle',
                      alignClass(c.align),
                      c.hideOnMobile && 'hidden md:table-cell',
                      c.className,
                    )}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {firstLoad && (
          <div className="flex justify-center py-16 text-slate-400">
            <Loader2 className="size-6 animate-spin" />
          </div>
        )}
        {/* Light overlay while re-loading (page change, search…) */}
        {loading && !firstLoad && (
          <div className="absolute inset-0 grid place-items-center bg-white/50">
            <Loader2 className="size-5 animate-spin text-slate-400" />
          </div>
        )}
        {!loading && error && (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <p className="text-sm text-red-600">{error}</p>
            {onRetry && (
              <Button variant="secondary" size="sm" icon={RotateCw} onClick={onRetry}>
                {t('common.retry')}
              </Button>
            )}
          </div>
        )}
        {!loading && !error && rows?.length === 0 && (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <Inbox className="size-8 text-slate-300" />
            <p className="mt-2 text-sm text-slate-500">{emptyMessage ?? t('common.empty')}</p>
          </div>
        )}
      </div>

      {pagination && pagination.total > 0 && <Pagination {...pagination} />}
    </div>
  );
}

function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: NonNullable<DataTableProps<unknown>['pagination']>) {
  const { t } = useI18n();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-2.5 text-sm text-slate-500">
      <span>{t('table.range', { from, to, total })}</span>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          icon={ChevronLeft}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label={t('table.previous')}
        />
        <span className="px-2">{t('table.page', { page, pages })}</span>
        <Button
          variant="ghost"
          size="sm"
          icon={ChevronRight}
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
          aria-label={t('table.next')}
        />
      </div>
    </div>
  );
}
