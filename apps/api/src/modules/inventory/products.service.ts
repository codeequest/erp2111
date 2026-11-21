import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SalesOrderStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../core/audit/audit.service';
import { RequestUser } from '../../common/types/request-user';
import {
  CreateProductDto,
  GenerateVariantsDto,
  ListProductsQueryDto,
  PriceInputDto,
  SetPricesDto,
  UpdateProductDto,
  VariantOptionDto,
} from './dto/product.dto';
import {
  buildVariantCombinations,
  marginPct,
  normalizeVariantOptions,
  stockCoverageDays,
  VariantOption,
  VariantValues,
  variantKey,
  variantName,
  variantSku,
} from './product-rules';
import { rethrowPrismaError } from './prisma-errors';
import { imageUrl } from './product-images.service';

const D = Prisma.Decimal;
type Decimal = Prisma.Decimal;
type Tx = Prisma.TransactionClient;

/** Sales order statuses that count as real sales in the KPIs. */
const SOLD_STATUSES: SalesOrderStatus[] = ['CONFIRMED', 'PARTIALLY_DELIVERED', 'DELIVERED'];

/** Fields a parent product shares with all its variants. */
const SHARED_WITH_VARIANTS = ['categoryId', 'baseUnitId', 'taxRateId', 'description'] as const;

function canSeeCost(user: RequestUser) {
  return user.permissions.has('inventory.cost.view');
}

