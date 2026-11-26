'use client';

import { useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { KeyRound, Loader2, LogIn } from 'lucide-react';
import { api, ApiRequestError, errorMessage } from '@/lib/api';
import { useHashToken } from '@/lib/use-hash-token';
import { btnPrimary } from '@/components/admin/buttons';
import { NewPasswordFields, passwordReady } from '@/components/admin/password-field';
import { SuccessCheck } from '@/components/admin/success-check';
import { AuthError, AuthShell } from '@/components/auth/auth-shell';
import { InvalidLink } from '@/components/auth/invalid-link';

export default function ResetPasswordPage() {
  const token = useHashToken();
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [rules, setRules] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [done, setDone] = useState(false);

  if (token === undefined) return null;
  if (token === null || invalid) return <InvalidLink kind="reset" />;

  if (done) {
    return (
      <AuthShell title="Password changed">
        <div className="animate-fade-up space-y-5">
          <SuccessCheck />
          <p className="text-sm text-slate-600">
            Your new password is set. For your safety, you were signed out on your other devices.
          </p>
          <Link href="/login" className={clsx(btnPrimary, 'w-full')}>
            <LogIn className="size-4" />
            Sign in
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Choose a new password"
      subtitle="Pick something long and unique to this account."
      icon={KeyRound}
    >
      <form
        className="space-y-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setRules([]);
          setError(null);
          try {
            await api('/auth/reset-password', {
              method: 'POST',
              body: JSON.stringify({ token, newPassword: pw }),
            });
            setDone(true);
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
          disabled={busy || !passwordReady(pw, confirm, 1)}
          className={clsx(btnPrimary, 'w-full py-2.5')}
        >
          {busy && <Loader2 className="size-4 animate-spin" />}
          Set new password
        </button>
      </form>
    </AuthShell>
  );
}
