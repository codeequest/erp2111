import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Paginated, PermissionCode, ProductDetail, ProductListItem } from '@erp/shared';
import { Db } from '../../common/db';
import { roundQty } from '../../common/decimal';
import { isUniqueViolation } from '../../common/prisma-errors';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { selfAndDescendants } from './category-tree';
import {
  CreateProductDto,
  ProductQueryDto,
  ProductUnitDto,
  UpdateProductDto,
} from './dto/product.dto';
import { allBarcodes, productUnitProblems } from './product-rules';

type Perms = Set<PermissionCode>;

const LIST_INCLUDE = {
  category: { select: { id: true, name: true } },
  baseUnit: { select: { id: true, code: true } },
} satisfies Prisma.ProductInclude;

const DETAIL_INCLUDE = {
  ...LIST_INCLUDE,
  units: { include: { unit: true }, orderBy: { factor: 'asc' } },
} satisfies Prisma.ProductInclude;

type ProductWithList = Prisma.ProductGetPayload<{ include: typeof LIST_INCLUDE }>;
type ProductWithDetail = Prisma.ProductGetPayload<{ include: typeof DETAIL_INCLUDE }>;

/**
 * Product catalogue. Rules:
 *  - average cost is never set by hand (it comes from receipts) and is only
 *    returned to users holding inventory.cost.view;
 *  - the base unit is locked once any stock has moved;
 *  - products are deactivated, never deleted, and only when no stock is left.
 */
