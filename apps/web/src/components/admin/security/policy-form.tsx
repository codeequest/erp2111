'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { Check, Loader2, Save, SlidersHorizontal } from 'lucide-react';
import type { SecurityPolicyDto } from '@erp/shared';
import { api, ApiRequestError, errorMessage } from '@/lib/api';
import { btnPrimary, btnSecondary, inputClass } from '../buttons';
import { Card } from '../card';
import { Toggle } from '../field';
import { useToast } from '../toast';

type NumKey = {
  [K in keyof SecurityPolicyDto]: SecurityPolicyDto[K] extends number ? K : never;
}[keyof SecurityPolicyDto];

const NUMBERS: { key: NumKey; label: string; unit: string; min: number; max: number }[] = [
  {
    key: 'passwordMinLength',
    label: 'Minimum password length',
    unit: 'characters',
    min: 8,
    max: 64,
  },
  {
    key: 'passwordMaxLength',
    label: 'Maximum password length',
    unit: 'characters',
    min: 64,
    max: 256,
  },
  { key: 'lockoutThreshold', label: 'Lock after', unit: 'wrong passwords', min: 3, max: 20 },
  { key: 'lockoutMinutes', label: 'Lock for', unit: 'minutes', min: 1, max: 1440 },
  { key: 'invitationTtlHours', label: 'Invitation links last', unit: 'hours', min: 1, max: 720 },
  { key: 'resetTtlMinutes', label: 'Reset links last', unit: 'minutes', min: 10, max: 1440 },
  { key: 'accessReviewDays', label: 'Review access every', unit: 'days', min: 7, max: 365 },
  { key: 'dormantDays', label: 'Dormant after', unit: 'days without sign-in', min: 7, max: 365 },
];

/** Security policy: numbers with documented ranges + switches. Read-only without admin.security.manage. */
export function PolicyForm({
  policy,
  editable,
  onSaved,
}: {
  policy: SecurityPolicyDto;
  editable: boolean;
  onSaved: (p: SecurityPolicyDto) => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState<SecurityPolicyDto>(policy);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const dirty = JSON.stringify(form) !== JSON.stringify(policy);
  const invalid = NUMBERS.filter((n) => {
    const v = form[n.key];
    return !Number.isInteger(v) || v < n.min || v > n.max;
  });
  const minMax = form.passwordMaxLength < form.passwordMinLength;

  async function save() {
    setBusy(true);
    setErrors([]);
    try {
      const patch = Object.fromEntries(
        Object.entries(form).filter(([k, v]) => policy[k as keyof SecurityPolicyDto] !== v),
      );
      const next = await api<SecurityPolicyDto>('/security/policy', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      onSaved(next);
      setForm(next);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
      toast.success('Security policy updated');
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 400) setErrors(e.messages);
      else toast.error('Could not save the policy', errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      icon={SlidersHorizontal}
      title="Security policy"
      description={
        editable
          ? 'Applies to everyone. Changes are recorded in the audit log.'
          : 'Only people with “Manage security policy” can change it.'
      }
      actions={
        editable && (
          <>
            {dirty && (
              <button className={btnSecondary} onClick={() => setForm(policy)} disabled={busy}>
                Reset
              </button>
            )}
            <button
              className={btnPrimary}
              onClick={save}
              disabled={!dirty || busy || invalid.length > 0 || minMax}
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : saved ? (
                <Check className="animate-pop size-4" />
              ) : (
                <Save className="size-4" />
              )}
              {saved ? 'Saved' : 'Save'}
            </button>
          </>
        )
      }
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="grid gap-3 sm:grid-cols-2">
          {NUMBERS.map((n) => {
            const bad = invalid.includes(n) || (n.key === 'passwordMaxLength' && minMax);
            return (
              <label key={n.key} className="space-y-1">
                <span className="block text-xs font-medium text-slate-600">{n.label}</span>
                <span className="flex items-center gap-2">
                  <input
                    type="number"
                    min={n.min}
                    max={n.max}
                    value={Number.isNaN(form[n.key]) ? '' : form[n.key]}
                    disabled={!editable}
                    onChange={(e) => setForm((f) => ({ ...f, [n.key]: e.target.valueAsNumber }))}
                    className={clsx(
                      inputClass,
                      'w-24 tabular-nums',
                      bad && 'animate-shake border-rose-400',
                    )}
                  />
                  <span className="text-xs text-slate-500">{n.unit}</span>
                </span>
                <span
                  className={clsx('block text-[11px]', bad ? 'text-rose-600' : 'text-slate-400')}
                >
                  {n.key === 'passwordMaxLength' && minMax
                    ? 'Must be at least the minimum.'
                    : `${n.min}–${n.max}`}
                </span>
              </label>
            );
          })}
        </div>
        <div className="space-y-2.5">
          <Toggle
            checked={form.requireMfaForPrivileged}
            disabled={!editable}
            onChange={(v) => setForm((f) => ({ ...f, requireMfaForPrivileged: v }))}
            label="Require two-step verification for privileged users"
            description="Anyone holding an administration permission must use it."
          />
          <Toggle
            checked={form.blockBreachedPasswords}
            disabled={!editable}
            onChange={(v) => setForm((f) => ({ ...f, blockBreachedPasswords: v }))}
            label="Block common passwords"
            description="Rejects passwords from a list of the most used ones."
          />
          <Toggle
            checked={form.breachApiCheck}
            disabled={!editable}
            onChange={(v) => setForm((f) => ({ ...f, breachApiCheck: v }))}
            label="Check passwords against known breaches"
            description="Asks HaveIBeenPwned anonymously (only 5 characters of a hash leave the server)."
          />
          <Toggle
            checked={form.revokeSessionsOnPasswordReset}
            disabled={!editable}
            onChange={(v) => setForm((f) => ({ ...f, revokeSessionsOnPasswordReset: v }))}
            label="Sign out everywhere after a password reset"
          />
        </div>
      </div>
      {errors.length > 0 && (
        <ul className="animate-shake mt-4 space-y-1 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}
