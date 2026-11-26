/** Dev outbox needs an explicit MAIL_TRANSPORT=outbox and a non-production NODE_ENV (no defaults). */
export function isDevOutbox(
  env: { MAIL_TRANSPORT?: string; NODE_ENV?: string } = process.env,
): boolean {
  return env.MAIL_TRANSPORT === 'outbox' && env.NODE_ENV !== 'production';
}
