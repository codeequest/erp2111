import { execSync } from 'child_process';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { testDatabaseUrl } from './test-db';

/**
 * Prepares the separate `erp_test` database WITHOUT destroying anything:
 * create it if missing, apply migrations, run the (idempotent) seed.
 * Tests create uniquely named data, so runs can accumulate safely.
 */
export default async function setup(): Promise<void> {
  const url = testDatabaseUrl();
  const env = {
    ...process.env,
    DATABASE_URL: url,
    SEED_ADMIN_EMAIL: 'e2e-admin@erp.test',
    SEED_ADMIN_PASSWORD: 'E2e-Admin-Strong-Pass-1',
    SEED_ADMIN_NAME: 'E2E Admin',
  };

  // CREATE DATABASE is not allowed inside the target DB: connect to the maintenance DB.
  const maintenance = new URL(url);
  maintenance.pathname = '/postgres';
  const admin = new PrismaClient({ datasources: { db: { url: maintenance.toString() } } });
  const exists = await admin.$queryRaw<
    { n: number }[]
  >`SELECT 1 AS n FROM pg_database WHERE datname = 'erp_test'`;
  if (exists.length === 0) await admin.$executeRawUnsafe('CREATE DATABASE erp_test');
  await admin.$disconnect();

  const cwd = join(__dirname, '..', '..');
  execSync('npx prisma migrate deploy', { cwd, env, stdio: 'pipe' });
  execSync('npx prisma db seed', { cwd, env, stdio: 'pipe' });

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  // Tests opt into MFA per user; the privileged-users rule has its own unit tests.
  await prisma.securityPolicy.upsert({
    where: { id: 1 },
    update: { requireMfaForPrivileged: false },
    create: { id: 1, requireMfaForPrivileged: false },
  });
  // The seeded admin may be left locked / deactivated by an interrupted earlier run.
  await prisma.user.updateMany({
    where: { email: 'e2e-admin@erp.test' },
    data: { status: 'ACTIVE', failedLoginCount: 0, lockedUntil: null, deactivatedAt: null },
  });
  await prisma.$disconnect();
}
