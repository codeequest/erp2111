import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditEntry {
  userId: string | null;
  /** e.g. "create", "update", "deactivate", "activate", "import" */
  action: string;
  /** e.g. "Product", "Category" */
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}

/** Turns Decimals, Dates and BigInts into plain JSON values the Json column accepts. */
export function toAuditJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(
    JSON.stringify(value, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)),
  ) as Prisma.InputJsonValue;
}

/**
 * Audit log business logic.
 * Call `record(tx, …)` inside the same transaction as the change it describes,
 * so the change and its audit row are saved (or rolled back) together.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(tx: Prisma.TransactionClient, entry: AuditEntry): Promise<void> {
    await tx.auditLog.create({ data: this.toRow(entry) });
  }

  async recordMany(tx: Prisma.TransactionClient, entries: AuditEntry[]): Promise<void> {
    if (entries.length === 0) return;
    await tx.auditLog.createMany({ data: entries.map((e) => this.toRow(e)) });
  }

  private toRow(entry: AuditEntry): Prisma.AuditLogCreateManyInput {
    return {
      userId: entry.userId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      before: toAuditJson(entry.before),
      after: toAuditJson(entry.after),
    };
  }
}
