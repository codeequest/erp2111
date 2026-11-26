'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import { ArrowLeft, Loader2, LogIn } from 'lucide-react';
import type { LoginResult } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/api';
import { btnPrimary, inputClass } from '@/components/admin/buttons';
import { PasswordInput } from '@/components/admin/password-field';
import { AuthError, AuthShell } from '@/components/auth/auth-shell';
import { CHALLENGE_COPY, ChallengeSteps } from '@/components/auth/challenge-steps';

type Challenge = Extract<LoginResult, { kind: 'challenge' }>;

/** Only same-site paths, so ?next= can't send people elsewhere. */
function safeNext(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/dashboard';
}

function LoginFlow() {
  const { status, login, completeChallenge } = useAuth();
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [challenge, setChallenge] = useState<Challenge | null>(null);

  useEffect(() => {
    if (status === 'authenticated') router.replace(next);
  }, [status, router, next]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await login(email, password);
      if (result.kind === 'challenge') {
        setChallenge(result);
        setPassword('');
      }
    } catch (err) {
      setError(errorMessage(err, 'Sign-in failed. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  }

  if (challenge) {
    const copy = CHALLENGE_COPY[challenge.challenge];
    return (
      <AuthShell title={copy.title} subtitle={copy.subtitle} wide={challenge.challenge !== 'mfa'}>
        <div key={challenge.challenge} className="animate-fade-up">
          <ChallengeSteps
            challenge={challenge}
            onChallenge={setChallenge}
            onSession={completeChallenge}
            onRestart={(message) => {
              setChallenge(null);
              setError(message);
            }}
          />
        </div>
        <button
          onClick={() => setChallenge(null)}
          className="mt-6 flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="size-4" />
          Use a different account
        </button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in with the account your administrator gave you."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="email" className="block text-sm font-medium text-slate-700">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="block text-sm font-medium text-slate-700">
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
            >
              Forgot password?
            </Link>
          </div>
          <PasswordInput
            id="password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
          />
        </div>
        <AuthError message={error} />
        <button type="submit" disabled={submitting} className={clsx(btnPrimary, 'w-full py-2.5')}>
          {submitting ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
          Sign in
        </button>
      </form>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginFlow />
    </Suspense>
  );
}
