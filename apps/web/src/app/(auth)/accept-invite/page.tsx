'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { Loader2, PartyPopper } from 'lucide-react';
import type { LoginResult } from '@erp/shared';
import { api, ApiRequestError, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useHashToken } from '@/lib/use-hash-token';
import { btnPrimary } from '@/components/admin/buttons';
import { NewPasswordFields, passwordReady } from '@/components/admin/password-field';
import { Skeleton } from '@/components/admin/skeleton';
import { AuthError, AuthShell } from '@/components/auth/auth-shell';
import { CHALLENGE_COPY, ChallengeSteps } from '@/components/auth/challenge-steps';
import { InvalidLink } from '@/components/auth/invalid-link';

type Challenge = Extract<LoginResult, { kind: 'challenge' }>;

export default function AcceptInvitePage() {
  const token = useHashToken();
  const router = useRouter();
  const { completeChallenge } = useAuth();
  const [invite, setInvite] = useState<{ email: string; firstName: string } | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [rules, setRules] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);

  useEffect(() => {
    if (!token) return;
    api<{ email: string; firstName: string }>('/auth/invitation/inspect', {
      method: 'POST',
      body: JSON.stringify({ token }),
    })
      .then(setInvite)
      .catch(() => setInvalid(true));
  }, [token]);

  if (token === undefined) return null;
  if (token === null || invalid) return <InvalidLink kind="invite" />;

  if (challenge) {
    const copy = CHALLENGE_COPY[challenge.challenge];
    return (
      <AuthShell title={copy.title} subtitle={copy.subtitle} wide>
        <ChallengeSteps
          challenge={challenge}
          onChallenge={setChallenge}
          onSession={(r) => {
            completeChallenge(r);
            router.replace('/dashboard');
          }}
          onRestart={() => router.replace('/login')}
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      icon={PartyPopper}
      title={invite ? `Welcome, ${invite.firstName}!` : 'Welcome!'}
      subtitle={
        invite ? (
          <>
            Choose a password for <span className="font-medium text-slate-700">{invite.email}</span>{' '}
            to finish setting up your account.
          </>
        ) : (
          <Skeleton className="mt-1 h-4 w-56" />
        )
      }
    >
      <form
        className="space-y-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setRules([]);
          setError(null);
          try {
            const r = await api<LoginResult>('/auth/invitation/accept', {
              method: 'POST',
              body: JSON.stringify({ token, newPassword: pw }),
            });
            if (r.kind === 'challenge') setChallenge(r);
            else {
              completeChallenge(r);
              router.replace('/dashboard');
            }
          } catch (err) {
            if (err instanceof ApiRequestError && err.status === 400) {
              if (/invalid or has expired/i.test(err.message)) setInvalid(true);
              else setRules(err.messages);
            } else setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <NewPasswordFields
          value={pw}
          confirm={confirm}
          onChange={setPw}
          onConfirmChange={setConfirm}
          serverErrors={rules}
          autoFocus
        />
        <AuthError message={error} />
        <button
          type="submit"
          disabled={busy || !invite || !passwordReady(pw, confirm, 1)}
          className={clsx(btnPrimary, 'w-full py-2.5')}
        >
          {busy && <Loader2 className="size-4 animate-spin" />}
          Create my account
        </button>
      </form>
    </AuthShell>
  );
}
