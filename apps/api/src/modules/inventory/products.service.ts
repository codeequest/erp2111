import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Product, ProductFormOptions, ProductListResponse, ProductStats } from '@erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestUser } from '../../common/types/request-user';
import { descendantIds } from './category-tree';
import { CreateProductDto, ProductListQueryDto, UpdateProductDto } from './dto/product.dto';
import { snapshot, uniqueViolationField } from './inventory-audit';

const productInclude = {
  category: { select: { id: true, name: true } },
  baseUnit: { select: { id: true, code: true, name: true } },
  taxRate: { select: { id: true, name: true, rate: true } },
} satisfies Prisma.ProductInclude;

type ProductRow = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ProductListQueryDto, user: RequestUser): Promise<ProductListResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const status = query.status ?? 'active';

    const where: Prisma.ProductWhereInput = {};
    if (status !== 'all') where.isActive = status === 'active';
    if (query.search) {
      const contains = { contains: query.search, mode: 'insensitive' as const };
      where.OR = [{ name: contains }, { sku: contains }, { barcode: contains }];
    }
    if (query.categoryId) {
      const nodes = await this.prisma.category.findMany({ select: { id: true, parentId: true } });
      where.categoryId = { in: descendantIds(nodes, query.categoryId) };
    }
    if (query.lowStock) where.id = { in: await this.lowStockIds() };

    const orderBy: Prisma.ProductOrderByWithRelationInput = {
      [query.sort ?? 'name']: query.order ?? 'asc',
    };

    const [rows, total, stats] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: productInclude,
        orderBy: [orderBy, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.product.count({ where }),
      this.stats(),
    ]);

    const onHand = await this.onHandFor(rows.map((r) => r.id));
    return {
      items: rows.map((r) => this.toProduct(r, onHand.get(r.id), user)),
      total,
      page,
      pageSize,
      stats,
    };
  }

  async findOne(id: string, user: RequestUser): Promise<Product> {
    const row = await this.prisma.product.findUnique({ where: { id }, include: productInclude });
    if (!row) throw new NotFoundException('Product not found');
    const onHand = await this.onHandFor([id]);
    return this.toProduct(row, onHand.get(id), user);
  }

  async formOptions(): Promise<ProductFormOptions> {
    const [categories, units, taxRates, settings, counts] = await Promise.all([
      this.prisma.category.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.unit.findMany({ orderBy: { code: 'asc' } }),
      this.prisma.taxRate.findMany({ where: { isActive: true }, orderBy: { rate: 'asc' } }),
      this.prisma.companySettings.findUnique({ where: { id: 1 }, select: { currency: true } }),
      this.prisma.product.groupBy({ by: ['categoryId'], _count: { _all: true } }),
    ]);
    const countBy = new Map(counts.map((c) => [c.categoryId, c._count._all]));
    return {
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        parentId: c.parentId,
        isActive: c.isActive,
        productCount: countBy.get(c.id) ?? 0,
      })),
      units: units.map((u) => ({ id: u.id, code: u.code, name: u.name })),
      taxRates: taxRates.map((t) => ({ id: t.id, name: t.name, rate: t.rate.toFixed(2) })),
      currency: settings?.currency ?? 'USD',
    };
  }

  async create(dto: CreateProductDto, user: RequestUser): Promise<Product> {
    await this.checkReferences(dto);
    const row = await this.withUniqueErrors(() =>
      this.prisma.$transaction(async (tx) => {
        const created = await tx.product.create({
          data: {
            sku: dto.sku,
            barcode: dto.barcode ?? null,
            name: dto.name,
            description: dto.description ?? null,
            categoryId: dto.categoryId ?? null,
            baseUnitId: dto.baseUnitId,
            taxRateId: dto.taxRateId ?? null,
            salePrice: dto.salePrice,
            minStock: dto.minStock,
          },
          include: productInclude,
        });
        await tx.auditLog.create({
          data: {
            userId: user.id,
            action: 'create',
            entity: 'Product',
            entityId: created.id,
            after: snapshot(created),
          },
        });
        return created;
      }),
    );
    return this.toProduct(row, undefined, user);
  }

  async update(id: string, dto: UpdateProductDto, user: RequestUser): Promise<Product> {
    await this.checkReferences(dto);
    const row = await this.withUniqueErrors(() =>
      this.prisma.$transaction(async (tx) => {
        const before = await tx.product.findUnique({ where: { id } });
        if (!before) throw new NotFoundException('Product not found');
        if (dto.baseUnitId && dto.baseUnitId !== before.baseUnitId) {
          const moves = await tx.stockMove.count({ where: { productId: id } });
          if (moves > 0) {
            throw new BadRequestException(
              'The base unit cannot change once the product has stock movements',
            );
          }
        }
        const updated = await tx.product.update({
          where: { id },
          data: {
            sku: dto.sku,
            barcode: dto.barcode,
            name: dto.name,
            description: dto.description,
            categoryId: dto.categoryId,
            baseUnitId: dto.baseUnitId,
            taxRateId: dto.taxRateId,
            salePrice: dto.salePrice,
            minStock: dto.minStock,
          },
          include: productInclude,
        });
        await tx.auditLog.create({
          data: {
            userId: user.id,
            action: 'update',
            entity: 'Product',
            entityId: id,
            before: snapshot(before),
            after: snapshot(updated),
          },
        });
        return updated;
      }),
    );
    const onHand = await this.onHandFor([id]);
    return this.toProduct(row, onHand.get(id), user);
  }

  async setActive(id: string, isActive: boolean, user: RequestUser): Promise<Product> {
    const row = await this.prisma.$transaction(async (tx) => {
      const before = await tx.product.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Product not found');
      const updated = await tx.product.update({
        where: { id },
        data: { isActive },
        include: productInclude,
      });
      if (before.isActive !== isActive) {
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
      }
      return updated;
    });
    const onHand = await this.onHandFor([id]);
    return this.toProduct(row, onHand.get(id), user);
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private async checkReferences(dto: UpdateProductDto) {
    const [category, unit, tax] = await Promise.all([
      dto.categoryId ? this.prisma.category.findUnique({ where: { id: dto.categoryId } }) : null,
      dto.baseUnitId ? this.prisma.unit.findUnique({ where: { id: dto.baseUnitId } }) : null,
      dto.taxRateId ? this.prisma.taxRate.findUnique({ where: { id: dto.taxRateId } }) : null,
    ]);
    if (dto.categoryId && !category) throw new BadRequestException('Category not found');
    if (dto.baseUnitId && !unit) throw new BadRequestException('Unit not found');
    if (dto.taxRateId && !tax) throw new BadRequestException('Tax rate not found');
  }

  private async withUniqueErrors<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      const field = uniqueViolationField(err);
      if (field === 'sku') throw new ConflictException('A product with this SKU already exists');
      if (field === 'barcode')
        throw new ConflictException('A product with this barcode already exists');
      if (field) throw new ConflictException(`Duplicate ${field}`);
      throw err;
    }
  }

  private async onHandFor(ids: string[]): Promise<Map<string, Prisma.Decimal>> {
    if (ids.length === 0) return new Map();
    const sums = await this.prisma.stockBalance.groupBy({
      by: ['productId'],
      where: { productId: { in: ids } },
      _sum: { quantity: true },
    });
    return new Map(sums.map((s) => [s.productId, s._sum.quantity ?? new Prisma.Decimal(0)]));
  }

  private async lowStockIds(): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT p.id
      FROM products p
      LEFT JOIN stock_balances b ON b.product_id = p.id
      WHERE p.min_stock > 0
      GROUP BY p.id, p.min_stock
      HAVING COALESCE(SUM(b.quantity), 0) < p.min_stock`;
    return rows.map((r) => r.id);
  }

  private async stats(): Promise<ProductStats> {
    const [active, inactive, low] = await Promise.all([
      this.prisma.product.count({ where: { isActive: true } }),
      this.prisma.product.count({ where: { isActive: false } }),
      this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count FROM (
          SELECT p.id
          FROM products p
          LEFT JOIN stock_balances b ON b.product_id = p.id
          WHERE p.min_stock > 0 AND p.is_active
          GROUP BY p.id, p.min_stock
          HAVING COALESCE(SUM(b.quantity), 0) < p.min_stock
        ) low`,
    ]);
    return { total: active + inactive, active, inactive, lowStock: Number(low[0]?.count ?? 0) };
  }

  private toProduct(
    row: ProductRow,
    onHand: Prisma.Decimal | undefined,
    user: RequestUser,
  ): Product {
    const qty = onHand ?? new Prisma.Decimal(0);
    const product: Product = {
      id: row.id,
      sku: row.sku,
      barcode: row.barcode,
      name: row.name,
      description: row.description,
      category: row.category,
      baseUnit: row.baseUnit,
      taxRate: row.taxRate
        ? { id: row.taxRate.id, name: row.taxRate.name, rate: row.taxRate.rate.toFixed(2) }
        : null,
      salePrice: row.salePrice.toFixed(4),
      minStock: row.minStock.toFixed(4),
      onHand: qty.toFixed(4),
      lowStock: row.minStock.gt(0) && qty.lt(row.minStock),
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
    if (user.permissions.has('inventory.cost.view')) {
      product.averageCost = row.averageCost.toFixed(4);
    }
    return product;
  }
}
