'use client';

import { useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { ArrowLeft, Loader2, MailCheck, Send } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { btnPrimary, btnSecondary, inputClass } from '@/components/admin/buttons';
import { AuthError, AuthShell } from '@/components/auth/auth-shell';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (sent) {
    return (
      <AuthShell title="Check your inbox" icon={MailCheck}>
        <div className="animate-fade-up space-y-5">
          <p className="text-sm text-slate-600">
            If an account exists for <span className="font-medium text-slate-900">{email}</span>,
            we&apos;ve sent a link to choose a new password. It expires soon, so use it shortly.
          </p>
          <p className="text-xs text-slate-500">
            No email after a few minutes? Check your spam folder or ask an administrator.
          </p>
          <Link href="/login" className={clsx(btnSecondary, 'w-full')}>
            <ArrowLeft className="size-4" />
            Back to sign in
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Forgot your password?"
      subtitle="Enter your work email and we'll send you a link to choose a new one."
    >
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await api('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
            setSent(true);
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="space-y-1.5">
          <label htmlFor="email" className="block text-sm font-medium text-slate-700">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoFocus
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </div>
        <AuthError message={error} />
        <button type="submit" disabled={busy} className={clsx(btnPrimary, 'w-full py-2.5')}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Send reset link
        </button>
        <Link
          href="/login"
          className="flex items-center justify-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="size-4" />
          Back to sign in
        </Link>
      </form>
    </AuthShell>
  );
}
