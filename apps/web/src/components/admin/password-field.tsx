'use client';

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Check, Eye, EyeOff, X } from 'lucide-react';
import type { PasswordPolicyHints } from '@erp/shared';
import { api } from '@/lib/api';
import { inputClass } from './buttons';

let hintsCache: Promise<PasswordPolicyHints> | null = null;
function loadHints() {
  hintsCache ??= api<PasswordPolicyHints>('/auth/password-policy').catch(() => {
    hintsCache = null;
    return { minLength: 12, maxLength: 128 };
  });
  return hintsCache;
}

export function PasswordInput({
  value,
  onChange,
  autoComplete = 'new-password',
  placeholder,
  id,
  invalid,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  placeholder?: string;
  id?: string;
  invalid?: boolean;
  autoFocus?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-invalid={invalid || undefined}
        className={clsx(inputClass, 'pr-10', invalid && 'border-rose-400')}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute inset-y-0 right-0 grid w-10 place-items-center text-slate-400 transition hover:text-slate-700"
        aria-label={show ? 'Hide password' : 'Show password'}
        tabIndex={-1}
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

/** Rough strength 0–4 (length + variety), only for the meter. The server has the final word. */
function strength(pw: string, min: number): number {
  if (!pw) return 0;
  let s = pw.length >= min ? 2 : pw.length >= min / 2 ? 1 : 0;
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (kinds >= 3) s++;
  if (pw.length >= min + 6) s++;
  return Math.min(4, s);
}

const METER = ['bg-rose-500', 'bg-orange-500', 'bg-amber-500', 'bg-lime-500', 'bg-emerald-500'];
const WORDS = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'];

/**
 * New password + confirmation with live rule checks from GET /auth/password-policy.
 * `serverErrors` shows what the API rejected (common, contains your name, breached…).
 */
export function NewPasswordFields({
  value,
  confirm,
  onChange,
  onConfirmChange,
  serverErrors = [],
  autoFocus,
}: {
  value: string;
  confirm: string;
  onChange: (v: string) => void;
  onConfirmChange: (v: string) => void;
  serverErrors?: string[];
  autoFocus?: boolean;
}) {
  const [hints, setHints] = useState<PasswordPolicyHints>({ minLength: 12, maxLength: 128 });
  useEffect(() => {
    loadHints().then(setHints);
  }, []);

  const s = strength(value, hints.minLength);
  const rules = [
    { ok: value.length >= hints.minLength, label: `At least ${hints.minLength} characters` },
    { ok: value.length > 0 && value.length <= hints.maxLength, label: `At most ${hints.maxLength} characters` },
    { ok: confirm.length > 0 && confirm === value, label: 'Both passwords match' },
  ];

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-slate-700">New password</label>
        <PasswordInput value={value} onChange={onChange} autoFocus={autoFocus} invalid={serverErrors.length > 0} />
        <div className="flex items-center gap-2 pt-1">
          <div className="flex flex-1 gap-1">
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className={clsx(
                  'h-1.5 flex-1 rounded-full transition-colors duration-300',
                  value && i < Math.max(1, s) ? METER[s] : 'bg-slate-200',
                )}
              />
            ))}
          </div>
          <span className="w-16 text-right text-xs text-slate-500">{value ? WORDS[s] : ''}</span>
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-slate-700">Confirm new password</label>
        <PasswordInput value={confirm} onChange={onConfirmChange} />
      </div>
      <ul className="space-y-1">
        {rules.map((r) => (
          <li key={r.label} className={clsx('flex items-center gap-2 text-xs transition', r.ok ? 'text-emerald-700' : 'text-slate-500')}>
            <span
              className={clsx(
                'grid size-4 place-items-center rounded-full transition',
                r.ok ? 'bg-emerald-100' : 'bg-slate-100',
              )}
            >
              {r.ok ? <Check className="animate-pop size-3" /> : <span className="size-1 rounded-full bg-slate-400" />}
            </span>
            {r.label}
          </li>
        ))}
        <li className="flex items-center gap-2 text-xs text-slate-500">
          <span className="grid size-4 place-items-center rounded-full bg-slate-100">
            <span className="size-1 rounded-full bg-slate-400" />
          </span>
          Not a common password, and not your name or email
        </li>
      </ul>
      {serverErrors.length > 0 && (
        <ul className="animate-shake space-y-1 rounded-lg border border-rose-200 bg-rose-50 p-3">
          {serverErrors.map((e) => (
            <li key={e} className="flex items-start gap-2 text-xs text-rose-700">
              <X className="mt-0.5 size-3 shrink-0" />
              {e}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function passwordReady(value: string, confirm: string, min = 12) {
  return value.length >= min && value === confirm;
}
