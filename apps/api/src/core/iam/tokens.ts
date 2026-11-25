import { createHash, randomBytes } from 'crypto';

/** SHA-256 hex digest; only this hash is stored at rest. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** 32 random bytes as base64url, plus the hash to persist. */
export function newToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}