function badRequestFromRule<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    throw new BadRequestException((e as Error).message);
  }
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ───────────────────────────────── List ─────────────────────────────────

  async findAll(query: ListProductsQueryDto, user: RequestUser) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 25, 100);
    const status = query.status ?? 'active';

    const where: Prisma.ProductWhereInput = {};
    if (status !== 'all') where.isActive = status === 'active';
    if (query.categoryId) where.categoryId = query.categoryId;

    if (query.lowStock) {
      // Low stock is about real stock-holding rows: simple products and variants.
      where.id = { in: await this.lowStockIds() };
    } else {
      // The catalogue shows simple products and variant parents, not each variant.
      where.parentId = null;
    }

    const q = query.q?.trim();
    if (q) {
      const match: Prisma.ProductWhereInput[] = [
        { name: { contains: q, mode: 'insensitive' } },
        { sku: { contains: q, mode: 'insensitive' } },
        { barcode: { contains: q, mode: 'insensitive' } },
      ];
      where.OR = [
        ...match,
        // A parent matches when one of its variants matches (e.g. scanning a variant barcode).
        { variants: { some: { OR: match } } },
      ];
    }

    const sort = query.sort ?? 'name';
    const order = query.order ?? 'asc';

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        orderBy: [{ [sort]: order }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          category: { select: { id: true, name: true } },
          baseUnit: { select: { id: true, code: true } },
          parent: { select: { id: true, name: true } },
          images: { where: { isMain: true }, take: 1 },
          variants: { select: { id: true } },
        },
      }),
    ]);

    const stockIds = rows.flatMap((p) => (p.hasVariants ? p.variants.map((v) => v.id) : [p.id]));
    const onHandById = await this.onHandByProduct(stockIds);
    const minByVariant = new Map<string, Decimal>();
    if (rows.some((p) => p.hasVariants)) {
      const variantMins = await this.prisma.product.findMany({
        where: { parentId: { in: rows.filter((p) => p.hasVariants).map((p) => p.id) } },
        select: { id: true, minStock: true, isActive: true },
      });
      variantMins.forEach((v) => v.isActive && minByVariant.set(v.id, v.minStock));
    }

    const items = rows.map((p) => {
      let onHand = new D(0);
      let lowStock = false;
      if (p.hasVariants) {
        for (const v of p.variants) {
          const qty = onHandById.get(v.id) ?? new D(0);
          onHand = onHand.plus(qty);
          const min = minByVariant.get(v.id);
          if (min && min.gt(0) && qty.lt(min)) lowStock = true;
        }
      } else {
        onHand = onHandById.get(p.id) ?? new D(0);
        lowStock = p.isActive && p.minStock.gt(0) && onHand.lt(p.minStock);
      }
      return {
        id: p.id,
        sku: p.sku,
        barcode: p.barcode,
        name: p.name,
        category: p.category,
        baseUnit: p.baseUnit,
        parent: p.parent,
        salePrice: p.salePrice,
        ...(canSeeCost(user) ? { averageCost: p.averageCost } : {}),
        minStock: p.minStock,
        isActive: p.isActive,
        hasVariants: p.hasVariants,
        variantCount: p.variants.length,
        variantValues: p.variantValues,
        onHand,
        lowStock,
        imageUrl: p.images[0] ? imageUrl(p.images[0].path) : null,
      };
    });

    return { items, total, page, pageSize };
  }

  // ──────────────────────────────── Detail ────────────────────────────────

  async findOne(id: string, user: RequestUser) {
    const p = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true } },
        baseUnit: true,
        taxRate: { select: { id: true, name: true, rate: true } },
        parent: { select: { id: true, name: true, sku: true } },
        units: { include: { unit: true }, orderBy: { factor: 'asc' } },
        images: { orderBy: [{ isMain: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }] },
        prices: true,
        variants: {
          orderBy: { sku: 'asc' },
          include: { prices: true, images: { where: { isMain: true }, take: 1 } },
        },
      },
    });
    if (!p) throw new NotFoundException('Product not found');

    const showCost = canSeeCost(user);
    const stockIds = p.hasVariants ? p.variants.map((v) => v.id) : [p.id];
    const [priceLists, balances, moves, onHandById] = await Promise.all([
      this.prisma.priceList.findMany({ where: { isActive: true }, orderBy: { code: 'desc' } }),
      this.prisma.stockBalance.findMany({
        where: { productId: { in: stockIds } },
        include: { warehouse: { select: { id: true, code: true, name: true } } },
      }),
      this.prisma.stockMove.findMany({
        where: { productId: { in: stockIds } },
        orderBy: { createdAt: 'desc' },
        take: 15,
        include: {
          warehouse: { select: { code: true } },
          product: { select: { sku: true } },
          createdBy: { select: { fullName: true } },
        },
      }),
      this.onHandByProduct(stockIds),
    ]);

    // Stock per warehouse (summed over variants for a parent)
    const perWarehouse = new Map<
      string,
      { warehouse: { id: string; code: string; name: string }; quantity: Decimal }
    >();
    for (const b of balances) {
      const row = perWarehouse.get(b.warehouseId) ?? { warehouse: b.warehouse, quantity: new D(0) };
      row.quantity = row.quantity.plus(b.quantity);
      perWarehouse.set(b.warehouseId, row);
    }

    const priceRows = (prices: { priceListId: string; price: Decimal }[]) =>
      priceLists.map((pl) => ({
        priceList: { id: pl.id, code: pl.code, name: pl.name },
        price: prices.find((x) => x.priceListId === pl.id)?.price ?? null,
      }));

    const onHand = stockIds.reduce((s, sid) => s.plus(onHandById.get(sid) ?? 0), new D(0));

    return {
      id: p.id,
      sku: p.sku,
      barcode: p.barcode,
      name: p.name,
      description: p.description,
      category: p.category,
      baseUnit: p.baseUnit,
      taxRate: p.taxRate,
      salePrice: p.salePrice,
      ...(showCost ? { averageCost: p.averageCost } : {}),
      minStock: p.minStock,
      isActive: p.isActive,
      hasVariants: p.hasVariants,
      variantOptions: p.variantOptions,
      variantValues: p.variantValues,
      parent: p.parent,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      onHand,
      units: p.units.map((u) => ({
        id: u.id,
        unit: u.unit,
        factor: u.factor,
        forPurchase: u.forPurchase,
        forSale: u.forSale,
        barcode: u.barcode,
      })),
      images: p.images.map((i) => ({
        id: i.id,
        url: imageUrl(i.path),
        fileName: i.fileName,
        isMain: i.isMain,
      })),
      prices: priceRows(p.prices),
      variants: p.variants.map((v) => {
        const qty = onHandById.get(v.id) ?? new D(0);
        return {
          id: v.id,
          sku: v.sku,
          barcode: v.barcode,
          name: v.name,
          variantValues: v.variantValues,
          salePrice: v.salePrice,
          ...(showCost ? { averageCost: v.averageCost } : {}),
          minStock: v.minStock,
          isActive: v.isActive,
          onHand: qty,
          lowStock: v.isActive && v.minStock.gt(0) && qty.lt(v.minStock),
          prices: priceRows(v.prices),
          imageUrl: v.images[0] ? imageUrl(v.images[0].path) : null,
        };
      }),
      stock: [...perWarehouse.values()].sort((a, b) =>
        a.warehouse.code.localeCompare(b.warehouse.code),
      ),
      recentMoves: moves.map((m) => ({
        id: m.id,
        createdAt: m.createdAt,
        type: m.type,
        sku: m.product.sku,
        warehouse: m.warehouse.code,
        quantity: m.quantity,
        reference: m.reference,
        reason: m.reason,
        createdBy: m.createdBy.fullName,
      })),
    };
  }

  // ──────────────────────────────── Create ────────────────────────────────

  async create(dto: CreateProductDto, user: RequestUser) {
    const options = dto.hasVariants
      ? badRequestFromRule(() => normalizeVariantOptions(dto.variantOptions ?? []))
      : null;
    const combos = options ? badRequestFromRule(() => buildVariantCombinations(options)) : [];

    try {
      return await this.prisma.$transaction(async (tx) => {
        const base = {
          name: dto.name.trim(),
          description: dto.description ?? null,
          categoryId: dto.categoryId ?? null,
          baseUnitId: dto.baseUnitId,
          taxRateId: dto.taxRateId ?? null,
          salePrice: new D(dto.salePrice),
          minStock: new D(dto.minStock ?? 0),
        };
        const product = await tx.product.create({
          data: {
            ...base,
            sku: dto.sku.trim(),
            barcode: dto.barcode?.trim() || null,
            hasVariants: !!options,
            variantOptions: options ? (options as unknown as Prisma.InputJsonValue) : undefined,
          },
        });

        const variantIds = await this.createVariants(tx, product, combos);
        if (dto.prices?.length) {
          await this.writePrices(tx, [product.id, ...variantIds], dto.prices);
        }

        await this.audit.record(
          {
            userId: user.id,
            action: 'create',
            entity: 'Product',
            entityId: product.id,
            after: { ...product, variantCount: variantIds.length, prices: dto.prices ?? [] },
          },
          tx,
        );
        return { id: product.id, variantCount: variantIds.length };
      });
    } catch (e) {
      rethrowPrismaError(e);
    }
  }

  // ──────────────────────────────── Update ────────────────────────────────

  async update(id: string, dto: UpdateProductDto, user: RequestUser) {
    const before = await this.prisma.product.findUnique({
      where: { id },
      include: { variants: { select: { id: true, variantValues: true } } },
    });
    if (!before) throw new NotFoundException('Product not found');

    if (dto.baseUnitId && dto.baseUnitId !== before.baseUnitId) {
      const ids = [before.id, ...before.variants.map((v) => v.id)];
      const moves = await this.prisma.stockMove.count({ where: { productId: { in: ids } } });
      if (moves > 0) {
        throw new BadRequestException(
          'The base unit cannot change once the product has stock movements',
        );
      }
    }

    const data: Prisma.ProductUncheckedUpdateInput = {};
    if (dto.sku !== undefined) data.sku = dto.sku.trim();
    if (dto.barcode !== undefined) data.barcode = dto.barcode?.trim() || null;
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.categoryId !== undefined) data.categoryId = dto.categoryId;
    if (dto.baseUnitId !== undefined) data.baseUnitId = dto.baseUnitId;
    if (dto.taxRateId !== undefined) data.taxRateId = dto.taxRateId;
    if (dto.salePrice !== undefined) data.salePrice = new D(dto.salePrice);
    if (dto.minStock !== undefined) data.minStock = new D(dto.minStock);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const after = await tx.product.update({ where: { id }, data });

        if (before.hasVariants && before.variants.length > 0) {
          // Shared fields follow the parent.
          const shared: Prisma.ProductUncheckedUpdateManyInput = {};
          for (const f of SHARED_WITH_VARIANTS) {
            if (data[f] !== undefined) (shared as Record<string, unknown>)[f] = data[f];
          }
          if (Object.keys(shared).length) {
            await tx.product.updateMany({ where: { parentId: id }, data: shared });
          }
          // Variant names follow the parent name.
          if (dto.name !== undefined && after.name !== before.name) {
            for (const v of before.variants) {
              await tx.product.update({
                where: { id: v.id },
                data: { name: variantName(after.name, (v.variantValues ?? {}) as VariantValues) },
              });
            }
          }
        }

        await this.audit.record(
          {
            userId: user.id,
            action: 'update',
            entity: 'Product',
            entityId: id,
            before: { ...before, variants: undefined },
            after,
          },
          tx,
        );
        return { id };
      });
    } catch (e) {
      rethrowPrismaError(e);
    }
  }

  async setActive(id: string, isActive: boolean, user: RequestUser) {
    const before = await this.prisma.product.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Product not found');

    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({ where: { id }, data: { isActive } });
      // A parent switches all its variants with it.
      let variants = 0;
      if (before.hasVariants) {
        variants = (await tx.product.updateMany({ where: { parentId: id }, data: { isActive } }))
          .count;
      }
      await this.audit.record(
        {
          userId: user.id,
          action: isActive ? 'activate' : 'deactivate',
          entity: 'Product',
          entityId: id,
          before: { isActive: before.isActive },
          after: { isActive, variantsChanged: variants },
        },
        tx,
      );
    });
    return { id, isActive };
  }

  // ─────────────────────────────── Variants ───────────────────────────────

  /**
   * Adds option values (e.g. a new size) and creates the missing variants.
   * Existing variants are never removed — deactivate them instead.
   */
  async generateVariants(id: string, dto: GenerateVariantsDto, user: RequestUser) {
    const parent = await this.prisma.product.findUnique({
      where: { id },
      include: { variants: { select: { variantValues: true } } },
    });
    if (!parent) throw new NotFoundException('Product not found');
    if (parent.parentId) throw new BadRequestException('A variant cannot have its own variants');

    if (!parent.hasVariants) {
      const moves = await this.prisma.stockMove.count({ where: { productId: id } });
      if (moves > 0) {
        throw new BadRequestException(
          'This product already has stock movements; create a new product with variants instead',
        );
      }
    }

    const existingOptions = (parent.variantOptions ?? []) as unknown as VariantOption[];
    const options = badRequestFromRule(() =>
      normalizeVariantOptions(mergeOptions(existingOptions, dto.variantOptions)),
    );
    if (parent.variants.length > 0) {
      const oldNames = existingOptions.map((o) => o.name.toLowerCase()).sort().join('|');
      const newNames = options.map((o) => o.name.toLowerCase()).sort().join('|');
      if (oldNames !== newNames) {
        throw new BadRequestException(
          'Options cannot be added or removed once variants exist; only new values can be added',
        );
      }
    }

    const existingKeys = new Set(
      parent.variants.map((v) => variantKey((v.variantValues ?? {}) as VariantValues)),
    );
    const missing = badRequestFromRule(() => buildVariantCombinations(options)).filter(
      (c) => !existingKeys.has(variantKey(c)),
    );

    try {
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.product.update({
          where: { id },
          data: {
            hasVariants: true,
            variantOptions: options as unknown as Prisma.InputJsonValue,
          },
        });
        const createdIds = await this.createVariants(tx, updated, missing);

        // New variants start with the parent's price-list prices.
        const parentPrices = await tx.priceListItem.findMany({ where: { productId: id } });
        if (parentPrices.length && createdIds.length) {
          await tx.priceListItem.createMany({
            data: createdIds.flatMap((pid) =>
              parentPrices.map((pp) => ({
                priceListId: pp.priceListId,
                productId: pid,
                price: pp.price,
              })),
            ),
          });
        }

        await this.audit.record(
          {
            userId: user.id,
            action: 'generate-variants',
            entity: 'Product',
            entityId: id,
            before: { variantOptions: parent.variantOptions },
            after: { variantOptions: options, created: createdIds.length },
          },
          tx,
        );
        return { id, created: createdIds.length };
      });
    } catch (e) {
      rethrowPrismaError(e);
    }
  }

  private async createVariants(
    tx: Tx,
    parent: {
      id: string;
      sku: string;
      name: string;
      description: string | null;
      categoryId: string | null;
      baseUnitId: string;
      taxRateId: string | null;
      salePrice: Decimal;
      minStock: Decimal;
      isActive: boolean;
    },
    combos: VariantValues[],
  ): Promise<string[]> {
    const ids: string[] = [];
    for (const values of combos) {
      const v = await tx.product.create({
        data: {
          parentId: parent.id,
          sku: variantSku(parent.sku, values),
          name: variantName(parent.name, values),
          description: parent.description,
          categoryId: parent.categoryId,
          baseUnitId: parent.baseUnitId,
          taxRateId: parent.taxRateId,
          salePrice: parent.salePrice,
          minStock: parent.minStock,
          isActive: parent.isActive,
          variantValues: values,
        },
        select: { id: true },
      });
      ids.push(v.id);
    }
    return ids;
  }

  // ──────────────────────────────── Prices ────────────────────────────────

  async setPrices(id: string, dto: SetPricesDto, user: RequestUser) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { variants: { select: { id: true } }, prices: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    const ids = [id, ...(dto.applyToVariants ? product.variants.map((v) => v.id) : [])];
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.writePrices(tx, ids, dto.prices);
        await this.audit.record(
          {
            userId: user.id,
            action: 'set-prices',
            entity: 'Product',
            entityId: id,
            before: product.prices,
            after: { prices: dto.prices, appliedTo: ids.length },
          },
          tx,
        );
      });
    } catch (e) {
      rethrowPrismaError(e);
    }
    return { id, updated: ids.length };
  }

  private async writePrices(tx: Tx, productIds: string[], prices: PriceInputDto[]) {
    for (const { priceListId, price } of prices) {
      if (price === null) {
        await tx.priceListItem.deleteMany({
          where: { priceListId, productId: { in: productIds } },
        });
        continue;
      }
      for (const productId of productIds) {
        await tx.priceListItem.upsert({
          where: { priceListId_productId: { priceListId, productId } },
          update: { price: new D(price) },
          create: { priceListId, productId, price: new D(price) },
        });
      }
    }
  }

  // ───────────────────────────────── KPIs ─────────────────────────────────

  async stats(id: string, days: number, user: RequestUser) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { variants: { select: { id: true } } },
    });
    if (!product) throw new NotFoundException('Product not found');

    const ids = product.hasVariants ? product.variants.map((v) => v.id) : [id];
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (days - 1));

    const [costs, onHandById, lines] = await Promise.all([
      this.prisma.product.findMany({
        where: { id: { in: ids } },
        select: { id: true, averageCost: true },
      }),
      this.onHandByProduct(ids),
      this.prisma.salesOrderLine.findMany({
        where: {
          productId: { in: ids },
          salesOrder: { status: { in: SOLD_STATUSES }, orderDate: { gte: since } },
        },
        select: {
          productId: true,
          quantity: true,
          unitFactor: true,
          lineTotal: true,
          salesOrderId: true,
          salesOrder: { select: { orderDate: true } },
        },
      }),
    ]);
    const costById = new Map(costs.map((c) => [c.id, c.averageCost]));

    let onHand = new D(0);
    let stockValue = new D(0);
    for (const pid of ids) {
      const qty = onHandById.get(pid) ?? new D(0);
      onHand = onHand.plus(qty);
      stockValue = stockValue.plus(qty.mul(costById.get(pid) ?? 0));
    }

    let soldQty = new D(0);
    let revenue = new D(0);
    let cost = new D(0);
    const orders = new Set<string>();
    const byDay = new Map<string, Decimal>();
    for (const l of lines) {
      const baseQty = l.quantity.mul(l.unitFactor);
      soldQty = soldQty.plus(baseQty);
      revenue = revenue.plus(l.lineTotal);
      cost = cost.plus(baseQty.mul(costById.get(l.productId) ?? 0));
      orders.add(l.salesOrderId);
      const day = l.salesOrder.orderDate.toISOString().slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? new D(0)).plus(l.lineTotal));
    }

    const series: { date: string; revenue: Decimal }[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      series.push({ date: key, revenue: byDay.get(key) ?? new D(0) });
    }

    const showCost = canSeeCost(user);
    return {
      days,
      since: since.toISOString().slice(0, 10),
      onHand,
      soldQty,
      revenue,
      orderCount: orders.size,
      coverageDays: stockCoverageDays(onHand.toNumber(), soldQty.toNumber(), days),
      ...(showCost
        ? {
            stockValue,
            cost,
            grossMargin: revenue.minus(cost),
            marginPct: marginPct(revenue.toNumber(), cost.toNumber()),
          }
        : {}),
      series,
    };
  }

  // ─────────────────────────────── Helpers ────────────────────────────────

  /** Total on-hand per product over all warehouses. */
  async onHandByProduct(productIds: string[]): Promise<Map<string, Decimal>> {
    if (productIds.length === 0) return new Map();
    const sums = await this.prisma.stockBalance.groupBy({
      by: ['productId'],
      where: { productId: { in: productIds } },
      _sum: { quantity: true },
    });
    return new Map(sums.map((s) => [s.productId, s._sum.quantity ?? new D(0)]));
  }

  /** Ids of active stock-holding products whose total stock is under their minimum. */
  async lowStockIds(): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT p.id
      FROM products p
      LEFT JOIN stock_balances b ON b.product_id = p.id
      WHERE p.is_active = true AND p.has_variants = false AND p.min_stock > 0
      GROUP BY p.id
      HAVING COALESCE(SUM(b.quantity), 0) < p.min_stock`;
    return rows.map((r) => r.id);
  }

  async lowStock(limit: number) {
    const ids = await this.lowStockIds();
    const products = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        sku: true,
        name: true,
        minStock: true,
        parentId: true,
        baseUnit: { select: { code: true } },
      },
    });
    const onHand = await this.onHandByProduct(ids);
    const items = products
      .map((p) => {
        const qty = onHand.get(p.id) ?? new D(0);
        return { ...p, onHand: qty, shortage: p.minStock.minus(qty) };
      })
      .sort((a, b) => b.shortage.comparedTo(a.shortage))
      .slice(0, limit);
    return { total: ids.length, items };
  }

  /** Everything the product form needs in one call. */
  async formOptions() {
    const [categories, units, taxRates, priceLists, warehouses] = await Promise.all([
      this.prisma.category.findMany({
        where: { isActive: true },
        select: { id: true, name: true, parentId: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.unit.findMany({ orderBy: { code: 'asc' } }),
      this.prisma.taxRate.findMany({
        where: { isActive: true },
        select: { id: true, name: true, rate: true },
        orderBy: { rate: 'asc' },
      }),
      this.prisma.priceList.findMany({
        where: { isActive: true },
        select: { id: true, code: true, name: true },
        orderBy: { code: 'desc' },
      }),
      this.prisma.warehouse.findMany({
        where: { isActive: true },
        select: { id: true, code: true, name: true },
        orderBy: { code: 'asc' },
      }),
    ]);
    return { categories, units, taxRates, priceLists, warehouses };
  }
}

/** Adds the new values to the existing options (by option name, case-insensitive). */
function mergeOptions(existing: VariantOption[], incoming: VariantOptionDto[]): VariantOption[] {
  const result = existing.map((o) => ({ name: o.name, values: [...o.values] }));
  for (const opt of incoming) {
    const found = result.find((o) => o.name.toLowerCase() === opt.name.trim().toLowerCase());
    if (found) found.values.push(...opt.values);
    else result.push({ name: opt.name, values: [...opt.values] });
  }
  return result;
}
