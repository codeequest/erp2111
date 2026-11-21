import { ConflictException, Injectable } from '@nestjs/common';
import type { UnitItem } from '@erp/shared';
import { isUniqueViolation } from '../../common/prisma-errors';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUnitDto } from './dto/unit.dto';

/** Units of measure (PCS, CTN, KG …). Stock is always kept in a product's base unit. */
@Injectable()
export class UnitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(): Promise<UnitItem[]> {
    const units = await this.prisma.unit.findMany({
      orderBy: { code: 'asc' },
      include: { _count: { select: { baseProducts: true } } },
    });
    return units.map(({ _count, ...u }) => ({ ...u, productCount: _count.baseProducts }));
  }

  async create(dto: CreateUnitDto, userId: string): Promise<UnitItem> {
    try {
      const unit = await this.prisma.$transaction(async (tx) => {
        const created = await tx.unit.create({ data: { code: dto.code, name: dto.name } });
        await this.audit.log(tx, {
          userId,
          action: 'create',
          entity: 'Unit',
          entityId: created.id,
          after: created,
        });
        return created;
      });
      return { ...unit, productCount: 0 };
    } catch (e) {
      if (isUniqueViolation(e))
        throw new ConflictException(`Unit code "${dto.code}" already exists`);
      throw e;
    }
  }
}
