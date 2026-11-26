import { Prisma } from '@prisma/client';
import { AuditQueryDto } from './dto/audit-query.dto';

const DAY_MS = 24 * 60 * 60 * 1000;
const dayStart = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00.000Z`);

export function buildAuditWhere(q: AuditQueryDto): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {};
  if (q.actorId) where.userId = q.actorId;
  if (q.targetType) where.entity = q.targetType;
  if (q.targetId) where.entityId = q.targetId;
  if (q.action?.length) where.action = { in: q.action };
  if (q.result) where.result = q.result;
  if (q.from || q.to) {
    where.createdAt = {
      ...(q.from ? { gte: dayStart(q.from) } : {}),
      // Inclusive "to": everything before the start of the next day.
      ...(q.to ? { lt: new Date(dayStart(q.to).getTime() + DAY_MS) } : {}),
    };
  }
  if (q.search) {
    where.OR = [
      { targetLabel: { contains: q.search, mode: 'insensitive' } },
      { action: { contains: q.search, mode: 'insensitive' } },
      { user: { is: { fullName: { contains: q.search, mode: 'insensitive' } } } },
    ];
  }
  return where;
}
