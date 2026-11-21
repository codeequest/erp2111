import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditEntry {
  userId: string | null;
  /** e.g. "create", "update", "deactivate", "confirm", "post", "cancel" */
  action: string;
  /** e.g. "Product", "SalesOrder" */
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}

/** Converts Decimal / Date / BigInt values into plain JSON for the audit columns. */
function toJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === undefined || value === null) return Prisma.JsonNull;
  return JSON.parse(
    JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)),
  ) as Prisma.InputJsonValue;
}

/**
 * Writes AuditLog rows. Pass the transaction client (`tx`) when the change runs
 * inside `prisma.$transaction`, so the audit row commits or rolls back with it.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry, tx: Prisma.TransactionClient = this.prisma): Promise<void> {
    await tx.auditLog.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        before: toJson(entry.before),
        after: toJson(entry.after),
        ip: entry.ip ?? null,
      },
    });
  }
}