@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(query: ProductQueryDto, perms: Perms): Promise<Paginated<ProductListItem>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const status = query.status ?? 'active';

    const where: Prisma.ProductWhereInput = {};
    if (status !== 'all') where.isActive = status === 'active';
    if (query.categoryId) {
      const flat = await this.prisma.category.findMany({ select: { id: true, parentId: true } });
      where.categoryId = { in: selfAndDescendants(flat, query.categoryId) };
    }
    if (query.q) {
      const contains = { contains: query.q, mode: 'insensitive' as const };
      where.OR = [
        { sku: contains },
        { name: contains },
        { barcode: query.q },
        { units: { some: { barcode: query.q } } },
      ];
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include: LIST_INCLUDE,
        orderBy: [{ name: 'asc' }, { sku: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const onHand = perms.has('inventory.stock.read')
      ? await this.onHandByProduct(rows.map((r) => r.id))
      : null;

    return {
      items: rows.map((p) => this.toListItem(p, perms, onHand)),
      total,
      page,
      pageSize,
    };
  }

  async findOne(id: string, perms: Perms): Promise<ProductDetail> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: DETAIL_INCLUDE,
    });
    if (!product) throw new NotFoundException('Product not found');
    return this.toDetail(product, perms);
  }

  async create(dto: CreateProductDto, userId: string, perms: Perms): Promise<ProductDetail> {
    const units = dto.units ?? [];
    return this.write(async () => {
      const id = await this.prisma.$transaction(async (tx) => {
        await this.checkReferences(tx, dto, { categoryChanged: true, taxChanged: true });
        await this.checkUnits(tx, dto.baseUnitId, dto.barcode, units, null);

        const created = await tx.product.create({
          data: {
            sku: dto.sku,
            barcode: dto.barcode ?? null,
            name: dto.name,
            description: dto.description ?? null,
            categoryId: dto.categoryId ?? null,
            baseUnitId: dto.baseUnitId,
            taxRateId: dto.taxRateId ?? null,
            salePrice: roundQty(dto.salePrice ?? '0'),
            minStock: roundQty(dto.minStock ?? '0'),
            units: { create: units.map(toUnitRow) },
          },
          include: { units: true },
        });
        await this.audit.log(tx, {
          userId,
          action: 'create',
          entity: 'Product',
          entityId: created.id,
          after: created,
        });
        return created.id;
      });
      return this.findOne(id, perms);
    });
  }

  async update(
    id: string,
    dto: UpdateProductDto,
    userId: string,
    perms: Perms,
  ): Promise<ProductDetail> {
    if (dto.sku === null || dto.name === null || dto.baseUnitId === null) {
      throw new BadRequestException('sku, name and baseUnitId cannot be empty');
    }
    if (dto.isActive === false) {
      throw new BadRequestException('Use POST /inventory/products/:id/deactivate to deactivate');
    }

    return this.write(async () => {
      await this.prisma.$transaction(async (tx) => {
        const before = await tx.product.findUnique({ where: { id }, include: { units: true } });
        if (!before) throw new NotFoundException('Product not found');

        const baseUnitId = dto.baseUnitId ?? before.baseUnitId;
        if (baseUnitId !== before.baseUnitId && (await this.hasStockMoves(tx, id))) {
          throw new BadRequestException(
            'The base unit cannot change once stock has moved for this product',
          );
        }

        await this.checkReferences(
          tx,
          { baseUnitId, categoryId: dto.categoryId, taxRateId: dto.taxRateId },
          {
            categoryChanged: dto.categoryId !== undefined && dto.categoryId !== before.categoryId,
            taxChanged: dto.taxRateId !== undefined && dto.taxRateId !== before.taxRateId,
          },
        );
        const barcode = dto.barcode === undefined ? before.barcode : dto.barcode;
        const units: ProductUnitDto[] =
          dto.units ?? before.units.map((u) => ({ ...u, factor: u.factor.toString() }));
        await this.checkUnits(tx, baseUnitId, barcode, units, id);

        const after = await tx.product.update({
          where: { id },
          data: {
            sku: dto.sku,
            barcode: dto.barcode,
            name: dto.name,
            description: dto.description,
            categoryId: dto.categoryId,
            baseUnitId: dto.baseUnitId,
            taxRateId: dto.taxRateId,
            salePrice: dto.salePrice === undefined ? undefined : roundQty(dto.salePrice),
            minStock: dto.minStock === undefined ? undefined : roundQty(dto.minStock),
            isActive: dto.isActive,
            ...(dto.units && {
              units: { deleteMany: {}, create: dto.units.map(toUnitRow) },
            }),
          },
          include: { units: true },
        });
        await this.audit.log(tx, {
          userId,
          action: dto.isActive && !before.isActive ? 'activate' : 'update',
          entity: 'Product',
          entityId: id,
          before,
          after,
        });
      });
      return this.findOne(id, perms);
    });
  }

  async deactivate(id: string, userId: string, perms: Perms): Promise<ProductDetail> {
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.product.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Product not found');
      if (!before.isActive) return;

      const stocked = await tx.stockBalance.count({
        where: { productId: id, quantity: { not: 0 } },
      });
      if (stocked > 0) {
        throw new BadRequestException(
          `This product still has stock in ${stocked} warehouse(s). Sell, transfer or adjust it to zero first.`,
        );
      }
      const after = await tx.product.update({ where: { id }, data: { isActive: false } });
      await this.audit.log(tx, {
        userId,
        action: 'deactivate',
        entity: 'Product',
        entityId: id,
        before,
        after,
      });
    });
    return this.findOne(id, perms);
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private async checkReferences(
    db: Db,
    dto: { baseUnitId: string; categoryId?: string | null; taxRateId?: string | null },
    changed: { categoryChanged: boolean; taxChanged: boolean },
  ) {
    const unit = await db.unit.findUnique({ where: { id: dto.baseUnitId } });
    if (!unit) throw new BadRequestException('Base unit not found');

    // Only a NEW category / tax rate must be active; an existing one may have been
    // deactivated since, and the product can keep it.
    if (dto.categoryId && changed.categoryChanged) {
      const category = await db.category.findUnique({ where: { id: dto.categoryId } });
      if (!category) throw new BadRequestException('Category not found');
      if (!category.isActive) throw new BadRequestException('Category is inactive');
    }
    if (dto.taxRateId && changed.taxChanged) {
      const tax = await db.taxRate.findUnique({ where: { id: dto.taxRateId } });
      if (!tax) throw new BadRequestException('Tax rate not found');
      if (!tax.isActive) throw new BadRequestException('Tax rate is inactive');
    }
  }

  private async checkUnits(
    db: Db,
    baseUnitId: string,
    barcode: string | null | undefined,
    units: ProductUnitDto[],
    productId: string | null,
  ) {
    const problems = productUnitProblems(baseUnitId, barcode, units);
    if (problems.length) throw new BadRequestException(problems);

    if (units.length) {
      const ids = [...new Set(units.map((u) => u.unitId))];
      const found = await db.unit.count({ where: { id: { in: ids } } });
      if (found !== ids.length) throw new BadRequestException('Unknown unit in the units list');
    }

    // A barcode must identify one thing: check both product and unit barcodes.
    const barcodes = allBarcodes(barcode, units);
    if (barcodes.length) {
      const notSelf = productId ? { not: productId } : undefined;
      const [p, u] = await Promise.all([
        db.product.findFirst({
          where: { barcode: { in: barcodes }, id: notSelf },
          select: { sku: true, barcode: true },
        }),
        db.productUnit.findFirst({
          where: { barcode: { in: barcodes }, productId: notSelf },
          select: { barcode: true, product: { select: { sku: true } } },
        }),
      ]);
      const clash = p
        ? { barcode: p.barcode, sku: p.sku }
        : u && { barcode: u.barcode, sku: u.product.sku };
      if (clash) {
        throw new ConflictException(`Barcode "${clash.barcode}" is already used by ${clash.sku}`);
      }
    }
  }

  private async hasStockMoves(db: Db, productId: string) {
    return (await db.stockMove.findFirst({ where: { productId }, select: { id: true } })) !== null;
  }

  private async onHandByProduct(ids: string[]) {
    if (!ids.length) return new Map<string, string>();
    const sums = await this.prisma.stockBalance.groupBy({
      by: ['productId'],
      where: { productId: { in: ids } },
      _sum: { quantity: true },
    });
    return new Map(sums.map((s) => [s.productId, (s._sum.quantity ?? 0).toString()]));
  }

  private toListItem(
    p: ProductWithList,
    perms: Perms,
    onHand: Map<string, string> | null,
  ): ProductListItem {
    return {
      id: p.id,
      sku: p.sku,
      barcode: p.barcode,
      name: p.name,
      category: p.category,
      baseUnit: p.baseUnit,
      salePrice: p.salePrice.toString(),
      minStock: p.minStock.toString(),
      isActive: p.isActive,
      ...(perms.has('inventory.cost.view') && { averageCost: p.averageCost.toString() }),
      ...(onHand && { onHand: onHand.get(p.id) ?? '0' }),
    };
  }

  private async toDetail(p: ProductWithDetail, perms: Perms): Promise<ProductDetail> {
    const onHand = perms.has('inventory.stock.read') ? await this.onHandByProduct([p.id]) : null;
    return {
      ...this.toListItem(p, perms, onHand),
      description: p.description,
      taxRateId: p.taxRateId,
      units: p.units.map((u) => ({
        unitId: u.unitId,
        unitCode: u.unit.code,
        unitName: u.unit.name,
        factor: u.factor.toString(),
        forPurchase: u.forPurchase,
        forSale: u.forSale,
        barcode: u.barcode,
      })),
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      hasStockMoves: await this.hasStockMoves(this.prisma, p.id),
    };
  }

  /** Maps a DB unique violation (race with the explicit checks) to a 409. */
  private async write<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (isUniqueViolation(e)) {
        const target = (e as Prisma.PrismaClientKnownRequestError).meta?.target;
        const fields = Array.isArray(target) ? target.join(', ') : String(target ?? 'value');
        throw new ConflictException(
          fields.includes('sku')
            ? 'This SKU is already used by another product'
            : `Duplicate ${fields}`,
        );
      }
      throw e;
    }
  }
}

function toUnitRow(u: ProductUnitDto) {
  return {
    unitId: u.unitId,
    factor: roundQty(u.factor),
    forPurchase: u.forPurchase ?? true,
    forSale: u.forSale ?? true,
    barcode: u.barcode ?? null,
  };
}
