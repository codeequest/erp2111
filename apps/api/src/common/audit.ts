import { Prisma } from '@prisma/client';
import { RequestUser } from './types/request-user';

/** Writes an AuditLog row inside the caller's transaction. */
export async function audit(
  tx: Prisma.TransactionClient,
  user: RequestUser,
  action: string,
  entity: string,
  entityId: string,
  before: Prisma.InputJsonObject | null,
  after: Prisma.InputJsonObject | null,
) {
  await tx.auditLog.create({
    data: {
      userId: user.id,
      action,
      entity,
      entityId,
      before: before ?? Prisma.DbNull,
      after: after ?? Prisma.DbNull,
    },
  });
}
