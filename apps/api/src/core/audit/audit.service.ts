import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Db } from '../../common/db';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditEntry {
  /** The user who did it (null for system actions). */
  userId: string | null;
  /** e.g. "create", "update", "confirm", "post", "cancel" */
  action: string;
  /** e.g. "Product", "Category", "SalesOrder" */
  entity: string;
  entityId?: string | null;
  /** Snapshot before the change (omit for "create"). */
  before?: unknown;
  /** Snapshot after the change. */
  after?: unknown;
  ip?: string | null;
}

/**
 * Converts a record to plain JSON: Decimal → string, Date → ISO string,
 * BigInt → string. Returns undefined when there is nothing to store.
 */
export function toAuditJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(
    JSON.stringify(value, (_key, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)),
  ) as Prisma.InputJsonValue;
}

/**
 * Writes the audit trail (CONTRIBUTING: one row per create / update / status
 * change of a business document).
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Pass the transaction client (`tx`) so the audit row is committed or rolled
   * back together with the change it describes.
   */
  async log(db: Db, entry: AuditEntry): Promise<void> {
    await db.auditLog.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        before: toAuditJson(entry.before),
        after: toAuditJson(entry.after),
        ip: entry.ip ?? null,
      },
    });
  }

  /** Same as `log` but outside any transaction. */
  record(entry: AuditEntry): Promise<void> {
    return this.log(this.prisma, entry);
  }
}
