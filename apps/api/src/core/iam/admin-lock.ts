import { Prisma } from '@prisma/client';
import { assertAdminsRemain } from './access-policy';

/** Arbitrary constant shared by every operation that can reduce the number of admins. */
const ADMIN_LOCK_KEY = 724001;

/**
 * Serialises admin-reducing writes (deactivation, role removal/expiry, bulk,
 * role permission edits, role delete). Held until the transaction ends, so two
 * admins removing each other at the same instant cannot both succeed.
 */
export async function withAdminLock(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADMIN_LOCK_KEY})`;
}

/**
 * Same rule as `countEffectiveAdmins`, evaluated in SQL: ACTIVE users holding the
 * protected Admin role permanently (a temporary Admin assignment never counts).
 */
export function countAdminsInDb(tx: Prisma.TransactionClient): Promise<number> {
  return tx.user.count({
    where: { status: 'ACTIVE', roles: { some: { expiresAt: null, role: { isProtected: true } } } },
  });
}

/** Recount after applying changes inside the same transaction; throws LAST_ADMIN (rollback). */
export async function assertAdminsRemainInDb(tx: Prisma.TransactionClient): Promise<void> {
  assertAdminsRemain(await countAdminsInDb(tx));
}
