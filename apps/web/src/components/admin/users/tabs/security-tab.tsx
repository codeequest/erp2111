'use client';

import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import {
  KeyRound,
  Laptop,
  Lock,
  LogOut,
  MailCheck,
  MailPlus,
  MonitorSmartphone,
  ShieldCheck,
  ShieldOff,
  UserCheck,
  UserX,
} from 'lucide-react';
import type { SessionInfo, UserDetail } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { describeDevice, formatDateTime, relativeTime } from '@/lib/format';
import { btnDangerSoft, btnSecondary } from '../../buttons';
import { Card } from '../../card';
import { ConfirmDialog, type ConfirmDialogProps } from '../../confirm-dialog';
import { Skeleton } from '../../skeleton';
import { useToast } from '../../toast';

type Confirm = Omit<ConfirmDialogProps, 'open' | 'busy' | 'onClose' | 'onConfirm'> & {
  run: (reason?: string) => Promise<unknown>;
  success: string;
};

function Status({ ok, children }: { ok: boolean | 'warn'; children: React.ReactNode }) {
  return (
    <p
      className={clsx(
        'text-sm font-medium',
        ok === true ? 'text-emerald-700' : ok === 'warn' ? 'text-amber-700' : 'text-rose-700',
      )}
    >
      {children}
    </p>
  );
}

