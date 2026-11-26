'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import {
  Briefcase,
  KeyRound,
  Loader2,
  MailPlus,
  Plus,
  Save,
  ShieldAlert,
  ShieldCheck,
  Tags,
  Trash2,
  UserRound,
  UserX,
} from 'lucide-react';
import type { PermissionMatrix, RoleListItem, SecurityPolicyDto, UserDetail } from '@erp/shared';
import { api, ApiRequestError, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { invalidateRoles } from '@/lib/admin-data';
import { btnPrimary, btnSecondary, iconBtn, inputClass } from '../buttons';
import { Card } from '../card';
import { Field, Toggle } from '../field';
import { Modal } from '../modal';
import { RoleChip } from '../badges';
import { SuccessCheck } from '../success-check';
import { useToast } from '../toast';
import { ChangeReview, type ChangeRow } from './change-review';
import { EffectivePermissionsPreview } from './effective-permissions-preview';
import {
  fromExpiresAt,
  RoleAssignmentEditor,
  toExpiresAt,
  type RoleSelection,
} from './role-assignment-editor';

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  username: string;
  phone: string;
  department: string;
  jobTitle: string;
  employeeId: string;
  metadata: { key: string; value: string }[];
  roles: RoleSelection[];
  sendInvitation: boolean;
  requireMfa: boolean;
  createInactive: boolean;
}

type Errors = Partial<Record<keyof FormState | 'general', string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME = /^[a-z0-9._-]{3,40}$/;

function initial(user?: UserDetail): FormState {
  return {
    firstName: user?.firstName ?? '',
    lastName: user?.lastName ?? '',
    email: user?.email ?? '',
    username: user?.username ?? '',
    phone: user?.phone ?? '',
    department: user?.department ?? '',
    jobTitle: user?.jobTitle ?? '',
    employeeId: user?.employeeId ?? '',
    metadata: Object.entries(user?.metadata ?? {}).map(([key, value]) => ({ key, value })),
    roles: (user?.assignments ?? []).map((a) => ({
      roleId: a.role.id,
      expiresOn: fromExpiresAt(a.expiresAt),
    })),
    sendInvitation: true,
    requireMfa: user?.mfaRequired ?? false,
    createInactive: false,
  };
}

function validate(f: FormState): Errors {
  const e: Errors = {};
  if (!f.firstName.trim()) e.firstName = 'Enter a first name.';
  else if (f.firstName.trim().length > 80) e.firstName = 'Use at most 80 characters.';
  if (!f.lastName.trim()) e.lastName = 'Enter a last name.';
  else if (f.lastName.trim().length > 80) e.lastName = 'Use at most 80 characters.';
  if (!EMAIL.test(f.email.trim())) e.email = 'Enter a valid email address.';
  if (f.username.trim() && !USERNAME.test(f.username.trim().toLowerCase())) {
    e.username = '3–40 characters: letters, digits, dot, dash or underscore.';
  }
  const keys = f.metadata.map((m) => m.key.trim()).filter(Boolean);
  if (new Set(keys).size !== keys.length) e.metadata = 'Each custom field needs a different name.';
  if (f.metadata.length > 20) e.metadata = 'At most 20 custom fields.';
  if (f.metadata.some((m) => m.key.trim().length > 40 || m.value.length > 200)) {
    e.metadata = 'Names up to 40 characters, values up to 200.';
  }
  return e;
}

