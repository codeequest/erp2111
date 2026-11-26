'use client';

import { useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { ConfirmDialog } from '../confirm-dialog';
import { useToast } from '../toast';

type Target = { id: string; fullName: string; email: string };
type Pending =
  | { kind: 'deactivate'; user: Target }
  | { kind: 'activate'; user: Target }
  | { kind: 'reset'; user: Target }
  | null;

/** Confirmed lifecycle actions on one user (list rows, detail header). */
export function useUserActions(onDone: () => void) {
  const toast = useToast();
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);

  async function run(reason?: string) {
    if (!pending) return;
    const { kind, user } = pending;
    setBusy(true);
    try {
      if (kind === 'deactivate') {
        await api(`/users/${user.id}/deactivate`, {
          method: 'POST',
          body: JSON.stringify({ reason }),
        });
        toast.success(
          `${user.fullName} was deactivated`,
          'Their sessions ended and pending links stopped working.',
        );
      } else if (kind === 'activate') {
        await api(`/users/${user.id}/activate`, { method: 'POST' });
        toast.success(`${user.fullName} is active again`);
      } else {
        await api(`/users/${user.id}/reset-password`, { method: 'POST' });
        toast.success('Reset link sent', `An email is on its way to ${user.email}.`);
      }
      setPending(null);
      onDone();
    } catch (e) {
      toast.error('That did not work', errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const dialogs = (
    <>
      <ConfirmDialog
        open={pending?.kind === 'deactivate'}
        tone="danger"
        title={`Deactivate ${pending?.user.fullName ?? ''}?`}
        description="They are signed out everywhere and can't sign in until reactivated. Their history and roles are kept."
        reason={{ label: 'Reason', placeholder: 'e.g. Left the company on 30 November' }}
        confirmLabel="Deactivate"
        busy={busy}
        onConfirm={run}
        onClose={() => setPending(null)}
      />
      <ConfirmDialog
        open={pending?.kind === 'activate'}
        title={`Reactivate ${pending?.user.fullName ?? ''}?`}
        description="They keep their roles. Two-step verification and other security rules apply at their next sign-in."
        confirmLabel="Reactivate"
        busy={busy}
        onConfirm={() => run()}
        onClose={() => setPending(null)}
      />
      <ConfirmDialog
        open={pending?.kind === 'reset'}
        title="Send a password reset link?"
        description={
          <>
            We&apos;ll email{' '}
            <span className="font-medium text-slate-700">{pending?.user.email}</span> a link to
            choose a new password. You never see or set their password.
          </>
        }
        confirmLabel="Send link"
        busy={busy}
        onConfirm={() => run()}
        onClose={() => setPending(null)}
      />
    </>
  );

  return {
    dialogs,
    deactivate: (user: Target) => setPending({ kind: 'deactivate', user }),
    activate: (user: Target) => setPending({ kind: 'activate', user }),
    resetPassword: (user: Target) => setPending({ kind: 'reset', user }),
  };
}
