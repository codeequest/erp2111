import { COMMON_PASSWORDS } from './common-passwords';

export interface PasswordContext {
  email: string;
  username?: string | null;
  firstName?: string;
  lastName?: string;
}

export interface PasswordPolicy {
  minLength: number;
  maxLength: number;
  blockCommon: boolean;
}

const MIN_PART = 3;

/** Returns human-readable errors; empty when the password is acceptable. */
export function checkPassword(
  password: string,
  ctx: PasswordContext,
  policy: PasswordPolicy,
): string[] {
  const errors: string[] = [];
  if (password.length < policy.minLength) errors.push(`Use at least ${policy.minLength} characters.`);
  if (password.length > policy.maxLength) errors.push(`Use at most ${policy.maxLength} characters.`);

  const lower = password.toLowerCase();
  if (policy.blockCommon && COMMON_PASSWORDS.has(lower)) {
    errors.push('This password is too common. Choose something less predictable.');
  }

  const contains = (parts: Array<string | null | undefined>) =>
    parts.some((p) => {
      const part = p?.trim().toLowerCase();
      return !!part && part.length >= MIN_PART && lower.includes(part);
    });

  const local = (ctx.email.split('@')[0] ?? '').toLowerCase();
  if (contains([local, ...local.split(/[._+-]/)])) errors.push("Don't include your email address.");
  if (contains([ctx.firstName, ctx.lastName])) errors.push("Don't include your name.");
  if (contains([ctx.username])) errors.push("Don't include your username.");
  return errors;
}
