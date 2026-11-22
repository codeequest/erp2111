import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditEntry {
  userId?: string;
  action: string;
  entity: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Pass `tx` to write the audit row inside the caller's transaction. */
  async log(entry: AuditEntry, tx: Prisma.TransactionClient = this.prisma) {
    const json = (v: unknown) =>
      v === undefined ? undefined : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue);
    await tx.auditLog.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        before: json(entry.before),
        after: json(entry.after),
      },
    });
  }
}
