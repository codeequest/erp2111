'use client';

import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { ArrowRight, ChevronRight, History } from 'lucide-react';
import type { Paginated, StockMoveItem, StockMoveTypeCode } from '@erp/shared';
import { useApiData } from '@/lib/use-api-data';
import { formatDateTime, formatDecimal, isNegative } from '@/lib/inventory';
import { EmptyState, SkeletonRows } from '@/components/ui';

interface Doc {
  reference: string;
  createdAt: string;
  createdBy: string;
  reason: string | null;
  rows: StockMoveItem[];
}

/**
 * The latest stock documents of some types, rebuilt from the ledger (one card
 * per reference). Change `version` to reload after posting a new one.
 */
export function RecentDocuments({
  types,
  title,
  emptyText,
  version,
  highlight,
}: {
  types: StockMoveTypeCode[];
  title: string;
  emptyText: string;
  version: number;
  highlight?: string | null;
}) {
  const { data, loading, reload } = useApiData<Paginated<StockMoveItem>>(
    `/inventory/stock/moves?type=${types.join(',')}&pageSize=200`,
  );
  useEffect(() => {
    if (version > 0) void reload();
  }, [version, reload]);
  const [open, setOpen] = useState<string | null>(null);

  const docs = useMemo(() => {
    const map = new Map<string, Doc>();
    for (const m of data?.items ?? []) {
      const ref = m.reference ?? m.id;
      const doc = map.get(ref) ?? {
        reference: ref,
        createdAt: m.createdAt,
        createdBy: m.createdBy,
        reason: m.reason,
        rows: [],
      };
      doc.rows.push(m);
      map.set(ref, doc);
    }
    return [...map.values()].slice(0, 15);
  }, [data]);

  return (
    <section
      className="animate-fade-up overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs"
      style={{ animationDelay: '160ms' }}
    >
      <header className="flex items-center gap-2 border-b border-slate-100 px-5 py-3.5">
        <History className="size-4 text-slate-400" />
        <h2 className="font-semibold text-slate-900">{title}</h2>
      </header>
      {loading && !data ? (
        <SkeletonRows rows={3} />
      ) : docs.length === 0 ? (
        <EmptyState icon={History} title="Nothing posted yet" text={emptyText} />
      ) : (
        <ul className="divide-y divide-slate-100">
          {docs.map((doc, i) => {
            const out = doc.rows.find((r) => r.type === 'TRANSFER_OUT');
            const into = doc.rows.find((r) => r.type === 'TRANSFER_IN');
            const items = out ? doc.rows.filter((r) => r.type === 'TRANSFER_OUT') : doc.rows;
            const expanded = open === doc.reference;
            return (
              <li
                key={doc.reference}
                className={clsx(
                  'animate-fade-up transition-colors',
                  highlight === doc.reference && 'bg-emerald-50/60',
                )}
                style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}
              >
                <button
                  onClick={() => setOpen(expanded ? null : doc.reference)}
                  aria-expanded={expanded}
                  className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-left hover:bg-slate-50/70"
                >
                  <ChevronRight
                    className={clsx(
                      'size-4 text-slate-400 transition-transform',
                      expanded && 'rotate-90',
                    )}
                  />
                  <span className="font-mono text-sm font-semibold text-slate-800">
                    {doc.reference}
                  </span>
                  {out && into ? (
                    <span className="flex items-center gap-1.5 text-sm text-slate-600">
                      <Code>{out.warehouse.code}</Code>
                      <ArrowRight className="size-3.5 text-slate-400" />
                      <Code>{into.warehouse.code}</Code>
                    </span>
                  ) : (
                    <Code>{doc.rows[0].warehouse.code}</Code>
                  )}
                  <span className="text-sm text-slate-500">
                    {items.length} {items.length === 1 ? 'line' : 'lines'}
                  </span>
                  {doc.reason && (
                    <span className="truncate text-sm text-slate-500 italic">“{doc.reason}”</span>
                  )}
                  <span className="ml-auto text-xs text-slate-400">
                    {formatDateTime(doc.createdAt)} · {doc.createdBy}
                  </span>
                </button>
                {expanded && (
                  <div className="animate-fade-in px-5 pb-3 pl-13">
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-slate-50">
                        {items.map((r) => (
                          <tr key={r.id}>
                            <td className="py-1.5 text-slate-700">
                              {r.product.name}{' '}
                              <span className="font-mono text-xs text-slate-400">
                                {r.product.sku}
                              </span>
                            </td>
                            <td
                              className={clsx(
                                'py-1.5 text-right font-medium tabular-nums',
                                out
                                  ? 'text-slate-700'
                                  : isNegative(r.quantity)
                                    ? 'text-red-600'
                                    : 'text-emerald-700',
                              )}
                            >
                              {out
                                ? formatDecimal(r.quantity.replace('-', ''))
                                : (isNegative(r.quantity) ? '' : '+') +
                                  formatDecimal(r.quantity)}{' '}
                              <span className="text-xs font-normal text-slate-400">
                                {r.product.baseUnitCode}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 font-mono text-xs font-semibold text-mod-inventory ring-1 ring-emerald-200/60">
      {children}
    </span>
  );
}
