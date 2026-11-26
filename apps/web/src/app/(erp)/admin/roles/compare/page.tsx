'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { AlertCircle, Check, GitCompareArrows, Minus, ShieldAlert } from 'lucide-react';
import { NAVIGATION, type RoleCompare, type RoleListItem } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { toQuery } from '@/lib/admin-data';
import { useUrlState } from '@/lib/use-url-state';
import { RoleChip } from '@/components/admin/badges';
import { btnSecondary } from '@/components/admin/buttons';
import { Card } from '@/components/admin/card';
import { EmptyState } from '@/components/admin/empty-state';
import { ForbiddenState } from '@/components/admin/forbidden-state';
import { PageHeader } from '@/components/admin/page-header';
import { roleColor } from '@/components/admin/role-colors';
import { Skeleton } from '@/components/admin/skeleton';

const MODULE_LABEL = new Map<string, string>(NAVIGATION.map((m) => [m.key, m.label]));
const DEFAULTS = { ids: [] as string[], all: '' };

function CompareInner() {
  const { can } = useAuth();
  const [state, patch] = useUrlState(DEFAULTS);
  const [data, setData] = useState<RoleCompare | null>(null);
  const [roles, setRoles] = useState<RoleListItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ items: RoleListItem[] }>('/roles?pageSize=100')
      .then((p) => setRoles(p.items))
      .catch(() => undefined);
  }, []);
  const key = state.ids.join(',') + state.all;
  useEffect(() => {
    setError(null);
    if (state.ids.length < 2) {
      setData(null);
      return;
    }
    api<RoleCompare>(`/roles/compare${toQuery({ ids: state.ids, all: state.all })}`)
      .then(setData)
      .catch((e) => setError(errorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const groups = useMemo(() => {
    const by = new Map<string, RoleCompare['rows']>();
    (data?.rows ?? []).forEach((r) => by.set(r.module, [...(by.get(r.module) ?? []), r]));
    return [...by.entries()];
  }, [data]);

  if (!can('admin.role.view')) return <ForbiddenState permission="admin.role.view" />;

  const toggle = (id: string) =>
    patch({
      ids: state.ids.includes(id)
        ? state.ids.filter((x) => x !== id)
        : state.ids.length >= 4
          ? state.ids
          : [...state.ids, id],
    });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        icon={GitCompareArrows}
        title="Compare roles"
        description="See exactly where 2 to 4 roles differ."
        trail={[{ label: 'Roles', href: '/admin/roles' }, { label: 'Compare' }]}
      />

      <Card title="Roles to compare" description="Pick 2 to 4." className="animate-fade-up">
        <div className="flex flex-wrap gap-2">
          {roles.map((r) => {
            const on = state.ids.includes(r.id);
            const c = roleColor(r.color);
            return (
              <button
                key={r.id}
                onClick={() => toggle(r.id)}
                disabled={!on && state.ids.length >= 4}
                className={clsx(
                  'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition disabled:opacity-40',
                  on
                    ? clsx(c.chip, 'ring-2')
                    : 'bg-white text-slate-600 ring-slate-200 hover:ring-slate-300',
                )}
              >
                <span className={clsx('size-2 rounded-full', c.dot)} />
                {r.name}
                {on && <Check className="animate-pop size-3.5" />}
              </button>
            );
          })}
        </div>
      </Card>

      {state.ids.length < 2 ? (
        <EmptyState
          icon={GitCompareArrows}
          title="Pick at least two roles"
          description="Differences show up here as soon as you choose."
        />
      ) : error ? (
        <EmptyState icon={AlertCircle} tone="rose" title="Couldn't compare" description={error} />
      ) : !data ? (
        <Skeleton className="h-80 rounded-xl" />
      ) : (
        <Card
          title={
            state.all
              ? 'All permissions'
              : `${data.rows.length} difference${data.rows.length === 1 ? '' : 's'}`
          }
          bodyClassName="p-0"
          className="animate-fade-up"
          actions={
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={!!state.all}
                onChange={(e) => patch({ all: e.target.checked ? 'true' : '' })}
                className="size-4 accent-indigo-600"
              />
              Show identical too
            </label>
          }
        >
          {data.rows.length === 0 ? (
            <EmptyState
              icon={Check}
              title="These roles grant exactly the same permissions"
              className="py-10"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    <th className="sticky top-0 left-0 z-20 border-b border-slate-200 bg-slate-50 px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">
                      Permission
                    </th>
                    {data.roles.map((r) => (
                      <th
                        key={r.id}
                        className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-3 py-3 text-center"
                      >
                        <Link href={`/admin/roles/${r.id}`}>
                          <RoleChip role={r} />
                        </Link>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {groups.map(([module, rows]) => (
                    <FragmentRows
                      key={module}
                      module={MODULE_LABEL.get(module) ?? module}
                      rows={rows}
                      span={data.roles.length + 1}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
      <Link href="/admin/roles" className={clsx(btnSecondary, 'w-fit')}>
        Back to roles
      </Link>
    </div>
  );
}

function FragmentRows({
  module,
  rows,
  span,
}: {
  module: string;
  rows: RoleCompare['rows'];
  span: number;
}) {
  return (
    <>
      <tr>
        <td
          colSpan={span}
          className="sticky left-0 border-b border-slate-100 bg-white px-4 pt-4 pb-1.5 text-xs font-semibold tracking-wide text-indigo-600 uppercase"
        >
          {module}
        </td>
      </tr>
      {rows.map((r) => (
        <tr key={r.code} className="hover:bg-slate-50/60">
          <td className="sticky left-0 border-b border-slate-100 bg-white px-4 py-2">
            <span className="flex items-center gap-1.5">
              {r.sensitive && <ShieldAlert className="size-3.5 text-amber-600" />}
              <span className={r.sensitive ? 'font-medium text-amber-900' : 'text-slate-800'}>
                {r.label}
              </span>
            </span>
          </td>
          {r.held.map((h, i) => (
            <td key={i} className="border-b border-slate-100 px-3 py-2 text-center">
              {h ? (
                <span className="inline-grid size-6 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-sm">
                  <Check className="size-3.5" />
                </span>
              ) : (
                <Minus className="mx-auto size-4 text-slate-300" />
              )}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export default function ComparePage() {
  return (
    <Suspense>
      <CompareInner />
    </Suspense>
  );
}
