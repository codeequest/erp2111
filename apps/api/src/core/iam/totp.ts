import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const DIGITS = 6;

function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(input: string): Buffer {
  const clean = input.replace(/[\s=]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error('Invalid base32 character.');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** 20 random bytes, base32 without padding. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** RFC 6238 / RFC 4226 code (SHA-1, 6 digits) for a time step. */
export function totpAt(secretB32: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac('sha1', base32Decode(secretB32)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  return String(bin % 10 ** DIGITS).padStart(DIGITS, '0');
}

/**
 * Returns the matched step, or null. `now` is epoch milliseconds. Accepts +-1 step
 * and rejects any step <= lastUsedStep (replay protection).
 */
export function verifyTotp(
  secretB32: string,
  code: string,
  now: number,
  lastUsedStep: number | null,
): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const current = Math.floor(now / 1000 / STEP_SECONDS);
  const given = Buffer.from(code);
  let matched: number | null = null;
  for (const step of [current - 1, current, current + 1]) {
    if (lastUsedStep !== null && step <= lastUsedStep) continue;
    const expected = Buffer.from(totpAt(secretB32, step));
    if (timingSafeEqual(expected, given) && matched === null) matched = step;
  }
  return matched;
}

export function otpauthUri(secret: string, account: string, issuer: string): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  return (
    `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}` +
    `&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`
  );
}

/** Unique `xxxxx-xxxxx` codes over the lower-case base32 alphabet. */
export function generateRecoveryCodes(n = 10): string[] {
  const alphabet = B32.toLowerCase();
  const pick = (len: number) =>
    Array.from({ length: len }, () => alphabet[randomInt(alphabet.length)]).join('');
  const codes = new Set<string>();
  while (codes.size < n) codes.add(`${pick(5)}-${pick(5)}`);
  return [...codes];
}
