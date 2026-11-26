/**
 * Break-glass: clears the lockout of an account from the server shell.
 *   pnpm --filter @erp/api admin:unlock <email>
 * Audited as `user.unlocked` with no actor.
 */
import { PrismaClient } from '@prisma/client';
import { recordAudit } from '../src/common/audit';

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error('Usage: admin:unlock <email>');
    process.exit(2);
  }
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      console.error(`No user with email ${email}`);
      process.exit(1);
    }
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockedUntil: null },
      });
      await recordAudit(tx, {
        actorId: null,
        action: 'user.unlocked',
        targetType: 'User',
        targetId: user.id,
        targetLabel: user.email,
        reason: 'break-glass CLI',
      });
    });
    console.log(`Unlocked ${user.email}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
