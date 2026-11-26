'use client';

import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import {
  KeyRound,
  Laptop,
  Loader2,
  LogOut,
  MonitorSmartphone,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
  Smartphone,
} from 'lucide-react';
import type { AccountSecurity, MfaEnrollStart } from '@erp/shared';
import { api, ApiRequestError, errorMessage } from '@/lib/api';
import { describeDevice, formatDateTime, relativeTime } from '@/lib/format';
import { btnDangerSoft, btnPrimary, btnSecondary, inputClass } from '@/components/admin/buttons';
import { Card } from '@/components/admin/card';
import { ConfirmDialog } from '@/components/admin/confirm-dialog';
import { EmptyState } from '@/components/admin/empty-state';
import { Modal } from '@/components/admin/modal';
import { PasswordInput, NewPasswordFields, passwordReady } from '@/components/admin/password-field';
import { Skeleton } from '@/components/admin/skeleton';
import { SuccessCheck } from '@/components/admin/success-check';
import { useToast } from '@/components/admin/toast';
import { MfaEnroll } from '@/components/auth/mfa-enroll';
import { RecoveryCodes } from '@/components/auth/recovery-codes';
import { AlertCircle } from 'lucide-react';

const post = <T,>(path: string, body?: object, method = 'POST') =>
  api<T>(path, { method, body: body ? JSON.stringify(body) : undefined });

export default function AccountSecurityPage() {
  const [data, setData] = useState<AccountSecurity | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api<AccountSecurity>('/account/security')
      .then(setData)
      .catch((e) => setError(errorMessage(e)));
  }, []);
  useEffect(load, [load]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="animate-fade-up flex items-center gap-3">
        <div className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/25">
          <ShieldCheck className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Account security</h1>
          <p className="text-sm text-slate-500">
            Your password, two-step verification and signed-in devices.
          </p>
        </div>
      </header>

      {error ? (
        <Card>
          <EmptyState
            icon={AlertCircle}
            tone="rose"
            title="Couldn't load your security settings"
            description={error}
            action={
              <button className={btnSecondary} onClick={load}>
                <RefreshCw className="size-4" />
                Try again
              </button>
            }
          />
        </Card>
      ) : (
        <div className="stagger grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div style={{ '--i': 0 } as React.CSSProperties}>
            <PasswordCard changedAt={data?.passwordChangedAt} loading={!data} onChanged={load} />
          </div>
          <div style={{ '--i': 1 } as React.CSSProperties}>
            <MfaCard data={data} onChanged={load} />
          </div>
          <div style={{ '--i': 2 } as React.CSSProperties} className="lg:col-span-2">
            <SessionsCard data={data} onChanged={load} />
          </div>
        </div>
      )}
    </div>
  );
}

