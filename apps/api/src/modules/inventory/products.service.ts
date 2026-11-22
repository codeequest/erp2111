import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  Paginated,
  ProductDetail,
  ProductListItem,
  ProductLookups,
  ProductStockMove,
} from '@erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestUser } from '../../common/types/request-user';
import { CreateProductDto, ListProductsQueryDto, UpdateProductDto } from './dto/product.dto';

const LIST_INCLUDE = {
  category: { select: { id: true, name: true } },
  baseUnit: { select: { id: true, code: true, name: true } },
} satisfies Prisma.ProductInclude;

type ProductWithRefs = Prisma.ProductGetPayload<{ include: typeof LIST_INCLUDE }>;

const RECENT_MOVES = 20;

/** Fields stored in the audit log (never the computed average cost). */
const AUDITED_FIELDS = [
  'sku',
  'barcode',
  'name',
  'description',
  'categoryId',
  'baseUnitId',
  'taxRateId',
  'salePrice',
  'minStock',
  'isActive',
] as const;

/**
 * Product catalogue.
 * Every write runs in a transaction together with its AuditLog row.
 * Average cost is computed by goods receipts, never edited here, and is only
 * returned to users holding inventory.cost.view.
 */
@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Reads ──────────────────────────────────────────────────────────────────

  async findAll(query: ListProductsQueryDto, user: RequestUser): Promise<Paginated<ProductListItem>> {
    const where: Prisma.ProductWhereInput = {};
    if (query.status !== 'all') where.isActive = query.status === 'active';
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.search) {
      const contains = { contains: query.search, mode: 'insensitive' as const };
      where.OR = [{ name: contains }, { sku: contains }, { barcode: contains }];
    }

    const [total, products] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include: LIST_INCLUDE,
        // Secondary sort on id keeps paging stable when values are equal.
        orderBy: [{ [query.sort]: query.order }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    const stock = await this.stockOnHand(products.map((p) => p.id));
    const canSeeCost = user.permissions.has('inventory.cost.view');

    return {
      items: products.map((p) => toListItem(p, stock.get(p.id), canSeeCost)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async findOne(id: string, user: RequestUser): Promise<ProductDetail> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        ...LIST_INCLUDE,
        taxRate: { select: { id: true, name: true, rate: true } },
        stockBalances: {
          include: { warehouse: { select: { id: true, code: true, name: true } } },
          orderBy: { warehouse: { code: 'asc' } },
        },
      },
    });
    if (!product) throw new NotFoundException('Product not found');

    const canSeeCost = user.permissions.has('inventory.cost.view');
    const total = product.stockBalances.reduce(
      (sum, b) => sum.add(b.quantity),
      new Prisma.Decimal(0),
    );

    const detail: ProductDetail = {
      ...toListItem(product, total, canSeeCost),
      description: product.description,
      taxRate: product.taxRate
        ? { id: product.taxRate.id, name: product.taxRate.name, rate: product.taxRate.rate.toString() }
        : null,
      stockByWarehouse: product.stockBalances.map((b) => ({
        warehouse: b.warehouse,
        quantity: b.quantity.toString(),
      })),
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    };

    // The stock ledger is covered by its own permission.
    if (user.permissions.has('inventory.stock.read')) {
      const moves = await this.prisma.stockMove.findMany({
        where: { productId: id },
        include: { warehouse: { select: { id: true, code: true } } },
        orderBy: { createdAt: 'desc' },
        take: RECENT_MOVES,
      });
      detail.recentMoves = moves.map((m) => {
        const move: ProductStockMove = {
          id: m.id,
          type: m.type,
          quantity: m.quantity.toString(),
          reference: m.reference,
          reason: m.reason,
          warehouse: m.warehouse,
          createdAt: m.createdAt.toISOString(),
        };
        if (canSeeCost) move.unitCost = m.unitCost.toString();
        return move;
      });
    }

    return detail;
  }

  async lookups(): Promise<ProductLookups> {
    const [categories, units, taxRates] = await this.prisma.$transaction([
      this.prisma.category.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.unit.findMany({
        select: { id: true, code: true, name: true },
        orderBy: { code: 'asc' },
      }),
      this.prisma.taxRate.findMany({
        where: { isActive: true },
        select: { id: true, name: true, rate: true },
        orderBy: { rate: 'asc' },
      }),
    ]);
    return {
      categories,
      units,
      taxRates: taxRates.map((t) => ({ ...t, rate: t.rate.toString() })),
    };
  }

  // ── Writes ─────────────────────────────────────────────────────────────────

  async create(dto: CreateProductDto, user: RequestUser): Promise<ProductDetail> {
    await this.assertUnique(dto.sku, dto.barcode ?? null);
    await this.assertReferencesExist(dto);

    const id = await this.runWrite(async (tx) => {
      const product = await tx.product.create({
        data: {
          sku: dto.sku,
          barcode: dto.barcode ?? null,
          name: dto.name,
          description: dto.description ?? null,
          categoryId: dto.categoryId ?? null,
          baseUnitId: dto.baseUnitId,
          taxRateId: dto.taxRateId ?? null,
          salePrice: dto.salePrice,
          minStock: dto.minStock ?? '0',
        },
      });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'create',
          entity: 'Product',
          entityId: product.id,
          after: auditSnapshot(product),
        },
      });
      return product.id;
    });

    return this.findOne(id, user);
  }

  async update(id: string, dto: UpdateProductDto, user: RequestUser): Promise<ProductDetail> {
    const existing = await this.getOrThrow(id);

    // Required columns cannot be cleared; null means "not sent" for them.
    for (const field of ['sku', 'name', 'baseUnitId', 'salePrice', 'minStock'] as const) {
      if (dto[field] === null) throw new BadRequestException(`${field} cannot be empty`);
    }

    const data: Prisma.ProductUncheckedUpdateInput = {};
    if (dto.sku !== undefined) data.sku = dto.sku;
    if (dto.barcode !== undefined) data.barcode = dto.barcode;
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.categoryId !== undefined) data.categoryId = dto.categoryId;
    if (dto.baseUnitId !== undefined) data.baseUnitId = dto.baseUnitId;
    if (dto.taxRateId !== undefined) data.taxRateId = dto.taxRateId;
    if (dto.salePrice !== undefined) data.salePrice = dto.salePrice;
    if (dto.minStock !== undefined) data.minStock = dto.minStock;

    if (dto.baseUnitId !== undefined && dto.baseUnitId !== existing.baseUnitId) {
      // Stock is stored in the base unit; changing it would silently rescale every quantity.
      const moves = await this.prisma.stockMove.count({ where: { productId: id } });
      if (moves > 0) {
        throw new BadRequestException(
          'The base unit cannot be changed once the product has stock movements',
        );
      }
    }

    await this.assertUnique(
      dto.sku !== undefined && dto.sku !== existing.sku ? dto.sku : null,
      dto.barcode && dto.barcode !== existing.barcode ? dto.barcode : null,
      id,
    );
    await this.assertReferencesExist(dto);

    await this.runWrite(async (tx) => {
      const updated = await tx.product.update({ where: { id }, data });
      const before = auditSnapshot(existing);
      const after = auditSnapshot(updated);
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        await tx.auditLog.create({
          data: { userId: user.id, action: 'update', entity: 'Product', entityId: id, before, after },
        });
      }
    });

    return this.findOne(id, user);
  }

  async setActive(id: string, isActive: boolean, user: RequestUser): Promise<ProductDetail> {
    const existing = await this.getOrThrow(id);
    if (existing.isActive !== isActive) {
      await this.runWrite(async (tx) => {
        await tx.product.update({ where: { id }, data: { isActive } });
        await tx.auditLog.create({
          data: {
            userId: user.id,
            action: isActive ? 'activate' : 'deactivate',
            entity: 'Product',
            entityId: id,
            before: { isActive: existing.isActive },
            after: { isActive },
          },
        });
      });
    }
    return this.findOne(id, user);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async getOrThrow(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  /** Sum of stock across warehouses for each product id. */
  private async stockOnHand(productIds: string[]): Promise<Map<string, Prisma.Decimal>> {
    if (productIds.length === 0) return new Map();
    const rows = await this.prisma.stockBalance.groupBy({
      by: ['productId'],
      where: { productId: { in: productIds } },
      _sum: { quantity: true },
    });
    return new Map(rows.map((r) => [r.productId, r._sum.quantity ?? new Prisma.Decimal(0)]));
  }

  /** Friendly 409 before hitting the unique index. Pass null to skip a check. */
  private async assertUnique(sku: string | null, barcode: string | null, exceptId?: string) {
    const not = exceptId ? { id: { not: exceptId } } : {};
    if (sku) {
      const clash = await this.prisma.product.findFirst({
        where: { sku: { equals: sku, mode: 'insensitive' }, ...not },
        select: { name: true },
      });
      if (clash) throw new ConflictException(`SKU "${sku}" is already used by "${clash.name}"`);
    }
    if (barcode) {
      const clash = await this.prisma.product.findFirst({
        where: { barcode, ...not },
        select: { name: true },
      });
      if (clash) {
        throw new ConflictException(`Barcode "${barcode}" is already used by "${clash.name}"`);
      }
    }
  }

  private async assertReferencesExist(dto: UpdateProductDto) {
    if (dto.categoryId) {
      const found = await this.prisma.category.findUnique({ where: { id: dto.categoryId } });
      if (!found) throw new BadRequestException('Category not found');
    }
    if (dto.baseUnitId) {
      const found = await this.prisma.unit.findUnique({ where: { id: dto.baseUnitId } });
      if (!found) throw new BadRequestException('Unit not found');
    }
    if (dto.taxRateId) {
      const found = await this.prisma.taxRate.findUnique({ where: { id: dto.taxRateId } });
      if (!found) throw new BadRequestException('Tax rate not found');
    }
  }

  /** Runs a write transaction; turns a race on a unique index into a 409. */
  private async runWrite<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(fn);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const target = String((e.meta?.target as string[] | undefined)?.join(', ') ?? 'value');
        throw new ConflictException(`A product with this ${target} already exists`);
      }
      throw e;
    }
  }
}

export function toListItem(
  p: ProductWithRefs,
  stockOnHand: Prisma.Decimal | undefined,
  canSeeCost: boolean,
): ProductListItem {
  const item: ProductListItem = {
    id: p.id,
    sku: p.sku,
    barcode: p.barcode,
    name: p.name,
    category: p.category,
    baseUnit: p.baseUnit,
    salePrice: p.salePrice.toString(),
    minStock: p.minStock.toString(),
    stockOnHand: (stockOnHand ?? new Prisma.Decimal(0)).toString(),
    isActive: p.isActive,
  };
  if (canSeeCost) item.averageCost = p.averageCost.toString();
  return item;
}

function auditSnapshot(p: Record<(typeof AUDITED_FIELDS)[number], unknown>): Prisma.InputJsonObject {
  const out: Record<string, string | boolean | null> = {};
  for (const f of AUDITED_FIELDS) {
    const v = p[f];
    out[f] = v === null || typeof v === 'boolean' ? v : String(v);
  }
  return out;
}
