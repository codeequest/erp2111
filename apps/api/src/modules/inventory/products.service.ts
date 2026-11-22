import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  BarcodeMatch,
  LowStockSummary,
  Paginated,
  ProductDetail,
  ProductListItem,
  ProductLookups,
  ProductPackUnit,
  ProductStockMove,
} from '@erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestUser } from '../../common/types/request-user';
import { audit } from '../../common/audit';
import { CatalogService } from './catalog.service';
import { SetPackUnitsDto } from './dto/catalog.dto';
import { CreateProductDto, ListProductsQueryDto, UpdateProductDto } from './dto/product.dto';

const PACK_UNIT_INCLUDE = {
  unit: { select: { id: true, code: true, name: true } },
} satisfies Prisma.ProductUnitInclude;

type PackUnitWithUnit = Prisma.ProductUnitGetPayload<{ include: typeof PACK_UNIT_INCLUDE }>;

const LOW_STOCK_PREVIEW = 10;

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
  ) {}

  // ── Reads ──────────────────────────────────────────────────────────────────

  async findAll(
    query: ListProductsQueryDto,
    user: RequestUser,
  ): Promise<Paginated<ProductListItem>> {
    const where = await this.buildWhere(query);

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

  /** The list filters as a Prisma where clause (also used by the CSV export). */
  async buildWhere(
    query: Pick<
      ListProductsQueryDto,
      'status' | 'categoryId' | 'lowStock' | 'search' | 'barcode' | 'barcodes'
    >,
  ): Promise<Prisma.ProductWhereInput> {
    const where: Prisma.ProductWhereInput = {};
    const and: Prisma.ProductWhereInput[] = [];
    if (query.status !== 'all') where.isActive = query.status === 'active';
    if (query.categoryId) {
      // A category includes the products of all its sub-categories.
      where.categoryId = { in: await this.catalog.categoryAndDescendantIds(query.categoryId) };
    }
    if (query.lowStock) {
      and.push({ id: { in: (await this.lowStockRows()).map((r) => r.id) } });
    }
    if (query.barcode === 'with') and.push({ barcode: { not: null } });
    if (query.barcode === 'without') and.push({ barcode: null });
    if (query.barcodes) {
      const codes = query.barcodes.split(/[\s,;]+/).filter(Boolean);
      and.push({ barcode: { in: codes } });
    }
    if (and.length) where.AND = and;
    if (query.search) {
      const contains = { contains: query.search, mode: 'insensitive' as const };
      where.OR = [{ name: contains }, { sku: contains }, { barcode: contains }];
    }
    return where;
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
        units: { include: PACK_UNIT_INCLUDE, orderBy: { factor: 'asc' } },
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
        ? {
            id: product.taxRate.id,
            name: product.taxRate.name,
            rate: product.taxRate.rate.toString(),
          }
        : null,
      stockByWarehouse: product.stockBalances.map((b) => ({
        warehouse: b.warehouse,
        quantity: b.quantity.toString(),
      })),
      packUnits: product.units.map(toPackUnit),
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
    const categories = await this.catalog.listCategories(false);
    const [units, taxRates] = await this.prisma.$transaction([
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

  /** Finds the product a scanned barcode belongs to: its own barcode or a pack size's. */
  async findByBarcode(code: string, user: RequestUser): Promise<BarcodeMatch> {
    const barcode = code.trim();
    const canSeeCost = user.permissions.has('inventory.cost.view');

    const product = await this.prisma.product.findUnique({
      where: { barcode },
      include: LIST_INCLUDE,
    });
    if (product) {
      const stock = await this.stockOnHand([product.id]);
      return { product: toListItem(product, stock.get(product.id), canSeeCost), packUnit: null };
    }

    const pack = await this.prisma.productUnit.findUnique({
      where: { barcode },
      include: { ...PACK_UNIT_INCLUDE, product: { include: LIST_INCLUDE } },
    });
    if (pack) {
      const stock = await this.stockOnHand([pack.productId]);
      return {
        product: toListItem(pack.product, stock.get(pack.productId), canSeeCost),
        packUnit: toPackUnit(pack),
      };
    }
    throw new NotFoundException(`No product has the barcode "${barcode}"`);
  }

  /** Active products below their minimum stock, largest shortfall first. */
  async lowStockSummary(): Promise<LowStockSummary> {
    const rows = await this.lowStockRows();
    const top = rows.slice(0, LOW_STOCK_PREVIEW);
    const products = await this.prisma.product.findMany({
      where: { id: { in: top.map((r) => r.id) } },
      include: { baseUnit: { select: { code: true } } },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    return {
      count: rows.length,
      items: top.flatMap((r) => {
        const p = byId.get(r.id);
        if (!p) return [];
        return [
          {
            id: p.id,
            sku: p.sku,
            name: p.name,
            unitCode: p.baseUnit.code,
            stockOnHand: r.on_hand.toString(),
            minStock: p.minStock.toString(),
          },
        ];
      }),
    };
  }

  private lowStockRows() {
    return this.prisma.$queryRaw<{ id: string; on_hand: Prisma.Decimal }[]>`
      SELECT p.id, COALESCE(SUM(b.quantity), 0) AS on_hand
      FROM products p
      LEFT JOIN stock_balances b ON b.product_id = p.id
      WHERE p.is_active AND p.min_stock > 0
      GROUP BY p.id, p.min_stock
      HAVING COALESCE(SUM(b.quantity), 0) < p.min_stock
      ORDER BY p.min_stock - COALESCE(SUM(b.quantity), 0) DESC, p.id`;
  }

  // ── Writes ─────────────────────────────────────────────────────────────────

  /**
   * Replaces the product's pack sizes (e.g. 1 CTN = 24 PCS) with the given list.
   * Order lines store the unit itself, not these rows, so replacing them is safe.
   */
  async setPackUnits(id: string, dto: SetPackUnitsDto, user: RequestUser): Promise<ProductDetail> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { units: { include: PACK_UNIT_INCLUDE } },
    });
    if (!product) throw new NotFoundException('Product not found');

    const seenUnits = new Set<string>();
    const seenBarcodes = new Set<string>();
    for (const u of dto.units) {
      if (u.unitId === product.baseUnitId) {
        throw new BadRequestException('The base unit cannot also be a pack size');
      }
      if (seenUnits.has(u.unitId))
        throw new BadRequestException('Each unit can be listed only once');
      seenUnits.add(u.unitId);
      if (new Prisma.Decimal(u.factor).lte(0)) {
        throw new BadRequestException('factor must be greater than 0');
      }
      if (u.barcode) {
        if (seenBarcodes.has(u.barcode) || u.barcode === product.barcode) {
          throw new BadRequestException(`Barcode "${u.barcode}" is used twice on this product`);
        }
        seenBarcodes.add(u.barcode);
      }
    }

    if (seenUnits.size) {
      const found = await this.prisma.unit.count({ where: { id: { in: [...seenUnits] } } });
      if (found !== seenUnits.size) throw new BadRequestException('Unit not found');
    }
    for (const barcode of seenBarcodes) await this.assertBarcodeFree(barcode, { packsOf: id });

    await this.runWrite(async (tx) => {
      await tx.productUnit.deleteMany({ where: { productId: id } });
      // Fixed prices of pack sizes that were removed go with them.
      await tx.priceListItem.deleteMany({
        where: {
          productId: id,
          unitId: { notIn: [product.baseUnitId, ...dto.units.map((u) => u.unitId)] },
        },
      });
      if (dto.units.length) {
        await tx.productUnit.createMany({
          data: dto.units.map((u) => ({
            productId: id,
            unitId: u.unitId,
            factor: u.factor,
            forPurchase: u.forPurchase,
            forSale: u.forSale,
            barcode: u.barcode ?? null,
          })),
        });
      }
      await audit(
        tx,
        user,
        'update',
        'Product',
        id,
        { packUnits: product.units.map(packSnapshot) },
        { packUnits: dto.units.map((u) => packSnapshot({ ...u, barcode: u.barcode ?? null })) },
      );
    });

    return this.findOne(id, user);
  }

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
          data: {
            userId: user.id,
            action: 'update',
            entity: 'Product',
            entityId: id,
            before,
            after,
          },
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

  async getOrThrow(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  /** Sum of stock across warehouses for each product id. */
  async stockOnHand(productIds: string[]): Promise<Map<string, Prisma.Decimal>> {
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
    if (barcode) await this.assertBarcodeFree(barcode, { productBarcodeOf: exceptId });
  }

  /**
   * A barcode must identify exactly one thing: a product or one of its pack sizes.
   *  - productBarcodeOf: ignore this product's own barcode (editing the product)
   *  - packsOf: ignore this product's pack barcodes (they are being replaced)
   */
  async assertBarcodeFree(
    barcode: string,
    except: { productBarcodeOf?: string; packsOf?: string },
  ) {
    const product = await this.prisma.product.findFirst({
      where: {
        barcode,
        ...(except.productBarcodeOf ? { id: { not: except.productBarcodeOf } } : {}),
      },
      select: { name: true },
    });
    if (product) {
      throw new ConflictException(`Barcode "${barcode}" is already used by "${product.name}"`);
    }
    const pack = await this.prisma.productUnit.findFirst({
      where: {
        barcode,
        ...(except.packsOf ? { productId: { not: except.packsOf } } : {}),
      },
      select: { unit: { select: { code: true } }, product: { select: { name: true } } },
    });
    if (pack) {
      throw new ConflictException(
        `Barcode "${barcode}" is already used by the ${pack.unit.code} pack of "${pack.product.name}"`,
      );
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
    imageUrl: productImageUrl(p.imageFile),
    isActive: p.isActive,
  };
  if (canSeeCost) item.averageCost = p.averageCost.toString();
  return item;
}

function auditSnapshot(
  p: Record<(typeof AUDITED_FIELDS)[number], unknown>,
): Prisma.InputJsonObject {
  const out: Record<string, string | boolean | null> = {};
  for (const f of AUDITED_FIELDS) {
    const v = p[f];
    out[f] = v === null || typeof v === 'boolean' ? v : String(v);
  }
  return out;
}

function toPackUnit(u: PackUnitWithUnit): ProductPackUnit {
  return {
    unit: u.unit,
    factor: u.factor.toString(),
    forPurchase: u.forPurchase,
    forSale: u.forSale,
    barcode: u.barcode,
  };
}

function packSnapshot(u: {
  unitId: string;
  factor: Prisma.Decimal | string;
  forPurchase: boolean;
  forSale: boolean;
  barcode: string | null;
}) {
  return {
    unitId: u.unitId,
    factor: u.factor.toString(),
    forPurchase: u.forPurchase,
    forSale: u.forSale,
    barcode: u.barcode,
  };
}

/** Public URL (relative to the site) of a stored product image. */
export function productImageUrl(file: string | null): string | null {
  return file ? `/api/v1/inventory/product-images/${file}` : null;
}
