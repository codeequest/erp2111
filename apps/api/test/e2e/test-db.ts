import { readFileSync } from 'fs';
import { join } from 'path';

/** The dev DATABASE_URL from .env, pointed at a separate `erp_test` database. */
export function testDatabaseUrl(): string {
  const env = readFileSync(join(__dirname, '..', '..', '.env'), 'utf8');
  const m = /^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m.exec(env);
  if (!m) throw new Error('DATABASE_URL missing from apps/api/.env');
  const url = new URL(m[1]);
  url.pathname = '/erp_test';
  return url.toString();
}
