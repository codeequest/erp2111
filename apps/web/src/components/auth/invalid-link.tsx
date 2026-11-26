import Link from 'next/link';
import clsx from 'clsx';
import { LinkIcon } from 'lucide-react';
import { btnPrimary, btnSecondary } from '@/components/admin/buttons';
import { AuthShell } from './auth-shell';

/** Expired / used / missing link. */
export function InvalidLink({ kind }: { kind: 'reset' | 'invite' | 'verify' }) {
  const text = {
    reset:
      'This password reset link is invalid or has expired. Links work once and only for a short time.',
    invite:
      'This invitation link is invalid or has expired. Ask your administrator to send a new invitation.',
    verify: 'This verification link is invalid or has expired.',
  }[kind];
  return (
    <AuthShell title="This link can't be used" icon={LinkIcon}>
      <div className="animate-fade-up space-y-5">
        <p className="text-sm text-slate-600">{text}</p>
        <div className="flex flex-col gap-2">
          {kind === 'reset' && (
            <Link href="/forgot-password" className={clsx(btnPrimary, 'w-full')}>
              Request a new link
            </Link>
          )}
          <Link href="/login" className={clsx(btnSecondary, 'w-full')}>
            Go to sign in
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}
