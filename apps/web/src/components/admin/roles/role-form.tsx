'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import {
  Check,
  Copy,
  FileStack,
  Loader2,
  LockKeyhole,
  Save,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import {
  isPrivileged,
  ROLE_COLORS,
  type PermissionMatrix,
  type RoleColor,
  type RoleDetail,
  type RoleImpact,
  type RoleListItem,
  type RoleTemplate,
} from '@erp/shared';
import { api, ApiRequestError, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { invalidateRoles } from '@/lib/admin-data';
import { btnPrimary, btnSecondary, fieldClass, inputClass } from '../buttons';
import { Card } from '../card';
import { Field } from '../field';
import { roleColor } from '../role-colors';
import { SuccessCheck } from '../success-check';
import { useToast } from '../toast';
import { ImpactDialog } from './impact-dialog';
import { PermissionChecklist } from './permission-checklist';

type Source = 'blank' | 'clone' | 'template';

/** Create or edit a role. Edits show an impact preview before saving. */
export function RoleForm({
  role,
  initialCloneId,
  onSaved,
  readOnly = false,
}: {
  role?: RoleDetail;
  /** View-only (no admin.role.update). */
  readOnly?: boolean;
  initialCloneId?: string;
  onSaved?: () => void;
}) {
  const isEdit = !!role;
  const router = useRouter();
  const toast = useToast();
  const { can } = useAuth();
  const canPerms = can('admin.permission.manage');
  const locked = !!role?.isProtected || readOnly;

  const [modules, setModules] = useState<PermissionMatrix['modules'] | null>(null);
  const [roles, setRoles] = useState<RoleListItem[]>([]);
  const [templates, setTemplates] = useState<RoleTemplate[]>([]);
  const [source, setSource] = useState<Source>(initialCloneId ? 'clone' : 'blank');
  const [sourceId, setSourceId] = useState(initialCloneId ?? '');
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [color, setColor] = useState<RoleColor>(role?.color ?? 'violet');
  const [category, setCategory] = useState(role?.category ?? '');
  const [perms, setPerms] = useState<Set<string>>(new Set(role?.permissions ?? []));
  const [errors, setErrors] = useState<{ name?: string; general?: string }>({});
  const [busy, setBusy] = useState(false);
  const [impact, setImpact] = useState<RoleImpact | null>(null);
  const [impactOpen, setImpactOpen] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    api<PermissionMatrix['modules']>('/permissions')
      .then(setModules)
      .catch(() => setModules([]));
    if (!isEdit) {
      api<{ items: RoleListItem[] }>('/roles?pageSize=100')
        .then((p) => setRoles(p.items))
        .catch(() => undefined);
      api<RoleTemplate[]>('/roles/templates')
        .then(setTemplates)
        .catch(() => undefined);
    }
  }, [isEdit]);

  // Starting point → permissions (and a suggested name).
  useEffect(() => {
    if (isEdit || !sourceId) return;
    if (source === 'template') {
      const t = templates.find((x) => x.key === sourceId);
      if (t) {
        setPerms(new Set(t.permissions));
        setName((n) => n || t.name);
        setDescription((d) => d || t.description);
      }
    } else if (source === 'clone') {
      api<RoleDetail>(`/roles/${sourceId}`)
        .then((r) => {
          setPerms(new Set(r.permissions));
          setName((n) => n || `${r.name} (copy)`);
          setDescription((d) => d || r.description);
          setColor(r.color);
        })
        .catch(() => undefined);
    }
  }, [source, sourceId, templates, isEdit]);

  const baseline = useMemo(() => new Set(role?.permissions ?? []), [role]);
  const privileged = isPrivileged(perms);
  const permsChanged =
    isEdit && (perms.size !== baseline.size || [...perms].some((p) => !baseline.has(p)));
  const c = roleColor(color);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const n = name.trim();
    if (n.length < 2 || n.length > 60) {
      setErrors({ name: 'Use 2 to 60 characters.' });
      return;
    }
    if (isEdit && permsChanged) {
      setImpact(null);
      setImpactOpen(true);
      try {
        setImpact(
          await api<RoleImpact>(`/roles/${role!.id}/impact`, {
            method: 'POST',
            body: JSON.stringify({ permissions: [...perms] }),
          }),
        );
      } catch (err) {
        setImpactOpen(false);
        toast.error('Could not preview the change', errorMessage(err));
      }
      return;
    }
    save();
  }

  async function save() {
    setBusy(true);
    setErrors({});
    try {
      const body = {
        name: name.trim(),
        description: description.trim(),
        color,
        category: category.trim() || null,
      };
      let id = role?.id;
      if (isEdit) {
        await api(`/roles/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            ...body,
            version: role!.version,
            ...(permsChanged ? { permissions: [...perms] } : {}),
          }),
        });
      } else {
        id = (
          await api<RoleDetail>('/roles', {
            method: 'POST',
            body: JSON.stringify({ ...body, permissions: canPerms ? [...perms] : [] }),
          })
        ).id;
      }
      invalidateRoles();
      setImpactOpen(false);
      setDone(true);
      toast.success(isEdit ? 'Role saved' : 'Role created');
      setTimeout(() => {
        setDone(false);
        if (isEdit) onSaved?.();
        else router.push(`/admin/roles/${id}`);
      }, 900);
    } catch (err) {
      setImpactOpen(false);
      if (
        err instanceof ApiRequestError &&
        err.status === 409 &&
        /changed by someone else/i.test(err.message)
      ) {
        toast.show({
          tone: 'error',
          title: 'Someone else changed this role',
          description: 'Your edits were not saved. Reload to see the latest version.',
          action: { label: 'Reload', onClick: () => onSaved?.() },
          duration: 0,
        });
      } else if (
        err instanceof ApiRequestError &&
        err.status === 409 &&
        /name/i.test(err.message)
      ) {
        setErrors({ name: err.message });
      } else {
        setErrors({ general: errorMessage(err) });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      {done && (
        <div className="animate-fade-in fixed inset-0 z-40 grid place-items-center bg-white/70 backdrop-blur-sm">
          <SuccessCheck className="size-20" />
        </div>
      )}
      {role?.isProtected && (
        <div className="flex items-center gap-3 rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-violet-50 p-4 text-sm text-indigo-900">
          <LockKeyhole className="size-5 shrink-0" />
          The Admin role always has every permission and can&apos;t be changed. Assign it sparingly.
        </div>
      )}
      {readOnly && !role?.isProtected && (
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          <LockKeyhole className="size-5 shrink-0" />
          You can view this role but not change it.
        </div>
      )}
      {errors.general && (
        <div
          role="alert"
          className="animate-shake rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          {errors.general}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className="space-y-6 xl:sticky xl:top-4 xl:self-start">
          {!isEdit && (
            <Card icon={Sparkles} title="Start from" className="animate-fade-up">
              <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1">
                {(
                  [
                    ['blank', 'Blank', FileStack],
                    ['clone', 'Copy', Copy],
                    ['template', 'Template', Sparkles],
                  ] as const
                ).map(([k, label, Icon]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      setSource(k);
                      setSourceId('');
                      if (k === 'blank') setPerms(new Set());
                    }}
                    className={clsx(
                      'flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition',
                      source === k
                        ? 'bg-white text-indigo-700 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900',
                    )}
                  >
                    <Icon className="size-3.5" />
                    {label}
                  </button>
                ))}
              </div>
              {source !== 'blank' && (
                <select
                  value={sourceId}
                  onChange={(e) => setSourceId(e.target.value)}
                  className={clsx(fieldClass, 'animate-fade-in mt-3 w-full')}
                >
                  <option value="">
                    {source === 'clone' ? 'Choose a role to copy…' : 'Choose a template…'}
                  </option>
                  {source === 'clone'
                    ? roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))
                    : templates.map((t) => (
                        <option key={t.key} value={t.key}>
                          {t.name} — {t.description}
                        </option>
                      ))}
                </select>
              )}
            </Card>
          )}

          <Card title="Details" className="animate-fade-up">
            <div className="space-y-4">
              <Field
                label="Name"
                required
                error={errors.name}
                hint={role?.type === 'SYSTEM' ? 'System roles keep their name.' : undefined}
              >
                <input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setErrors((x) => ({ ...x, name: undefined }));
                  }}
                  disabled={locked || role?.type === 'SYSTEM'}
                  maxLength={60}
                  className={inputClass}
                />
              </Field>
              <Field label="Description" optional>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={locked}
                  rows={3}
                  maxLength={500}
                  className={inputClass}
                />
              </Field>
              <Field label="Category" optional hint="Groups roles in lists, e.g. Finance.">
                <input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  disabled={locked}
                  maxLength={60}
                  className={inputClass}
                />
              </Field>
              <div className="space-y-1.5">
                <span className="block text-sm font-medium text-slate-700">Colour</span>
                <div className="flex flex-wrap gap-2">
                  {ROLE_COLORS.map((k) => {
                    const cc = roleColor(k);
                    return (
                      <button
                        key={k}
                        type="button"
                        disabled={locked}
                        onClick={() => setColor(k)}
                        aria-label={k}
                        aria-pressed={color === k}
                        className={clsx(
                          'grid size-8 place-items-center rounded-full bg-gradient-to-br text-white shadow-sm transition hover:scale-110',
                          cc.stripe,
                          color === k && 'ring-2 ring-slate-900/70 ring-offset-2',
                        )}
                      >
                        {color === k && <Check className="animate-pop size-4" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </Card>

          <div
            className={clsx(
              'animate-fade-up overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm',
            )}
          >
            <div className={clsx('h-1.5 bg-gradient-to-r', c.stripe)} />
            <div className="flex items-center gap-4 p-4">
              <div className="text-3xl font-semibold text-slate-900 tabular-nums">{perms.size}</div>
              <div className="text-sm text-slate-500">
                permission{perms.size === 1 ? '' : 's'}
                {isEdit && permsChanged && (
                  <span className="block text-xs font-medium text-indigo-600">unsaved changes</span>
                )}
              </div>
            </div>
            {privileged && (
              <div className="animate-fade-in flex gap-2 border-t border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <ShieldAlert className="size-4 shrink-0" />
                Privileged role: holders get administration rights and must use two-step
                verification.
              </div>
            )}
          </div>
        </div>

        <Card
          title="Permissions"
          description={
            role?.isProtected
              ? 'Every permission, always.'
              : readOnly
                ? 'What people with this role may do.'
                : canPerms
                  ? 'Tick what people with this role may do.'
                  : 'You need “Manage permissions” to change these.'
          }
          className="animate-fade-up [animation-delay:80ms]"
        >
          <PermissionChecklist
            modules={modules}
            value={perms}
            onChange={setPerms}
            disabled={locked || !canPerms}
            baseline={isEdit ? baseline : undefined}
          />
        </Card>
      </div>

      {!locked && (
        <div className="sticky bottom-0 z-20 -mx-4 flex items-center justify-end gap-2 border-t border-slate-200 bg-white/80 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
          {isEdit ? (
            <button
              type="button"
              className={btnSecondary}
              onClick={() => {
                setPerms(new Set(baseline));
                setName(role!.name);
                setDescription(role!.description);
                setColor(role!.color);
                setCategory(role!.category ?? '');
              }}
            >
              Discard
            </button>
          ) : (
            <Link href="/admin/roles" className={btnSecondary}>
              Cancel
            </Link>
          )}
          <button type="submit" className={btnPrimary} disabled={busy || done}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {isEdit ? 'Save role' : 'Create role'}
          </button>
        </div>
      )}

      {role && (
        <ImpactDialog
          open={impactOpen}
          roleName={role.name}
          impact={impact}
          busy={busy}
          onConfirm={save}
          onClose={() => setImpactOpen(false)}
        />
      )}
    </form>
  );
}
