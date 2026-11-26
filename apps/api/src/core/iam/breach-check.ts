import { Logger } from '@nestjs/common';
import { createHash } from 'crypto';

export const BREACHED_MESSAGE = 'This password has appeared in a data breach. Choose another.';

type FetchLike = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal },
) => Promise<{ ok: boolean; status?: number; text: () => Promise<string> }>;

const logger = new Logger('BreachCheck');

/**
 * HaveIBeenPwned k-anonymity lookup: only the first 5 hex chars of the SHA-1
 * leave the server, with response padding. Fails open (false) on any error.
 */
export async function isBreached(
  password: string,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
): Promise<boolean> {
  const hash = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  try {
    const res = await fetchImpl(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true' },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status ?? '?'}`);
    const body = await res.text();
    return body.split('\n').some((line) => {
      const [s, count] = line.trim().split(':');
      return s === suffix && Number(count) > 0;
    });
  } catch (e) {
    logger.warn(
      `Breached-password check unavailable, allowing password: ${e instanceof Error ? e.message : e}`,
    );
    return false;
  }
}
