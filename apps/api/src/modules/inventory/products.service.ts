import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Paginated, ProductDetail, ProductListItem } from '@erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestUser } from '../../common/types/request-user';
import { CreateProductDto, ListProductsQueryDto, UpdateProductDto } from './dto/product.dto';
import { rethrowPrismaError, toAuditJson } from './prisma-errors';

const productInclude = {
  category: { select: { id: true, name: true } },
  baseUnit: { select: { id: true, code: true, name: true } },
  taxRate: { select: { id: true, name: true, rate: true } },
  stockBalances: { select: { quantity: true } },
} satisfies Prisma.ProductInclude;

type ProductRow = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

/** Fields copied as-is from the DTO to Prisma (relations are handled separately). */
const SCALAR_FIELDS = ['sku', 'barcode', 'name', 'description', 'salePrice', 'minStock'] as const;

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    query: ListProductsQueryDto,
    user: RequestUser,
  ): Promise<Paginated<ProductListItem>> {
    const where: Prisma.ProductWhereInput = {};
    if (query.status === 'active') where.isActive = true;
    if (query.status === 'inactive') where.isActive = false;
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.search) {
      const contains = { contains: query.search, mode: 'insensitive' as const };
      where.OR = [{ sku: contains }, { name: contains }, { barcode: contains }];
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include: productInclude,
        // id as tie-breaker keeps pagination stable
        orderBy: [{ [query.sort]: query.order }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    const canViewCost = canSeeCost(user);
    return {
      items: rows.map((r) => toListItem(r, canViewCost)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async findOne(id: string, user: RequestUser): Promise<ProductDetail> {
    const row = await this.prisma.product.findUnique({ where: { id }, include: productInclude });
    if (!row) throw new NotFoundException('Product not found');
    return toDetail(row, canSeeCost(user));
  }

  async create(dto: CreateProductDto, user: RequestUser): Promise<ProductDetail> {
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.product.create({
          data: {
            sku: dto.sku,
            barcode: dto.barcode ?? null,
            name: dto.name,
            description: dto.description ?? null,
            salePrice: dto.salePrice,
            minStock: dto.minStock ?? 0,
            baseUnit: { connect: { id: dto.baseUnitId } },
            ...(dto.categoryId && { category: { connect: { id: dto.categoryId } } }),
            ...(dto.taxRateId && { taxRate: { connect: { id: dto.taxRateId } } }),
          },
          include: productInclude,
        });
        await tx.auditLog.create({
          data: {
            userId: user.id,
            action: 'create',
            entity: 'Product',
            entityId: created.id,
            after: toAuditJson(auditSnapshot(created)),
          },
        });
        return created;
      });
      return toDetail(row, canSeeCost(user));
    } catch (err) {
      rethrowPrismaError(err, 'Product');
    }
  }

  async update(id: string, dto: UpdateProductDto, user: RequestUser): Promise<ProductDetail> {
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const before = await tx.product.findUnique({ where: { id }, include: productInclude });
        if (!before) throw new NotFoundException('Product not found');

        // Stock and average cost are kept in the base unit: changing it would
        // silently reinterpret every past movement.
        if (dto.baseUnitId && dto.baseUnitId !== before.baseUnitId) {
          const moves = await tx.stockMove.count({ where: { productId: id } });
          if (moves > 0) {
            throw new ConflictException(
              'The base unit cannot be changed once the product has stock movements',
            );
          }
        }

        const data: Prisma.ProductUpdateInput = {};
        for (const field of SCALAR_FIELDS) {
          if (dto[field] !== undefined) (data as Record<string, unknown>)[field] = dto[field];
        }
        if (dto.baseUnitId) data.baseUnit = { connect: { id: dto.baseUnitId } };
        if (dto.categoryId !== undefined) {
          data.category = dto.categoryId
            ? { connect: { id: dto.categoryId } }
            : { disconnect: true };
        }
        if (dto.taxRateId !== undefined) {
          data.taxRate = dto.taxRateId ? { connect: { id: dto.taxRateId } } : { disconnect: true };
        }

        const after = await tx.product.update({ where: { id }, data, include: productInclude });
        await tx.auditLog.create({
          data: {
            userId: user.id,
            action: 'update',
            entity: 'Product',
            entityId: id,
            before: toAuditJson(auditSnapshot(before)),
            after: toAuditJson(auditSnapshot(after)),
          },
        });
        return after;
      });
      return toDetail(row, canSeeCost(user));
    } catch (err) {
      rethrowPrismaError(err, 'Product');
    }
  }

  /** Products are never deleted (history must stay intact); they are deactivated. */
  setActive(id: string, isActive: boolean, user: RequestUser): Promise<ProductDetail> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.product.findUnique({ where: { id }, include: productInclude });
      if (!before) throw new NotFoundException('Product not found');
      if (before.isActive === isActive) return toDetail(before, canSeeCost(user));

      const after = await tx.product.update({
        where: { id },
        data: { isActive },
        include: productInclude,
      });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: isActive ? 'activate' : 'deactivate',
          entity: 'Product',
          entityId: id,
          before: { isActive: before.isActive },
          after: { isActive },
        },
      });
      return toDetail(after, canSeeCost(user));
    });
  }
}

// ── mapping ──────────────────────────────────────────────────────────────────

export function canSeeCost(user: RequestUser): boolean {
  return user.permissions.has('inventory.cost.view');
}

export function toListItem(row: ProductRow, canViewCost: boolean): ProductListItem {
  const onHand = row.stockBalances.reduce((sum, b) => sum.plus(b.quantity), new Prisma.Decimal(0));
  return {
    id: row.id,
    sku: row.sku,
    barcode: row.barcode,
    name: row.name,
    category: row.category,
    baseUnit: row.baseUnit,
    salePrice: row.salePrice.toFixed(4),
    ...(canViewCost && { averageCost: row.averageCost.toFixed(4) }),
    minStock: row.minStock.toFixed(4),
    onHand: onHand.toFixed(4),
    isActive: row.isActive,
  };
}

export function toDetail(row: ProductRow, canViewCost: boolean): ProductDetail {
  return {
    ...toListItem(row, canViewCost),
    description: row.description,
    taxRate: row.taxRate && { ...row.taxRate, rate: row.taxRate.rate.toFixed(2) },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** What the audit log keeps about a product (no derived stock figures). */
function auditSnapshot(row: ProductRow) {
  const { stockBalances: _s, category: _c, baseUnit: _u, taxRate: _t, ...fields } = row;
  return fields;
}
