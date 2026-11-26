'use client';

import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Check, Copy, Loader2, ScanLine, Smartphone } from 'lucide-react';
import type { MfaEnrollStart } from '@erp/shared';
import { errorMessage } from '@/lib/api';
import { btnPrimary } from '@/components/admin/buttons';
import { OtpInput } from '@/components/admin/otp-input';
import { Skeleton } from '@/components/admin/skeleton';
import { AuthError } from './auth-shell';
import { RecoveryCodes } from './recovery-codes';

/**
 * Two-step verification set-up: scan the QR code (or type the key), confirm a
 * first code, then save the recovery codes before continuing.
 */
export function MfaEnroll({
  start,
  confirm,
  onDone,
  doneLabel = 'Continue',
}: {
  start: () => Promise<MfaEnrollStart>;
  /** Returns the recovery codes. */
  confirm: (code: string) => Promise<string[]>;
  onDone: () => void;
  doneLabel?: string;
}) {
  const [setup, setSetup] = useState<MfaEnrollStart | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  // One enrolment per mount, even under StrictMode's double effect (each start makes a new secret).
  const started = useRef<Promise<MfaEnrollStart> | null>(null);
  useEffect(() => {
    started.current ??= start();
    started.current.then(setSetup).catch((e) => setLoadError(errorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(value = code) {
    if (value.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      setCodes(await confirm(value));
    } catch (e) {
      setError(errorMessage(e));
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  if (codes) {
    return (
      <div className="animate-fade-up space-y-5">
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <span className="grid size-8 place-items-center rounded-full bg-emerald-500 text-white">
            <Check className="animate-pop size-4" />
          </span>
          Two-step verification is on.
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-900">Save your recovery codes</h3>
          <RecoveryCodes codes={codes} />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={saved}
            onChange={(e) => setSaved(e.target.checked)}
            className="size-4 accent-indigo-600"
          />
          I saved my recovery codes
        </label>
        <button className={clsx(btnPrimary, 'w-full')} disabled={!saved} onClick={onDone}>
          {doneLabel}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <ol className="space-y-4">
        <li className="flex gap-3">
          <Step n={1} />
          <div className="flex-1 space-y-3">
            <p className="text-sm text-slate-700">
              <Smartphone className="mr-1 inline size-4 text-slate-400" />
              Open an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…)
              and scan this code.
            </p>
            <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row">
              {setup ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={setup.qrDataUrl}
                  alt="QR code for your authenticator app"
                  width={160}
                  height={160}
                  className="animate-scale-in size-40 rounded-lg"
                />
              ) : loadError ? (
                <div className="grid size-40 place-items-center text-center text-xs text-rose-600">
                  {loadError}
                </div>
              ) : (
                <Skeleton className="size-40 rounded-lg" />
              )}
              <div className="min-w-0 flex-1 space-y-1.5 text-center sm:text-left">
                <p className="flex items-center justify-center gap-1 text-xs text-slate-500 sm:justify-start">
                  <ScanLine className="size-3.5" />
                  Can&apos;t scan? Enter this key:
                </p>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 rounded-md bg-slate-100 px-2 py-1.5 font-mono text-xs break-all text-slate-800">
                    {setup?.secret.replace(/(.{4})/g, '$1 ').trim() ?? '…'}
                  </code>
                  <button
                    type="button"
                    disabled={!setup}
                    onClick={async () => {
                      await navigator.clipboard.writeText(setup!.secret);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }}
                    className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
                    aria-label="Copy key"
                  >
                    {copied ? (
                      <Check className="animate-pop size-4 text-emerald-600" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </li>
        <li className="flex gap-3">
          <Step n={2} />
          <div className="flex-1 space-y-3">
            <p className="text-sm text-slate-700">Enter the 6-digit code the app shows.</p>
            <OtpInput
              value={code}
              onChange={setCode}
              onComplete={submit}
              invalid={!!error}
              disabled={!setup || busy}
              autoFocus={false}
            />
            <AuthError message={error} />
          </div>
        </li>
      </ol>
      <button
        className={clsx(btnPrimary, 'w-full')}
        disabled={code.length !== 6 || busy || !setup}
        onClick={() => submit()}
      >
        {busy && <Loader2 className="size-4 animate-spin" />}
        Turn on two-step verification
      </button>
    </div>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-semibold text-white shadow-sm">
      {n}
    </span>
  );
}