export function SecurityTab({ user, onChanged }: { user: UserDetail; onChanged: () => void }) {
  const { can, user: me } = useAuth();
  const toast = useToast();
  const self = me?.id === user.id;
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [busy, setBusy] = useState(false);
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);

  const loadSessions = useCallback(() => {
    api<SessionInfo[]>(`/users/${user.id}/sessions`)
      .then(setSessions)
      .catch(() => setSessions([]));
  }, [user.id]);
  useEffect(loadSessions, [loadSessions, user.updatedAt]);

  const post = (path: string, method = 'POST', body?: object) =>
    api(`/users/${user.id}${path}`, { method, body: body ? JSON.stringify(body) : undefined });

  const ask = (c: Confirm) => setConfirm(c);
  async function quick(fn: () => Promise<unknown>, success: string) {
    try {
      await fn();
      toast.success(success);
      onChanged();
      loadSessions();
    } catch (e) {
      toast.error('That did not work', errorMessage(e));
    }
  }

  const selfHint = self ? "You can't do this to your own account" : undefined;
  const cards: React.ReactNode[] = [];

  if (user.status === 'PENDING') {
    cards.push(
      <Card
        key="invite"
        icon={MailPlus}
        tone="sky"
        title="Invitation"
        description="Waiting for them to choose a password."
        className="h-full"
      >
        <Status ok={user.hasPendingInvitation ? 'warn' : false}>
          {user.hasPendingInvitation
            ? 'Invitation sent, not accepted yet'
            : 'No valid invitation link'}
        </Status>
        {can('admin.user.create') && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className={btnSecondary}
              onClick={() => quick(() => post('/invitation'), 'Invitation sent again')}
            >
              <MailPlus className="size-4" />
              {user.hasPendingInvitation ? 'Resend' : 'Send invitation'}
            </button>
            {user.hasPendingInvitation && (
              <button
                className={btnDangerSoft}
                onClick={() =>
                  ask({
                    title: 'Cancel the invitation?',
                    description: 'The link in their email will stop working.',
                    confirmLabel: 'Cancel invitation',
                    tone: 'danger',
                    run: () => post('/invitation', 'DELETE'),
                    success: 'Invitation cancelled',
                  })
                }
              >
                Cancel link
              </button>
            )}
          </div>
        )}
      </Card>,
    );
  }

  cards.push(
    <Card
      key="email"
      icon={MailCheck}
      tone={user.emailVerified ? 'emerald' : 'amber'}
      title="Email address"
      className="h-full"
    >
      <Status ok={user.emailVerified ? true : 'warn'}>
        {user.emailVerified ? `Verified ${relativeTime(user.emailVerifiedAt)}` : 'Not verified'}
      </Status>
      <p className="mt-0.5 truncate text-xs text-slate-500">{user.email}</p>
      {!user.emailVerified &&
        user.status !== 'INACTIVE' &&
        user.status !== 'PENDING' &&
        can('admin.user.update') && (
          <button
            className={clsx(btnSecondary, 'mt-3')}
            onClick={() => quick(() => post('/verify-email'), 'Verification email sent')}
          >
            <MailCheck className="size-4" />
            Resend verification
          </button>
        )}
    </Card>,
    <Card
      key="mfa"
      icon={user.mfaEnabled ? ShieldCheck : ShieldOff}
      tone={user.mfaEnabled ? 'emerald' : user.mfaRequired ? 'rose' : 'amber'}
      title="Two-step verification"
      className="h-full"
    >
      <Status ok={user.mfaEnabled ? true : user.mfaRequired ? false : 'warn'}>
        {user.mfaEnabled ? 'On' : user.mfaRequired ? 'Required — set up at next sign-in' : 'Off'}
      </Status>
      <p className="mt-0.5 text-xs text-slate-500">
        {user.mfaRequired ? 'Required for this account' : 'Optional for this account'}
      </p>
      {user.mfaEnabled && can('admin.user.manage_mfa') && (
        <button
          className={clsx(btnDangerSoft, 'mt-3')}
          disabled={self}
          title={selfHint}
          onClick={() =>
            ask({
              title: 'Reset two-step verification?',
              description:
                'Use this when they lost their phone. They are signed out and must set it up again at the next sign-in.',
              confirmLabel: 'Reset',
              tone: 'danger',
              run: () => post('/mfa', 'DELETE'),
              success: 'Two-step verification reset',
            })
          }
        >
          Reset (lost device)
        </button>
      )}
    </Card>,
    <Card key="password" icon={KeyRound} tone="indigo" title="Password" className="h-full">
      <Status ok={!user.mustChangePassword ? true : 'warn'}>
        {user.mustChangePassword
          ? 'Must change at next sign-in'
          : user.passwordChangedAt
            ? `Changed ${relativeTime(user.passwordChangedAt)}`
            : 'Not set yet'}
      </Status>
      {can('admin.user.reset_password') && user.status === 'ACTIVE' && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className={btnSecondary}
            onClick={() =>
              ask({
                title: 'Send a password reset link?',
                description: `We'll email ${user.email} a link to choose a new password.`,
                confirmLabel: 'Send link',
                run: () => post('/reset-password'),
                success: 'Reset link sent',
              })
            }
          >
            Send reset link
          </button>
          {!user.mustChangePassword && (
            <button
              className={btnSecondary}
              disabled={self}
              title={selfHint}
              onClick={() =>
                ask({
                  title: 'Require a new password?',
                  description:
                    'They are signed out now and must choose a new password at the next sign-in.',
                  confirmLabel: 'Require change',
                  run: () => post('/force-password-change'),
                  success: 'They will choose a new password at next sign-in',
                })
              }
            >
              Force change
            </button>
          )}
        </div>
      )}
    </Card>,
    <Card
      key="lock"
      icon={Lock}
      tone={user.lockedUntil ? 'amber' : 'slate'}
      title="Sign-in attempts"
      className="h-full"
    >
      {user.lockedUntil ? (
        <>
          <Status ok={false}>Locked until {formatDateTime(user.lockedUntil)}</Status>
          <p className="mt-0.5 text-xs text-slate-500">
            After {user.failedLoginCount} wrong passwords.
          </p>
          {can('admin.user.manage_mfa') && (
            <button
              className={clsx(btnSecondary, 'mt-3')}
              onClick={() => quick(() => post('/unlock'), 'Account unlocked')}
            >
              <UserCheck className="size-4" />
              Unlock now
            </button>
          )}
        </>
      ) : (
        <>
          <Status ok={user.failedLoginCount === 0 ? true : 'warn'}>
            {user.failedLoginCount === 0
              ? 'No recent failures'
              : `${user.failedLoginCount} recent failed attempt${user.failedLoginCount === 1 ? '' : 's'}`}
          </Status>
          <p className="mt-0.5 text-xs text-slate-500">
            Last sign-in {user.lastLoginAt ? relativeTime(user.lastLoginAt) : 'never'}
          </p>
        </>
      )}
    </Card>,
  );

  const canLifecycle =
    user.status === 'INACTIVE' ? can('admin.user.activate') : can('admin.user.deactivate');
  if (canLifecycle) {
    cards.push(
      <Card
        key="account"
        icon={user.status === 'INACTIVE' ? UserX : UserCheck}
        tone={user.status === 'INACTIVE' ? 'slate' : 'emerald'}
        title="Account"
        className="h-full"
      >
        {user.status === 'INACTIVE' ? (
          <>
            <Status ok={false}>Deactivated {relativeTime(user.deactivatedAt)}</Status>
            <p className="mt-0.5 text-xs text-slate-500">
              {user.deactivatedBy && `by ${user.deactivatedBy}`}
              {user.deactivationReason && ` — “${user.deactivationReason}”`}
            </p>
            <button
              className={clsx(btnSecondary, 'mt-3')}
              onClick={() =>
                ask({
                  title: `Reactivate ${user.fullName}?`,
                  description: 'They keep their roles. Security rules apply at their next sign-in.',
                  confirmLabel: 'Reactivate',
                  run: () => post('/activate'),
                  success: 'Account reactivated',
                })
              }
            >
              <UserCheck className="size-4" />
              Reactivate
            </button>
          </>
        ) : (
          <>
            <Status ok>Active</Status>
            <p className="mt-0.5 text-xs text-slate-500">
              Users are never deleted — deactivate to remove access.
            </p>
            <button
              className={clsx(btnDangerSoft, 'mt-3')}
              disabled={self}
              title={selfHint}
              onClick={() =>
                ask({
                  title: `Deactivate ${user.fullName}?`,
                  description:
                    'They are signed out everywhere and pending links stop working. History and roles are kept.',
                  confirmLabel: 'Deactivate',
                  tone: 'danger',
                  reason: { label: 'Reason', placeholder: 'e.g. Left the company' },
                  run: (reason) => post('/deactivate', 'POST', { reason }),
                  success: 'Account deactivated',
                })
              }
            >
              <UserX className="size-4" />
              Deactivate
            </button>
          </>
        )}
      </Card>,
    );
  }

  return (
    <div className="space-y-6">
      <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((c, i) => (
          <div key={i} style={{ '--i': i } as React.CSSProperties}>
            {c}
          </div>
        ))}
      </div>

      <Card
        icon={MonitorSmartphone}
        tone="sky"
        title="Active sessions"
        description="Devices currently signed in to this account."
        className="animate-fade-up"
        actions={
          can('admin.session.revoke') &&
          (sessions?.length ?? 0) > 0 && (
            <button
              className={btnDangerSoft}
              onClick={() =>
                ask({
                  title: 'Sign out everywhere?',
                  description: `Every device signed in as ${user.fullName} is signed out immediately.`,
                  confirmLabel: 'Sign out all',
                  tone: 'danger',
                  run: () => post('/sessions', 'DELETE'),
                  success: 'Signed out everywhere',
                })
              }
            >
              <LogOut className="size-4" />
              <span className="hidden sm:inline">Sign out all</span>
            </button>
          )
        }
      >
        {sessions === null ? (
          <Skeleton className="h-12" />
        ) : sessions.length === 0 ? (
          <p className="text-sm text-slate-500">Not signed in anywhere.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500">
                  <Laptop className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900">
                    {describeDevice(s.userAgent)}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {s.ip ?? 'Unknown IP'} · active {relativeTime(s.lastSeenAt)} · since{' '}
                    {relativeTime(s.createdAt)}
                  </p>
                </div>
                {can('admin.session.revoke') && (
                  <button
                    className={btnSecondary}
                    onClick={() =>
                      quick(() => post(`/sessions/${s.id}`, 'DELETE'), 'Session ended')
                    }
                    aria-label="End this session"
                  >
                    <LogOut className="size-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.title ?? ''}
        description={confirm?.description ?? ''}
        confirmLabel={confirm?.confirmLabel ?? 'Confirm'}
        tone={confirm?.tone}
        reason={confirm?.reason}
        busy={busy}
        onClose={() => setConfirm(null)}
        onConfirm={async (reason) => {
          if (!confirm) return;
          setBusy(true);
          try {
            await confirm.run(reason);
            toast.success(confirm.success);
            setConfirm(null);
            onChanged();
            loadSessions();
          } catch (e) {
            toast.error('That did not work', errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}
