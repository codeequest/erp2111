import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UnitDto } from '@erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { Actor, AuditService } from '../../core/audit/audit.service';
import { SaveUnitDto } from './catalog.dto';

@Injectable()
export class UnitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(): Promise<UnitDto[]> {
    const rows = await this.prisma.unit.findMany({
      include: { _count: { select: { baseProducts: true, productUnits: true } } },
      orderBy: { code: 'asc' },
    });
    return rows.map((u) => ({
      id: u.id,
      code: u.code,
      name: u.name,
      productCount: u._count.baseProducts + u._count.productUnits,
    }));
  }

  async create(dto: SaveUnitDto, actor: Actor): Promise<UnitDto> {
    await this.assertCodeFree(dto.code);
    const unit = await this.prisma.$transaction(async (tx) => {
      const u = await tx.unit.create({ data: { code: dto.code, name: dto.name } });
      await this.audit.log(
        actor,
        { action: 'create', entity: 'Unit', entityId: u.id, after: dto },
        tx,
      );
      return u;
    });
    return { id: unit.id, code: unit.code, name: unit.name, productCount: 0 };
  }

  async update(id: string, dto: SaveUnitDto, actor: Actor): Promise<UnitDto> {
    const before = await this.prisma.unit.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Unit not found');
    if (dto.code !== before.code) await this.assertCodeFree(dto.code);

    await this.prisma.$transaction(async (tx) => {
      await tx.unit.update({ where: { id }, data: { code: dto.code, name: dto.name } });
      await this.audit.log(
        actor,
        {
          action: 'update',
          entity: 'Unit',
          entityId: id,
          before: { code: before.code, name: before.name },
          after: dto,
        },
        tx,
      );
    });
    return (await this.findAll()).find((u) => u.id === id)!;
  }

  /** Units used by a product (or by any document line) cannot be deleted. */
  async remove(id: string, actor: Actor): Promise<void> {
    const unit = await this.prisma.unit.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            baseProducts: true,
            productUnits: true,
            purchaseOrderLines: true,
            salesOrderLines: true,
          },
        },
      },
    });
    if (!unit) throw new NotFoundException('Unit not found');
    const used = Object.values(unit._count).reduce((a, b) => a + b, 0);
    if (used > 0)
      throw new BadRequestException('This unit is used by products and cannot be deleted');

    await this.prisma.$transaction(async (tx) => {
      await tx.unit.delete({ where: { id } });
      await this.audit.log(
        actor,
        {
          action: 'delete',
          entity: 'Unit',
          entityId: id,
          before: { code: unit.code, name: unit.name },
        },
        tx,
      );
    });
  }

  private async assertCodeFree(code: string) {
    const taken = await this.prisma.unit.findUnique({ where: { code } });
    if (taken) throw new ConflictException('A unit with this code already exists');
  }
}
