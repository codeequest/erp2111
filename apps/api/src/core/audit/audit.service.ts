import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface Actor {
  id: string;
  ip?: string;
}

export interface AuditEvent {
  /** e.g. "create", "update", "activate", "deactivate", "delete", "import" */
  action: string;
  /** e.g. "Product", "Category", "Unit" */
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}

/** Either the main client or a transaction client, so audit rows commit with the change. */
type Db = Prisma.TransactionClient | PrismaService;

/** Fields that must never be written to the audit log. */
const SECRET_FIELDS = new Set(['passwordHash', 'password', 'tokenHash']);

function sanitize(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(
    JSON.stringify(value, (key, v) => {
      if (SECRET_FIELDS.has(key)) return undefined;
      if (typeof v === 'bigint') return v.toString();
      return v;
    }),
  ) as Prisma.InputJsonValue;
}

/**
 * Writes the audit log: who changed what, and when.
 * (Searching the log is part of the Administration module — branch feat/admin.)
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Write one audit row. Pass `tx` when inside a transaction. */
  async log(actor: Actor, event: AuditEvent, tx: Db = this.prisma): Promise<void> {
    await tx.auditLog.create({
      data: {
        userId: actor.id,
        ip: actor.ip ?? null,
        action: event.action,
        entity: event.entity,
        entityId: event.entityId ?? null,
        before: sanitize(event.before),
        after: sanitize(event.after),
      },
    });
  }
}
