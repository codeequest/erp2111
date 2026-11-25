import { Prisma, PrismaClient } from '@prisma/client';
import { RequestUser } from './types/request-user';

export interface AuditEntry {
  actorId: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  targetLabel?: string | null;
  before?: object | null;
  after?: object | null;
  result?: 'SUCCESS' | 'FAILURE' | 'DENIED';
  reason?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

/** Writes a structured AuditLog row; pass the caller's transaction client for atomicity. */
export async function recordAudit(
  tx: Prisma.TransactionClient | PrismaClient,
  e: AuditEntry,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      userId: e.actorId,
      action: e.action,
      entity: e.targetType,
      entityId: e.targetId ?? null,
      targetLabel: e.targetLabel ?? null,
      before: (e.before as Prisma.InputJsonObject | null | undefined) ?? Prisma.DbNull,
      after: (e.after as Prisma.InputJsonObject | null | undefined) ?? Prisma.DbNull,
      result: e.result ?? 'SUCCESS',
      reason: e.reason ?? null,
      ip: e.ip ?? null,
      userAgent: e.userAgent ?? null,
    },
  });
}

/** Writes an AuditLog row inside the caller's transaction (legacy signature). */
export async function audit(
  tx: Prisma.TransactionClient,
  user: RequestUser,
  action: string,
  entity: string,
  entityId: string,
  before: Prisma.InputJsonObject | null,
  after: Prisma.InputJsonObject | null,
) {
  await recordAudit(tx, {
    actorId: user.id,
    action,
    targetType: entity,
    targetId: entityId,
    before,
    after,
  });
}
