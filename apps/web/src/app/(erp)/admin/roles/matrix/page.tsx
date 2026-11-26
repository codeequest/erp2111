'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { AlertCircle, Grid3x3, RefreshCw, RotateCcw, Save, Search } from 'lucide-react';
import type { PermissionMatrix } from '@erp/shared';
import { api, ApiRequestError, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { invalidateRoles } from '@/lib/admin-data';
import {
  btnPrimary,
  btnSecondary,
  cardClass,
  fieldClass,
  inputClass,
} from '@/components/admin/buttons';
import { EmptyState } from '@/components/admin/empty-state';
import { ForbiddenState } from '@/components/admin/forbidden-state';
import { PageHeader } from '@/components/admin/page-header';
import { Skeleton } from '@/components/admin/skeleton';
import { useToast } from '@/components/admin/toast';
import {
  MatrixReviewDialog,
  type MatrixChange,
} from '@/components/admin/roles/matrix-review-dialog';
import { PermissionMatrixTable } from '@/components/admin/roles/permission-matrix';

const toSets = (m: PermissionMatrix) => new Map(m.roles.map((r) => [r.id, new Set(r.permissions)]));

export default function MatrixPage() {
  const { can, reload } = useAuth();
  const toast = useToast();
  const [matrix, setMatrix] = useState<PermissionMatrix | null>(null);
  const [server, setServer] = useState<Map<string, Set<string>>>(new Map());
  const [local, setLocal] = useState<Map<string, Set<string>>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [mod, setMod] = useState('');
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const editable = can('admin.permission.manage');

  const apply = (m: PermissionMatrix) => {
    setMatrix(m);
    setServer(toSets(m));
    setLocal(toSets(m));
  };
  const load = useCallback(() => {
    setError(null);
    api<PermissionMatrix>('/permissions/matrix')
      .then(apply)
      .catch((e) =>
        setError(e instanceof ApiRequestError && e.status === 403 ? 'forbidden' : errorMessage(e)),
      );
  }, []);
  useEffect(() => {
    if (can('admin.role.view')) load();
  }, [load, can]);

  const changes: MatrixChange[] = useMemo(() => {
    if (!matrix) return [];
    return matrix.roles
      .filter((r) => {
        const a = server.get(r.id)!;
        const b = local.get(r.id)!;
        return a.size !== b.size || [...a].some((x) => !b.has(x));
      })
      .map((r) => ({
        role: { id: r.id, name: r.name, color: r.color },
        permissions: [...local.get(r.id)!],
      }));
  }, [matrix, server, local]);

  const cellChanges = useMemo(() => {
    let n = 0;
    for (const [id, b] of local) {
      const a = server.get(id)!;
      for (const x of b) if (!a.has(x)) n++;
      for (const x of a) if (!b.has(x)) n++;
    }
    return n;
  }, [local, server]);

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    if (cellChanges === 0) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [cellChanges]);

  const modules = useMemo(() => {
    if (!matrix) return [];
    const term = q.trim().toLowerCase();
    return matrix.modules
      .filter((m) => !mod || m.key === mod)
      .map((m) => ({
        ...m,
        permissions: m.permissions.filter(
          (p) => !term || p.label.toLowerCase().includes(term) || p.code.includes(term),
        ),
      }))
      .filter((m) => m.permissions.length > 0);
  }, [matrix, q, mod]);

  if (!can('admin.role.view') || error === 'forbidden')
    return <ForbiddenState permission="admin.role.view" />;

  const onChange = (roleId: string, codes: string[], on: boolean) =>
    setLocal((prev) => {
      const next = new Map(prev);
      const s = new Set(next.get(roleId));
      codes.forEach((c) => (on ? s.add(c) : s.delete(c)));
      next.set(roleId, s);
      return next;
    });

  async function save() {
    if (!matrix) return;
    setBusy(true);
    try {
      const body = {
        roles: changes.map((c) => ({
          id: c.role.id,
          version: matrix.roles.find((r) => r.id === c.role.id)!.version,
          permissions: c.permissions,
        })),
      };
      apply(
        await api<PermissionMatrix>('/permissions/matrix', {
          method: 'PUT',
          body: JSON.stringify(body),
        }),
      );
      invalidateRoles();
      reload();
      setReview(false);
      toast.success(
        'Permissions saved',
        `${changes.length} role${changes.length === 1 ? '' : 's'} updated.`,
      );
    } catch (e) {
      setReview(false);
      if (
        e instanceof ApiRequestError &&
        e.status === 409 &&
        /changed by someone else/i.test(e.message)
      ) {
        toast.show({
          tone: 'error',
          title: 'Someone else changed these roles',
          description:
            'Nothing was saved. Your edits are still here — reload to see the latest, then redo them.',
          action: { label: 'Reload (discard my edits)', onClick: load },
          duration: 0,
        });
      } else {
        toast.error('Could not save', errorMessage(e));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 pb-24">
      <PageHeader
        icon={Grid3x3}
        title="Permission matrix"
        description={
          editable
            ? 'Every role against every permission. Click to change, then review and save.'
            : 'Every role against every permission (read-only).'
        }
        trail={[{ label: 'Roles', href: '/admin/roles' }, { label: 'Matrix' }]}
      />

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find a permission"
            className={clsx(inputClass, 'pl-9')}
          />
        </div>
        <select
          value={mod}
          onChange={(e) => setMod(e.target.value)}
          className={fieldClass}
          aria-label="Module"
        >
          <option value="">All modules</option>
          {matrix?.modules.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <div className={clsx(cardClass, 'animate-fade-up overflow-hidden')}>
        {error ? (
          <EmptyState
            icon={AlertCircle}
            tone="rose"
            title="Couldn't load the matrix"
            description={error}
            action={
              <button className={btnSecondary} onClick={load}>
                <RefreshCw className="size-4" />
                Try again
              </button>
            }
          />
        ) : !matrix ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 10 }, (_, i) => (
              <Skeleton key={i} className="h-9" />
            ))}
          </div>
        ) : modules.length === 0 ? (
          <EmptyState icon={Search} tone="slate" title="No permission matches" />
        ) : (
          <PermissionMatrixTable
            modules={modules}
            roles={matrix.roles}
            value={local}
            server={server}
            editable={editable}
            query={q}
            onChange={onChange}
          />
        )}
      </div>

      {cellChanges > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
          <div className="animate-toast-in pointer-events-auto flex items-center gap-2 rounded-2xl bg-slate-900/95 p-1.5 pl-4 text-white shadow-2xl ring-1 ring-white/10 backdrop-blur">
            <span className="text-sm whitespace-nowrap">
              <span className="font-semibold text-amber-300 tabular-nums">{cellChanges}</span>{' '}
              unsaved change{cellChanges === 1 ? '' : 's'}
              <span className="hidden text-slate-400 sm:inline">
                {' '}
                · {changes.length} role{changes.length === 1 ? '' : 's'}
              </span>
            </span>
            <button
              onClick={() => setLocal(new Map([...server].map(([k, v]) => [k, new Set(v)])))}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-slate-300 hover:bg-white/10 hover:text-white"
            >
              <RotateCcw className="size-4" />
              Discard
            </button>
            <button onClick={() => setReview(true)} className={clsx(btnPrimary, 'py-1.5')}>
              <Save className="size-4" />
              Review & save
            </button>
          </div>
        </div>
      )}

      <MatrixReviewDialog
        open={review}
        changes={changes}
        busy={busy}
        onConfirm={save}
        onClose={() => setReview(false)}
      />
    </div>
  );
}
