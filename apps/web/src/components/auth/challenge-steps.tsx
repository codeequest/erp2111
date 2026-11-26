'use client';

import { useRef, useState } from 'react';
import clsx from 'clsx';
import { KeyRound, Loader2, LifeBuoy, ShieldCheck } from 'lucide-react';
import type { LoginResult, MfaEnrollStart } from '@erp/shared';
import { api, ApiRequestError, errorMessage } from '@/lib/api';
import { btnPrimary, inputClass } from '@/components/admin/buttons';
import { OtpInput } from '@/components/admin/otp-input';
import { NewPasswordFields, passwordReady } from '@/components/admin/password-field';
import { AuthError } from './auth-shell';
import { MfaEnroll } from './mfa-enroll';

type Challenge = Extract<LoginResult, { kind: 'challenge' }>;

const post = <T,>(path: string, body: object) =>
  api<T>(path, { method: 'POST', body: JSON.stringify(body) });

export const CHALLENGE_COPY: Record<Challenge['challenge'], { title: string; subtitle: string }> = {
  password_change: {
    title: 'Choose a new password',
    subtitle: 'Your administrator asked you to set a new password before continuing.',
  },
  mfa: {
    title: 'Two-step verification',
    subtitle: 'Enter the 6-digit code from your authenticator app.',
  },
  mfa_enroll: {
    title: 'Protect your account',
    subtitle: 'Your account needs two-step verification. It takes a minute to set up.',
  },
};

/** Walks through the sign-in steps the API asks for until a session is issued. */
export function ChallengeSteps({
  challenge,
  onChallenge,
  onSession,
  onRestart,
}: {
  challenge: Challenge;
  onChallenge: (next: Challenge) => void;
  onSession: (result: LoginResult) => void;
  /** Step expired / too many attempts: back to the password. */
  onRestart: (message: string) => void;
}) {
  // The enrolment result is applied only after the user saved the recovery codes.
  const pending = useRef<LoginResult | null>(null);
  const handle = (r: LoginResult) => (r.kind === 'session' ? onSession(r) : onChallenge(r));
  const fail = (e: unknown, setError: (m: string) => void) => {
    if (
      e instanceof ApiRequestError &&
      (e.status === 401 || e.status === 429) &&
      /log in again|expired/i.test(e.message)
    ) {
      onRestart(e.message);
    } else setError(errorMessage(e));
  };

  const key = `${challenge.challenge}:${challenge.challengeToken.slice(-12)}`;
  if (challenge.challenge === 'password_change') {
    return (
      <PasswordStep key={key} token={challenge.challengeToken} onResult={handle} onFail={fail} />
    );
  }
  if (challenge.challenge === 'mfa') {
    return <MfaStep key={key} token={challenge.challengeToken} onResult={handle} onFail={fail} />;
  }
  return (
    <MfaEnroll
      key={key}
      start={() =>
        post<MfaEnrollStart>('/auth/challenge/mfa-enroll/start', {
          challengeToken: challenge.challengeToken,
        })
      }
      confirm={async (code) => {
        try {
          const r = await post<LoginResult & { recoveryCodes: string[] }>(
            '/auth/challenge/mfa-enroll/confirm',
            {
              challengeToken: challenge.challengeToken,
              code,
            },
          );
          pending.current = r;
          return r.recoveryCodes;
        } catch (e) {
          if (e instanceof ApiRequestError && /log in again|expired/i.test(e.message))
            onRestart(e.message);
          throw e;
        }
      }}
      onDone={() => pending.current && handle(pending.current)}
    />
  );
}

function PasswordStep({
  token,
  onResult,
  onFail,
}: {
  token: string;
  onResult: (r: LoginResult) => void;
  onFail: (e: unknown, set: (m: string) => void) => void;
}) {
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErrors([]);
        setError(null);
        try {
          onResult(
            await post<LoginResult>('/auth/challenge/password', {
              challengeToken: token,
              newPassword: pw,
            }),
          );
        } catch (err) {
          if (err instanceof ApiRequestError && err.status === 400) setErrors(err.messages);
          else onFail(err, setError);
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
        serverErrors={errors}
        autoFocus
      />
      <AuthError message={error} />
      <button
        type="submit"
        className={clsx(btnPrimary, 'w-full')}
        disabled={busy || !passwordReady(pw, confirm, 1)}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
        Save password and continue
      </button>
    </form>
  );
}

function MfaStep({
  token,
  onResult,
  onFail,
}: {
  token: string;
  onResult: (r: LoginResult) => void;
  onFail: (e: unknown, set: (m: string) => void) => void;
}) {
  const [useRecovery, setUseRecovery] = useState(false);
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(value?: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const body = useRecovery
        ? { challengeToken: token, recoveryCode: recovery.trim() }
        : { challengeToken: token, code: value ?? code };
      onResult(await post<LoginResult>('/auth/challenge/mfa', body));
    } catch (e) {
      setCode('');
      onFail(e, setError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {useRecovery ? (
        <div className="animate-fade-in space-y-1.5">
          <label className="block text-sm font-medium text-slate-700" htmlFor="recovery">
            Recovery code
          </label>
          <input
            id="recovery"
            value={recovery}
            onChange={(e) => setRecovery(e.target.value)}
            placeholder="xxxxx-xxxxx"
            autoComplete="off"
            autoFocus
            className={clsx(inputClass, 'font-mono tracking-wider')}
          />
        </div>
      ) : (
        <OtpInput
          value={code}
          onChange={setCode}
          onComplete={(v) => submit(v)}
          invalid={!!error}
          disabled={busy}
        />
      )}
      <AuthError message={error} />
      <button
        type="submit"
        className={clsx(btnPrimary, 'w-full')}
        disabled={busy || (useRecovery ? recovery.trim().length < 11 : code.length !== 6)}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
        Verify
      </button>
      <button
        type="button"
        onClick={() => {
          setUseRecovery((v) => !v);
          setError(null);
        }}
        className="mx-auto flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700"
      >
        <LifeBuoy className="size-4" />
        {useRecovery ? 'Use the code from my app' : 'Lost your phone? Use a recovery code'}
      </button>
    </form>
  );
}
