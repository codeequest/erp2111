import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { WarehouseItem } from '@erp/shared';
import { isUniqueViolation } from '../../common/prisma-errors';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateWarehouseDto, UpdateWarehouseDto } from './dto/warehouse.dto';
import { deactivationBlocker } from './warehouse-rules';

/** Warehouses, shops and depots. Never deleted, only deactivated. */
@Injectable()
export class WarehousesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(): Promise<WarehouseItem[]> {
    const [warehouses, stocked] = await Promise.all([
      this.prisma.warehouse.findMany({ orderBy: [{ isActive: 'desc' }, { code: 'asc' }] }),
      this.prisma.stockBalance.groupBy({
        by: ['warehouseId'],
        where: { quantity: { not: 0 } },
        _count: { _all: true },
      }),
    ]);
    const counts = new Map(stocked.map((s) => [s.warehouseId, s._count._all]));
    return warehouses.map((w) => ({
      ...w,
      createdAt: w.createdAt.toISOString(),
      productsInStock: counts.get(w.id) ?? 0,
    }));
  }

  async create(dto: CreateWarehouseDto, userId: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.warehouse.create({
          data: { code: dto.code, name: dto.name, address: dto.address ?? null },
        });
        await this.audit.log(tx, {
          userId,
          action: 'create',
          entity: 'Warehouse',
          entityId: created.id,
          after: created,
        });
        return created;
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new ConflictException(`Warehouse code "${dto.code}" already exists`);
      }
      throw e;
    }
  }

  async update(id: string, dto: UpdateWarehouseDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.warehouse.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Warehouse not found');

      const deactivating = dto.isActive === false && before.isActive;
      if (deactivating) {
        const [otherActiveWarehouses, productsWithStock] = await Promise.all([
          tx.warehouse.count({ where: { isActive: true, id: { not: id } } }),
          tx.stockBalance.count({ where: { warehouseId: id, quantity: { not: 0 } } }),
        ]);
        const blocker = deactivationBlocker({ otherActiveWarehouses, productsWithStock });
        if (blocker) throw new BadRequestException(blocker);
      }

      const after = await tx.warehouse.update({
        where: { id },
        data: {
          name: dto.name,
          address: dto.address === undefined ? undefined : dto.address,
          isActive: dto.isActive,
        },
      });
      await this.audit.log(tx, {
        userId,
        action: deactivating
          ? 'deactivate'
          : dto.isActive && !before.isActive
            ? 'activate'
            : 'update',
        entity: 'Warehouse',
        entityId: id,
        before,
        after,
      });
      return after;
    });
  }
}
