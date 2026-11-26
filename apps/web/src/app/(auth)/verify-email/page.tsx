'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useHashToken } from '@/lib/use-hash-token';
import { btnPrimary } from '@/components/admin/buttons';
import { SuccessCheck } from '@/components/admin/success-check';
import { AuthShell } from '@/components/auth/auth-shell';
import { InvalidLink } from '@/components/auth/invalid-link';

export default function VerifyEmailPage() {
  const token = useHashToken();
  const [state, setState] = useState<'working' | 'done' | 'invalid'>('working');
  const sent = useRef(false);

  useEffect(() => {
    if (!token || sent.current) return;
    sent.current = true; // the token works once — don't send it twice under StrictMode
    api('/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) })
      .then(() => setState('done'))
      .catch(() => setState('invalid'));
  }, [token]);

  if (token === undefined) return null;
  if (token === null || state === 'invalid') return <InvalidLink kind="verify" />;

  if (state === 'working') {
    return (
      <AuthShell title="Verifying your email…">
        <Loader2 className="size-6 animate-spin text-indigo-600" />
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Email verified">
      <div className="animate-fade-up space-y-5">
        <SuccessCheck />
        <p className="text-sm text-slate-600">Thanks — your email address is confirmed.</p>
        <Link href="/dashboard" className={clsx(btnPrimary, 'w-full')}>
          Continue
        </Link>
      </div>
    </AuthShell>
  );
}