/** Create (invite) or edit a user. */
export function UserForm({ user }: { user?: UserDetail }) {
  const isEdit = !!user;
  const router = useRouter();
  const toast = useToast();
  const { can, user: me } = useAuth();
  const [form, setForm] = useState<FormState>(() => initial(user));
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<ChangeRow[] | null>(null);
  const [done, setDone] = useState(false);
  const [roles, setRoles] = useState<RoleListItem[] | null>(null);
  const [matrix, setMatrix] = useState<PermissionMatrix | null>(null);
  const [policy, setPolicy] = useState<Pick<SecurityPolicyDto, 'requireMfaForPrivileged'>>({
    requireMfaForPrivileged: true,
  });
  const [departments, setDepartments] = useState<string[]>([]);

  const canAssign = can('admin.user.assign_roles') && user?.id !== me?.id;
  const canMfa = !isEdit || can('admin.user.manage_mfa');

  useEffect(() => {
    api<PermissionMatrix>('/permissions/matrix')
      .then((m) => {
        setMatrix(m);
        // Roles with their colours/flags for the picker.
        return api<{ items: RoleListItem[] }>('/roles?pageSize=100');
      })
      .then((p) => setRoles(p.items))
      .catch(() => {
        setRoles([]);
        setMatrix({ modules: [], roles: [] });
      });
    api<string[]>('/users/departments')
      .then(setDepartments)
      .catch(() => undefined);
    if (can('admin.security.view'))
      api<SecurityPolicyDto>('/security/policy')
        .then(setPolicy)
        .catch(() => undefined);
  }, [can]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const pickedRoles = useMemo(
    () => (roles ?? []).filter((r) => form.roles.some((s) => s.roleId === r.id)),
    [roles, form.roles],
  );
  const privileged = pickedRoles.some((r) => r.privileged);
  const mfaForced = privileged && policy.requireMfaForPrivileged;

  const rolesChanged = useMemo(() => {
    const before = initial(user).roles;
    const key = (rs: RoleSelection[]) =>
      JSON.stringify([...rs].sort((a, b) => a.roleId.localeCompare(b.roleId)));
    return key(before) !== key(form.roles);
  }, [form.roles, user]);

  function profilePatch(): Record<string, unknown> {
    const base = initial(user);
    const out: Record<string, unknown> = {};
    for (const k of [
      'firstName',
      'lastName',
      'email',
      'username',
      'phone',
      'department',
      'jobTitle',
      'employeeId',
    ] as const) {
      const v = form[k].trim();
      if (!isEdit || v !== base[k])
        out[k] = k === 'email' || k === 'username' ? v.toLowerCase() : v;
    }
    const meta = Object.fromEntries(
      form.metadata.filter((m) => m.key.trim()).map((m) => [m.key.trim(), m.value]),
    );
    if (!isEdit || JSON.stringify(meta) !== JSON.stringify(user?.metadata ?? {}))
      out.metadata = meta;
    if (canMfa && (!isEdit || form.requireMfa !== user?.mfaRequired))
      out.requireMfa = form.requireMfa || mfaForced;
    return out;
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length) return;

    if (isEdit) {
      const rows: ChangeRow[] = [];
      if (form.email.trim().toLowerCase() !== user!.email) {
        rows.push({ label: 'Email', before: user!.email, after: form.email.trim().toLowerCase() });
      }
      if (rolesChanged && canAssign) {
        const name = (id: string) => roles?.find((r) => r.id === id)?.name ?? '…';
        rows.push({
          label: 'Roles',
          before: user!.assignments.map((a) => a.role.name).join(', ') || 'None',
          after:
            form.roles
              .map((r) => name(r.roleId) + (r.expiresOn ? ` (until ${r.expiresOn})` : ''))
              .join(', ') || 'None',
        });
      }
      if (rows.length) {
        setReview(rows);
        return;
      }
    }
    save();
  }

  async function save() {
    setBusy(true);
    setErrors({});
    try {
      const rolesBody = form.roles.map((r) => ({
        roleId: r.roleId,
        expiresAt: toExpiresAt(r.expiresOn),
      }));
      let id = user?.id;
      if (!isEdit) {
        const body = {
          ...profilePatch(),
          ...(canAssign && rolesBody.length ? { roles: rolesBody } : {}),
          sendInvitation: !form.createInactive && form.sendInvitation,
          active: !form.createInactive,
        };
        id = (await api<UserDetail>('/users', { method: 'POST', body: JSON.stringify(body) })).id;
      } else {
        const patch = profilePatch();
        if (Object.keys(patch).length) {
          await api(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
        }
        if (rolesChanged && canAssign) {
          await api(`/users/${id}/roles`, {
            method: 'PUT',
            body: JSON.stringify({ roles: rolesBody }),
          });
        }
      }
      invalidateRoles();
      setReview(null);
      setDone(true);
      toast.success(
        isEdit
          ? 'Changes saved'
          : form.createInactive
            ? 'User created (inactive)'
            : 'Invitation sent',
        isEdit
          ? undefined
          : !form.createInactive && form.sendInvitation
            ? `${form.email.trim()} will get an email to join.`
            : undefined,
      );
      setTimeout(() => router.push(`/admin/users/${id}`), 900);
    } catch (err) {
      setReview(null);
      if (err instanceof ApiRequestError && err.status === 409) {
        if (/username/i.test(err.message)) setErrors({ username: err.message });
        else setErrors({ email: err.message });
      } else if (err instanceof ApiRequestError && err.status === 400) {
        setErrors({ general: err.messages.join(' ') });
      } else {
        setErrors({ general: errorMessage(err) });
      }
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="relative space-y-6">
      {done && (
        <div className="animate-fade-in fixed inset-0 z-40 grid place-items-center bg-white/70 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <SuccessCheck className="size-20" />
            <p className="animate-fade-up text-lg font-semibold text-slate-900 [animation-delay:200ms]">
              {isEdit ? 'Saved' : 'User created'}
            </p>
          </div>
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

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="stagger space-y-6">
          <div style={{ '--i': 0 } as React.CSSProperties}>
            <Card icon={UserRound} title="General" description="Who this account belongs to.">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="First name" required error={errors.firstName}>
                  <input
                    value={form.firstName}
                    onChange={(e) => set('firstName', e.target.value)}
                    className={inputClass}
                    autoFocus={!isEdit}
                    autoComplete="off"
                  />
                </Field>
                <Field label="Last name" required error={errors.lastName}>
                  <input
                    value={form.lastName}
                    onChange={(e) => set('lastName', e.target.value)}
                    className={inputClass}
                    autoComplete="off"
                  />
                </Field>
                <Field
                  label="Work email"
                  required
                  error={errors.email}
                  hint={
                    isEdit
                      ? 'Changing it asks the person to verify the new address.'
                      : 'The invitation is sent here.'
                  }
                >
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => set('email', e.target.value)}
                    className={inputClass}
                    autoComplete="off"
                  />
                </Field>
                <Field
                  label="Username"
                  optional
                  error={errors.username}
                  hint="Lower-case; shown as @username."
                >
                  <input
                    value={form.username}
                    onChange={(e) => set('username', e.target.value.toLowerCase())}
                    className={inputClass}
                    autoComplete="off"
                  />
                </Field>
              </div>
            </Card>
          </div>

          <div style={{ '--i': 1 } as React.CSSProperties}>
            <Card
              icon={KeyRound}
              tone="indigo"
              title="Access"
              description={
                canAssign
                  ? 'Roles decide what this person can see and do. Pick one or more.'
                  : user?.id === me?.id
                    ? "You can't change your own roles — ask another administrator."
                    : "You don't have permission to assign roles."
              }
            >
              <RoleAssignmentEditor
                roles={roles}
                value={form.roles}
                onChange={(v) => set('roles', v)}
                disabled={!canAssign}
              />
              {privileged && (
                <div className="animate-fade-in mt-3 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  <ShieldAlert className="size-4 shrink-0" />
                  These roles grant administration rights. Keep them to the people who really need
                  them.
                </div>
              )}
            </Card>
          </div>
          <div style={{ '--i': 2 } as React.CSSProperties}>
            <Card icon={Briefcase} title="Work details" tone="sky">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Department" optional>
                  <input
                    list="departments"
                    value={form.department}
                    onChange={(e) => set('department', e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <datalist id="departments">
                  {departments.map((d) => (
                    <option key={d} value={d} />
                  ))}
                </datalist>
                <Field label="Job title" optional>
                  <input
                    value={form.jobTitle}
                    onChange={(e) => set('jobTitle', e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Phone" optional>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => set('phone', e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Employee ID" optional>
                  <input
                    value={form.employeeId}
                    onChange={(e) => set('employeeId', e.target.value)}
                    className={inputClass}
                  />
                </Field>
              </div>
            </Card>
          </div>

          <div style={{ '--i': 3 } as React.CSSProperties}>
            <Card
              icon={Tags}
              tone="slate"
              title="Custom fields"
              description="Anything else worth keeping, e.g. Office → Tunis."
              actions={
                <button
                  type="button"
                  className={btnSecondary}
                  disabled={form.metadata.length >= 20}
                  onClick={() => set('metadata', [...form.metadata, { key: '', value: '' }])}
                >
                  <Plus className="size-4" />
                  Add
                </button>
              }
            >
              {form.metadata.length === 0 ? (
                <p className="text-sm text-slate-400">No custom fields.</p>
              ) : (
                <ul className="space-y-2">
                  {form.metadata.map((m, i) => (
                    <li key={i} className="animate-fade-in flex gap-2">
                      <input
                        aria-label="Field name"
                        placeholder="Name"
                        value={m.key}
                        maxLength={40}
                        onChange={(e) =>
                          set(
                            'metadata',
                            form.metadata.map((x, j) =>
                              j === i ? { ...x, key: e.target.value } : x,
                            ),
                          )
                        }
                        className={clsx(inputClass, 'w-2/5')}
                      />
                      <input
                        aria-label="Field value"
                        placeholder="Value"
                        value={m.value}
                        maxLength={200}
                        onChange={(e) =>
                          set(
                            'metadata',
                            form.metadata.map((x, j) =>
                              j === i ? { ...x, value: e.target.value } : x,
                            ),
                          )
                        }
                        className={inputClass}
                      />
                      <button
                        type="button"
                        className={iconBtn}
                        onClick={() =>
                          set(
                            'metadata',
                            form.metadata.filter((_, j) => j !== i),
                          )
                        }
                        aria-label="Remove field"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {errors.metadata && (
                <p className="animate-fade-in mt-2 text-xs text-rose-600">{errors.metadata}</p>
              )}
            </Card>
          </div>

        </div>

        <aside className="space-y-6 xl:sticky xl:top-4 xl:self-start">
          <Card
            icon={ShieldCheck}
            tone="emerald"
            title="What they'll be able to do"
            className="animate-fade-up"
          >
            <EffectivePermissionsPreview
              matrix={matrix}
              roleIds={form.roles.map((r) => r.roleId)}
            />
            {pickedRoles.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {pickedRoles.map((r) => (
                  <RoleChip key={r.id} role={r} />
                ))}
              </div>
            )}
          </Card>

          <Card
            icon={isEdit ? ShieldCheck : MailPlus}
            title={isEdit ? 'Security' : 'Account'}
            className="animate-fade-up"
          >
            <div className="space-y-2.5">
              {!isEdit && (
                <Toggle
                  checked={form.sendInvitation && !form.createInactive}
                  disabled={form.createInactive}
                  onChange={(v) => set('sendInvitation', v)}
                  label="Send invitation now"
                  description="They choose their own password from the email link."
                  icon={<MailPlus className="mt-0.5 size-4 text-indigo-500" />}
                />
              )}
              <Toggle
                checked={form.requireMfa || mfaForced}
                disabled={mfaForced || !canMfa}
                onChange={(v) => set('requireMfa', v)}
                label="Require two-step verification"
                description={
                  mfaForced
                    ? 'Always on: privileged roles need it (security policy).'
                    : 'They must set it up at their next sign-in.'
                }
                icon={<ShieldCheck className="mt-0.5 size-4 text-emerald-500" />}
              />
              {!isEdit && (
                <Toggle
                  checked={form.createInactive}
                  onChange={(v) => set('createInactive', v)}
                  label="Create as inactive"
                  description="Prepare the account now and invite them later."
                  icon={<UserX className="mt-0.5 size-4 text-slate-400" />}
                />
              )}
            </div>
          </Card>
        </aside>
      </div>

      <div className="sticky bottom-0 z-20 -mx-4 flex items-center justify-end gap-2 border-t border-slate-200 bg-white/80 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        <Link href={isEdit ? `/admin/users/${user!.id}` : '/admin/users'} className={btnSecondary}>
          Cancel
        </Link>
        <button type="submit" className={btnPrimary} disabled={busy || done}>
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : isEdit ? (
            <Save className="size-4" />
          ) : (
            <MailPlus className="size-4" />
          )}
          {isEdit
            ? 'Save changes'
            : form.createInactive || !form.sendInvitation
              ? 'Create user'
              : 'Create and invite'}
        </button>
      </div>

      <Modal
        open={review !== null}
        onClose={() => !busy && setReview(null)}
        title="Review changes"
        description="These changes affect how this person signs in or what they can access."
        footer={
          <>
            <button
              type="button"
              className={btnSecondary}
              onClick={() => setReview(null)}
              disabled={busy}
            >
              Back
            </button>
            <button type="button" className={btnPrimary} onClick={save} disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              Confirm changes
            </button>
          </>
        }
      >
        {review && <ChangeReview rows={review} />}
      </Modal>
    </form>
  );
}
