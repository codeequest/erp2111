import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditEntry {
  userId: string | null;
  /** e.g. "create", "update", "deactivate" */
  action: string;
  /** e.g. "Product" */
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}

type Db = PrismaService | Prisma.TransactionClient;

/** Turns Prisma rows (Decimal, Date, BigInt) into plain JSON for the audit log. */
function toJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === undefined || value === null) return Prisma.JsonNull;
  return JSON.parse(
    JSON.stringify(value, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)),
  ) as Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Writes one AuditLog row. Pass the transaction client `tx` when the change
   * itself runs in a transaction, so the log is rolled back with it.
   */
  async record(entry: AuditEntry, db: Db = this.prisma): Promise<void> {
    await db.auditLog.create({
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
