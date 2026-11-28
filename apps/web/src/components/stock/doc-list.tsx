'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Loader2, Plus, Search } from 'lucide-react';
import type { Paginated, StockDocumentStatus } from '@erp/shared';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { Breadcrumbs, ErrorBox, btnPrimary, btnSecondary, fieldClass } from '@/components/products/ui';
import { DocStatusBadge, STATUS_FILTERS, useWarehouses } from './stock-ui';

import { tr } from '@/lib/i18n';
interface DocRow {
  id: string;
  number: string;
  status: StockDocumentStatus;
  createdAt: string;
  postedAt: string | null;
  createdBy: string;
  lineCount: number;
}

export interface DocColumn<T> {
  header: string;
  cell: (row: T) => React.ReactNode;
}

/** List screen shared by adjustments and transfers: filters, table, pagination. */
export function StockDocList<T extends DocRow>({
  title,
  subtitle,
  apiPath,
  basePath,
  newLabel,
  canCreate,
  columns,
  emptyText,
}: {
  title: string;
  subtitle: string;
  apiPath: string;
  basePath: string;
  newLabel: string;
  canCreate: boolean;
  columns: DocColumn<T>[];
  emptyText: string;
}) {
  const router = useRouter();
  const { warehouses } = useWarehouses();
  const [status, setStatus] = useState<'' | StockDocumentStatus>('');
  const [warehouseId, setWarehouseId] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paginated<T> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = new URLSearchParams({ page: String(page), pageSize: '25' });
    if (status) q.set('status', status);
    if (warehouseId) q.set('warehouseId', warehouseId);
    if (search.trim()) q.set('search', search.trim());
    setLoading(true);
    const timer = setTimeout(() => {
      api<Paginated<T>>(`${apiPath}?${q}`)
        .then((d) => {
          setData(d);
          setError(null);
        })
        .catch((e: Error) => setError(e.message))
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(timer);
  }, [apiPath, status, warehouseId, search, page]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Breadcrumbs trail={[{ label: title }]} />
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">{title}</h1>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>
        {canCreate && (
          <Link href={`${basePath}/new`} className={btnPrimary}>
            <Plus className="size-4" /> {newLabel}
          </Link>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={tr("Search by number")}
            className={`${fieldClass} w-full ps-9`}
            aria-label={tr("Search by number")}
          />
        </div>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as '' | StockDocumentStatus);
            setPage(1);
          }}
          className={fieldClass}
          aria-label={tr("Status")}
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          value={warehouseId}
          onChange={(e) => {
            setWarehouseId(e.target.value);
            setPage(1);
          }}
          className={fieldClass}
          aria-label={tr("Warehouse")}
        >
          <option value="">{tr("All warehouses")}</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.code} — {w.name}
            </option>
          ))}
        </select>
      </div>

      {error && <ErrorBox message={error} />}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-start text-xs font-medium text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-2.5">{tr("Number")}</th>
                <th className="px-4 py-2.5">{tr("Status")}</th>
                {columns.map((c) => (
                  <th key={c.header} className="px-4 py-2.5">
                    {c.header}
                  </th>
                ))}
                <th className="px-4 py-2.5 text-end">{tr("Lines")}</th>
                <th className="px-4 py-2.5">{tr("Created")}</th>
                <th className="px-4 py-2.5">{tr("Validated")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data?.items.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => router.push(`${basePath}/${row.id}`)}
                  className="cursor-pointer hover:bg-slate-50"
                >
                  <td className="px-4 py-2.5 font-mono text-xs font-medium">
                    <Link href={`${basePath}/${row.id}`} onClick={(e) => e.stopPropagation()}>
                      {row.number}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <DocStatusBadge status={row.status} />
                  </td>
                  {columns.map((c) => (
                    <td key={c.header} className="px-4 py-2.5">
                      {c.cell(row)}
                    </td>
                  ))}
                  <td className="px-4 py-2.5 text-end tabular-nums">{row.lineCount}</td>
                  <td className="px-4 py-2.5 text-slate-500">
                    {formatDateTime(row.createdAt)}
                    <span className="block text-xs">{row.createdBy}</span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">
                    {row.postedAt ? formatDateTime(row.postedAt) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading && !data && (
          <p className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-slate-500">
            <Loader2 className="size-4 animate-spin" /> {' '}{tr("Loading…")}</p>
        )}
        {data?.items.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-slate-500">{emptyText}</p>
        )}
        {data && data.total > data.pageSize && (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2 text-sm text-slate-600">
            <span>
              {tr("Page")}{' '}{data.page} {' '}{tr("of")}{' '}{pages} · {data.total} {' '}{tr("documents")}</span>
            <span className="flex gap-2">
              <button
                onClick={() => setPage((p) => p - 1)}
                disabled={page <= 1}
                className={btnSecondary}
                aria-label={tr("Previous page")}
              >
                <ChevronLeft className="rtl:-scale-x-100 size-4" />
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= pages}
                className={btnSecondary}
                aria-label={tr("Next page")}
              >
                <ChevronRight className="rtl:-scale-x-100 size-4" />
              </button>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
