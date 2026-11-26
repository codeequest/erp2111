import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditEntryDto, Page } from '@erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AUDIT_INCLUDE, toAuditDto } from './audit-dto';
import { AuditQueryDto } from './dto/audit-query.dto';
import { buildAuditWhere } from './audit-query';

/** Read-only: the audit log is append-only (a DB trigger rejects UPDATE/DELETE). */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async search(q: AuditQueryDto): Promise<Page<AuditEntryDto>> {
    const where = buildAuditWhere(q);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        include: AUDIT_INCLUDE,
        orderBy: { id: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return { items: rows.map(toAuditDto), total, page: q.page, pageSize: q.pageSize };
  }

  async actions(): Promise<string[]> {
    const rows = await this.prisma.auditLog.findMany({
      select: { action: true },
      distinct: ['action'],
      orderBy: { action: 'asc' },
    });
    return rows.map((r) => r.action);
  }

  async one(id: string): Promise<AuditEntryDto> {
    if (!/^\d{1,19}$/.test(id)) throw new NotFoundException('Audit entry not found');
    const row = await this.prisma.auditLog.findUnique({
      where: { id: BigInt(id) },
      include: AUDIT_INCLUDE,
    });
    if (!row) throw new NotFoundException('Audit entry not found');
    return toAuditDto(row);
  }
}
