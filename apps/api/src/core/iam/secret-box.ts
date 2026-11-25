import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const VERSION = 'v1';

function decodeKey(keyB64: string): Buffer {
  const key = Buffer.from(keyB64, 'base64');
  if (key.length !== 32) {
    throw new Error('Encryption key must decode to exactly 32 bytes (base64).');
  }
  return key;
}

/** AES-256-GCM. Output: `v1:<iv b64>:<tag b64>:<ciphertext b64>`. */
export function seal(plain: string, keyB64: string): string {
  const key = decodeKey(keyB64);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':');
}

/** Throws on a wrong key, a malformed value or any tampering. */
export function open(sealed: string, keyB64: string): string {
  const key = decodeKey(keyB64);
  const parts = sealed.split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Unsupported sealed value.');
  }
  const iv = Buffer.from(parts[1], 'base64');
  const tag = Buffer.from(parts[2], 'base64');
  const ct = Buffer.from(parts[3], 'base64');
  if (iv.length !== 12 || tag.length !== 16) {
    throw new Error('Malformed sealed value.');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}
