'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { AlertCircle, History, RefreshCw, Search, SearchX, X } from 'lucide-react';
import type { AuditEntryDto, Page } from '@erp/shared';
import { api, ApiRequestError, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { toQuery } from '@/lib/admin-data';
import { formatDateTime, relativeTime } from '@/lib/format';
import { useDebounced } from '@/lib/use-debounced';
import { useUrlState } from '@/lib/use-url-state';
import { AuditDetailDrawer, targetHref } from '@/components/admin/audit/audit-detail-drawer';
import { AuditFilters } from '@/components/admin/audit/audit-filters';
import { AuditResultBadge } from '@/components/admin/audit/audit-result-badge';
import { actionLabel } from '@/components/admin/audit/audit-timeline';
import { Avatar } from '@/components/admin/avatar';
import { btnSecondary, cardClass, inputClass } from '@/components/admin/buttons';
import { TableShell, Th } from '@/components/admin/data-table';
import { EmptyState } from '@/components/admin/empty-state';
import { ForbiddenState } from '@/components/admin/forbidden-state';
import { Highlight } from '@/components/admin/highlight';
import { PageHeader } from '@/components/admin/page-header';
import { Pagination } from '@/components/admin/pagination';
import { SkeletonRows } from '@/components/admin/skeleton';

const DEFAULTS = {
  search: '',
  action: [] as string[],
  result: '',
  targetType: '',
  targetId: '',
  actorId: '',
  from: '',
  to: '',
  page: '1',
  pageSize: '25',
};

function AuditInner() {
  const { can } = useAuth();
  const [state, patch, reset] = useUrlState(DEFAULTS);
  const [text, setText] = useState(state.search);
  const debounced = useDebounced(text);
  const [data, setData] = useState<Page<AuditEntryDto> | null>(null);
  const [actions, setActions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<AuditEntryDto | null>(null);

  useEffect(() => {
    if (debounced !== state.search) patch({ search: debounced, page: '1' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const query = toQuery({ ...state });
  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api<Page<AuditEntryDto>>(`/audit-logs${query}`)
      .then(setData)
      .catch((e) => {
        if (e instanceof ApiRequestError && e.status === 403) setForbidden(true);
        else setError(errorMessage(e));
      })
      .finally(() => setLoading(false));
  }, [query]);
  useEffect(() => {
    if (can('admin.audit.read')) load();
  }, [load, can]);
  useEffect(() => {
    if (can('admin.audit.read'))
      api<string[]>('/audit-logs/actions')
        .then(setActions)
        .catch(() => undefined);
  }, [can]);

  if (!can('admin.audit.read') || forbidden)
    return <ForbiddenState permission="admin.audit.read" />;

  const filtered = !!(
    state.search ||
    state.action.length ||
    state.result ||
    state.from ||
    state.to ||
    state.actorId ||
    state.targetId
  );

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <PageHeader
        icon={History}
        title="Audit log"
        description="Every administrative change and sign-in event. Entries can't be edited or deleted."
        trail={[{ label: 'Audit log' }]}
      />

      <div className={clsx(cardClass, 'animate-fade-up space-y-3 p-4')}>
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Search a person, email, role or action…"
            className={clsx(inputClass, 'pl-9')}
          />
        </div>
        <AuditFilters
          value={state}
          actions={actions}
          onChange={(p) => patch({ ...p, page: '1' })}
        />
        {(state.actorId || state.targetId) && (
          <div className="flex flex-wrap gap-1.5">
            {state.actorId && (
              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 py-0.5 pr-1 pl-2.5 text-xs font-medium text-indigo-700 ring-1 ring-indigo-200">
                By one person
                <button
                  onClick={() => patch({ actorId: '' })}
                  className="rounded-full p-0.5 hover:bg-indigo-100"
                  aria-label="Remove"
                >
                  <X className="size-3" />
                </button>
              </span>
            )}
            {state.targetId && (
              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 py-0.5 pr-1 pl-2.5 text-xs font-medium text-indigo-700 ring-1 ring-indigo-200">
                About one {state.targetType || 'item'}
                <button
                  onClick={() => patch({ targetId: '', targetType: '' })}
                  className="rounded-full p-0.5 hover:bg-indigo-100"
                  aria-label="Remove"
                >
                  <X className="size-3" />
                </button>
              </span>
            )}
          </div>
        )}
      </div>

      <div className={clsx(cardClass, 'animate-fade-up overflow-hidden [animation-delay:80ms]')}>
        {error ? (
          <EmptyState
            icon={AlertCircle}
            tone="rose"
            title="Couldn't load the audit log"
            description={error}
            action={
              <button className={btnSecondary} onClick={load}>
                <RefreshCw className="size-4" />
                Try again
              </button>
            }
          />
        ) : data && data.total === 0 ? (
          <EmptyState
            icon={filtered ? SearchX : History}
            tone="slate"
            title={filtered ? 'No entries match' : 'Nothing recorded yet'}
            description={
              filtered
                ? 'Widen the date range or remove some filters.'
                : 'Administrative changes will show up here.'
            }
            action={
              filtered && (
                <button
                  className={btnSecondary}
                  onClick={() => {
                    setText('');
                    reset();
                  }}
                >
                  Clear filters
                </button>
              )
            }
          />
        ) : (
          <>
            <TableShell minWidth="min-w-[760px]">
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>Who</Th>
                  <Th>What</Th>
                  <Th>Target</Th>
                  <Th>Result</Th>
                </tr>
              </thead>
              <tbody className={clsx('transition-opacity', loading && data && 'opacity-60')}>
                {!data ? (
                  <SkeletonRows cols={5} rows={10} />
                ) : (
                  data.items.map((e, i) => {
                    const href = targetHref(e);
                    return (
                      <tr
                        key={e.id}
                        onClick={() => setOpen(e)}
                        style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                        className={clsx(
                          'animate-fade-up cursor-pointer hover:bg-slate-50/80',
                          e.result === 'DENIED' && 'bg-rose-50/30',
                        )}
                      >
                        <td
                          className="border-b border-slate-100 px-4 py-2.5 whitespace-nowrap text-slate-600"
                          title={formatDateTime(e.createdAt)}
                        >
                          {relativeTime(e.createdAt)}
                        </td>
                        <td className="border-b border-slate-100 px-4 py-2.5">
                          {e.actorId ? (
                            <span className="flex items-center gap-2">
                              <Avatar id={e.actorId} name={e.actorName ?? '?'} size="sm" />
                              <span className="truncate text-slate-800">
                                <Highlight text={e.actorName} query={state.search} />
                              </span>
                            </span>
                          ) : (
                            <span className="text-slate-400">System</span>
                          )}
                        </td>
                        <td className="border-b border-slate-100 px-4 py-2.5">
                          <span className="font-medium text-slate-900">
                            {actionLabel(e.action)}
                          </span>
                          <code className="block text-[11px] text-slate-400">
                            <Highlight text={e.action} query={state.search} />
                          </code>
                        </td>
                        <td className="max-w-[260px] truncate border-b border-slate-100 px-4 py-2.5 text-slate-600">
                          {href ? (
                            <Link
                              href={href}
                              onClick={(ev) => ev.stopPropagation()}
                              className="hover:text-indigo-700 hover:underline"
                            >
                              <Highlight text={e.targetLabel ?? e.entity} query={state.search} />
                            </Link>
                          ) : (
                            <Highlight text={e.targetLabel ?? e.entity} query={state.search} />
                          )}
                        </td>
                        <td className="border-b border-slate-100 px-4 py-2.5">
                          <AuditResultBadge result={e.result} />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </TableShell>
            {data && (
              <Pagination
                page={data.page}
                pageSize={data.pageSize}
                total={data.total}
                noun="entries"
                onPage={(p) => patch({ page: String(p) })}
                onPageSize={(s) => patch({ pageSize: String(s), page: '1' })}
              />
            )}
          </>
        )}
      </div>
      <AuditDetailDrawer entry={open} onClose={() => setOpen(null)} />
    </div>
  );
}

export default function AuditPage() {
  return (
    <Suspense>
      <AuditInner />
    </Suspense>
  );
}