function PasswordCard({
  changedAt,
  loading,
  onChanged,
}: {
  changedAt: string | null | undefined;
  loading: boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [rules, setRules] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setCurrent('');
    setPw('');
    setConfirm('');
    setRules([]);
  };

  return (
    <Card
      icon={KeyRound}
      title="Password"
      description="Use a long passphrase you don't use anywhere else."
      className="h-full"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm">
          <p className="text-slate-500">Last changed</p>
          {loading ? (
            <Skeleton className="mt-1 h-4 w-28" />
          ) : (
            <p
              className="font-medium text-slate-900"
              title={changedAt ? formatDateTime(changedAt) : undefined}
            >
              {changedAt ? relativeTime(changedAt) : 'Never'}
            </p>
          )}
        </div>
        <button className={btnSecondary} onClick={() => setOpen(true)}>
          Change password
        </button>
      </div>

      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          reset();
        }}
        title="Change your password"
        description="Your other devices will be signed out."
        footer={
          <>
            <button className={btnSecondary} onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </button>
            <button
              className={btnPrimary}
              disabled={busy || !current || !passwordReady(pw, confirm, 1)}
              onClick={async () => {
                setBusy(true);
                setRules([]);
                try {
                  await post('/account/password', { currentPassword: current, newPassword: pw });
                  setOpen(false);
                  reset();
                  toast.success('Password changed', 'Your other sessions were signed out.');
                  onChanged();
                } catch (e) {
                  if (e instanceof ApiRequestError && e.status === 400) setRules(e.messages);
                  else toast.error('Could not change the password', errorMessage(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              Save new password
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">Current password</label>
            <PasswordInput
              value={current}
              onChange={setCurrent}
              autoComplete="current-password"
              autoFocus
            />
          </div>
          <NewPasswordFields
            value={pw}
            confirm={confirm}
            onChange={setPw}
            onConfirmChange={setConfirm}
            serverErrors={rules}
          />
        </div>
      </Modal>
    </Card>
  );
}

function MfaCard({ data, onChanged }: { data: AccountSecurity | null; onChanged: () => void }) {
  const toast = useToast();
  const [enrolling, setEnrolling] = useState(false);
  const [codeFor, setCodeFor] = useState<'disable' | 'regenerate' | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);

  const on = data?.mfaEnabled;
  return (
    <Card
      icon={on ? ShieldCheck : ShieldOff}
      tone={on ? 'emerald' : data?.mfaRequired ? 'rose' : 'amber'}
      title="Two-step verification"
      description="A code from your phone in addition to your password."
      className="h-full"
    >
      {!data ? (
        <Skeleton className="h-16 w-full" />
      ) : on ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 ring-1 ring-emerald-200">
            <ShieldCheck className="size-5 shrink-0" />
            <span>
              On · <span className="font-medium">{data.recoveryCodesLeft}</span> recovery code
              {data.recoveryCodesLeft === 1 ? '' : 's'} left
            </span>
          </div>
          {data.recoveryCodesLeft <= 3 && (
            <p className="text-xs text-amber-700">
              Running low on recovery codes — generate new ones.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button className={btnSecondary} onClick={() => setCodeFor('regenerate')}>
              <RefreshCw className="size-4" />
              New recovery codes
            </button>
            {data.mfaRequired ? (
              <span className="self-center text-xs text-slate-500">
                Required for your account — it can&apos;t be turned off.
              </span>
            ) : (
              <button className={btnDangerSoft} onClick={() => setCodeFor('disable')}>
                Turn off
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className={clsx('text-sm', data.mfaRequired ? 'text-rose-700' : 'text-slate-600')}>
            {data.mfaRequired
              ? 'Your account requires two-step verification. Set it up now.'
              : 'Not set up. We strongly recommend turning it on.'}
          </p>
          <button className={btnPrimary} onClick={() => setEnrolling(true)}>
            <Smartphone className="size-4" />
            Set up two-step verification
          </button>
        </div>
      )}

      <Modal
        open={enrolling}
        onClose={() => setEnrolling(false)}
        title="Set up two-step verification"
        size="md"
      >
        {enrolling && (
          <MfaEnroll
            start={() => post<MfaEnrollStart>('/account/mfa/start')}
            confirm={async (c) =>
              (await post<{ recoveryCodes: string[] }>('/account/mfa/confirm', { code: c }))
                .recoveryCodes
            }
            doneLabel="Done"
            onDone={() => {
              setEnrolling(false);
              toast.success('Two-step verification is on');
              onChanged();
            }}
          />
        )}
      </Modal>

      <Modal
        open={codeFor !== null}
        onClose={() => {
          setCodeFor(null);
          setCode('');
          setError(null);
          setNewCodes(null);
        }}
        title={
          newCodes
            ? 'Your new recovery codes'
            : codeFor === 'disable'
              ? 'Turn off two-step verification'
              : 'Generate new recovery codes'
        }
        description={
          newCodes
            ? 'The old codes no longer work.'
            : 'Confirm with a code from your app (or a recovery code).'
        }
        footer={
          newCodes ? (
            <button className={btnPrimary} onClick={() => setCodeFor(null)}>
              Done
            </button>
          ) : (
            <button
              className={codeFor === 'disable' ? btnDangerSoft : btnPrimary}
              disabled={busy || code.trim().length < 6}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  if (codeFor === 'disable') {
                    await post('/account/mfa', { code: code.trim() }, 'DELETE');
                    setCodeFor(null);
                    toast.success('Two-step verification turned off');
                  } else {
                    const r = await post<{ recoveryCodes: string[] }>(
                      '/account/mfa/recovery-codes',
                      { code: code.trim() },
                    );
                    setNewCodes(r.recoveryCodes);
                  }
                  setCode('');
                  onChanged();
                } catch (e) {
                  setError(errorMessage(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              {codeFor === 'disable' ? 'Turn off' : 'Generate'}
            </button>
          )
        }
      >
        {newCodes ? (
          <div className="space-y-4">
            <SuccessCheck className="size-12" />
            <RecoveryCodes codes={newCodes} />
          </div>
        ) : (
          <div className="space-y-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456 or xxxxx-xxxxx"
              autoComplete="one-time-code"
              autoFocus
              className={clsx(
                inputClass,
                'font-mono tracking-wider',
                error && 'animate-shake border-rose-400',
              )}
            />
            {error && <p className="animate-fade-in text-xs text-rose-600">{error}</p>}
          </div>
        )}
      </Modal>
    </Card>
  );
}

function SessionsCard({
  data,
  onChanged,
}: {
  data: AccountSecurity | null;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [target, setTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const others = data?.sessions.filter((s) => !s.current) ?? [];

  return (
    <Card
      icon={MonitorSmartphone}
      tone="sky"
      title="Where you're signed in"
      description="Sign out of devices you don't recognise."
    >
      {!data ? (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {data.sessions.map((s, i) => (
            <li
              key={s.id}
              className="animate-fade-up flex items-center gap-3 py-3"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div
                className={clsx(
                  'grid size-10 shrink-0 place-items-center rounded-xl',
                  s.current
                    ? 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-500',
                )}
              >
                <Laptop className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
                  {describeDevice(s.userAgent)}
                  {s.current && (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                      This device
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {s.ip ?? 'Unknown IP'} · active {relativeTime(s.lastSeenAt)} · signed in{' '}
                  {relativeTime(s.createdAt)}
                </p>
              </div>
              {!s.current && (
                <button className={btnSecondary} onClick={() => setTarget(s.id)}>
                  <LogOut className="size-4" />
                  <span className="hidden sm:inline">Sign out</span>
                </button>
              )}
            </li>
          ))}
          {others.length === 0 && (
            <li className="pt-3 text-sm text-slate-500">
              You&apos;re only signed in on this device.
            </li>
          )}
        </ul>
      )}

      <ConfirmDialog
        open={target !== null}
        title="Sign out this device?"
        description="Anyone using that session will need to sign in again."
        confirmLabel="Sign out"
        tone="danger"
        busy={busy}
        onClose={() => setTarget(null)}
        onConfirm={async () => {
          setBusy(true);
          try {
            await api(`/account/sessions/${target}`, { method: 'DELETE' });
            toast.success('Device signed out');
            setTarget(null);
            onChanged();
          } catch (e) {
            toast.error('Could not sign out the device', errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      />
    </Card>
  );
}
