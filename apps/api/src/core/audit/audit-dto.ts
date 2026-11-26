import { AuditLog, Prisma } from '@prisma/client';
import { AuditEntryDto } from '@erp/shared';

export const AUDIT_INCLUDE = {
  user: { select: { fullName: true } },
} satisfies Prisma.AuditLogInclude;

export type AuditRow = AuditLog & { user: { fullName: string } | null };

export function toAuditDto(row: AuditRow): AuditEntryDto {
  return {
    id: row.id.toString(),
    createdAt: row.createdAt.toISOString(),
    action: row.action,
    result: row.result,
    actorId: row.userId,
    actorName: row.user?.fullName ?? null,
    entity: row.entity,
    entityId: row.entityId,
    targetLabel: row.targetLabel,
    before: row.before,
    after: row.after,
    reason: row.reason,
    ip: row.ip,
    userAgent: row.userAgent,
  };
}
