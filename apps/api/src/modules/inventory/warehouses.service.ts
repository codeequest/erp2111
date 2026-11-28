import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Warehouse } from '@prisma/client';
import type { WarehouseRow } from '@erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestUser } from '../../common/types/request-user';
import { audit } from '../../common/audit';
import { CreateWarehouseDto, UpdateWarehouseDto } from './dto/warehouse.dto';

/**
 * Warehouses (shops, depots). Never deleted, only deactivated, so the stock
 * history keeps pointing to them. Every write is audited.
 */
@Injectable()
export class WarehousesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(includeInactive: boolean): Promise<WarehouseRow[]> {
    const [rows, counts] = await Promise.all([
      this.prisma.warehouse.findMany({
        where: includeInactive ? {} : { isActive: true },
        orderBy: [{ isActive: 'desc' }, { code: 'asc' }],
      }),
      this.prisma.stockBalance.groupBy({
        by: ['warehouseId'],
        where: { quantity: { not: 0 } },
        _count: { _all: true },
      }),
    ]);
    const inStock = new Map(counts.map((c) => [c.warehouseId, c._count._all]));
    return rows.map((w) => toRow(w, inStock.get(w.id) ?? 0));
  }

  async create(dto: CreateWarehouseDto, user: RequestUser): Promise<WarehouseRow> {
    await this.assertCodeFree(dto.code);
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const w = await tx.warehouse.create({
          data: { code: dto.code, name: dto.name, address: dto.address ?? null },
        });
        await audit(tx, user, 'create', 'Warehouse', w.id, null, snapshot(w));
        return w;
      });
      return toRow(created, 0);
    } catch (e) {
      // Two people creating the same code at the same moment.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`A warehouse with code ${dto.code} already exists`);
      }
      throw e;
    }
  }

  async update(id: string, dto: UpdateWarehouseDto, user: RequestUser): Promise<WarehouseRow> {
    const updated = await this.prisma.$transaction(async (tx) => {
      // Lock the row so two admins cannot deactivate the last warehouses at the same time.
      await tx.$queryRaw`SELECT id FROM warehouses WHERE id = ${id}::uuid FOR UPDATE`;
      const existing = await tx.warehouse.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Warehouse not found');

      if (dto.isActive === false && existing.isActive) {
        await this.assertCanDeactivate(tx, existing);
      }

      const data: Prisma.WarehouseUpdateInput = {};
      if (dto.name !== undefined) data.name = dto.name;
      if (dto.address !== undefined) data.address = dto.address;
      if (dto.isActive !== undefined) data.isActive = dto.isActive;

      const w = await tx.warehouse.update({ where: { id }, data });
      const action =
        dto.isActive === false && existing.isActive
          ? 'deactivate'
          : dto.isActive === true && !existing.isActive
            ? 'activate'
            : 'update';
      await audit(tx, user, action, 'Warehouse', id, snapshot(existing), snapshot(w));
      return w;
    });
    const inStock = await this.prisma.stockBalance.count({
      where: { warehouseId: id, quantity: { not: 0 } },
    });
    return toRow(updated, inStock);
  }

  /** A warehouse can be closed only when it is empty and another one stays open. */
  private async assertCanDeactivate(tx: Prisma.TransactionClient, w: Warehouse) {
    const [withStock, reserved, otherActive] = await Promise.all([
      tx.stockBalance.count({ where: { warehouseId: w.id, quantity: { not: 0 } } }),
      tx.stockBalance.count({ where: { warehouseId: w.id, reserved: { gt: 0 } } }),
      tx.warehouse.count({ where: { isActive: true, id: { not: w.id } } }),
    ]);
    if (withStock > 0) {
      throw new BadRequestException(
        `${w.code} still holds stock for ${withStock} product(s). ` +
          'Transfer or adjust the stock to zero before deactivating it.',
      );
    }
    if (reserved > 0) {
      throw new BadRequestException(`${w.code} has stock reserved for sales orders`);
    }
    if (otherActive === 0) {
      throw new BadRequestException('At least one warehouse must stay active');
    }
  }

  private async assertCodeFree(code: string) {
    const taken = await this.prisma.warehouse.findFirst({
      where: { code: { equals: code, mode: 'insensitive' } },
      select: { id: true },
    });
    if (taken) throw new ConflictException(`A warehouse with code ${code} already exists`);
  }
}

function toRow(w: Warehouse, productsInStock: number): WarehouseRow {
  return {
    id: w.id,
    code: w.code,
    name: w.name,
    address: w.address,
    isActive: w.isActive,
    productsInStock,
  };
}

function snapshot(w: Warehouse): Prisma.InputJsonObject {
  return { code: w.code, name: w.name, address: w.address, isActive: w.isActive };
}
