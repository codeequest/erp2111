import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  COUNT_CSV_COLUMNS,
  MAX_COUNT_LINES,
  MAX_COUNT_LINES_PER_SAVE,
  type Paginated,
  type StockCountDetail,
  type StockCountImportReport,
  type StockCountLine,
  type StockCountListItem,
} from '@erp/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { RequestUser } from '../../../common/types/request-user';
import { audit } from '../../../common/audit';
import { SheetColumn } from '../../../common/spreadsheet';
import { nextDocumentNumber } from '../../../common/numbering';
import { CatalogService } from '../catalog.service';
import {
  CreateStockCountDto,
  ListStockDocumentsQueryDto,
  SaveCountLinesDto,
} from '../dto/stock-document.dto';
import { StockEngine } from './stock-engine.service';
import { D } from './stock-rules';
import {
  activeWarehouse,
  assertDraft,
  checkProducts,
  lockDocument,
  onHandIn,
  pageOf,
  toWarehouse,
} from './stock-documents.common';

const DECIMAL = /^\d{1,14}(\.\d{1,4})?$/;

const listInclude = {
  warehouse: { select: { id: true, code: true, name: true } },
  category: { select: { id: true, name: true } },
  createdBy: { select: { fullName: true } },
  _count: { select: { lines: true } },
} satisfies Prisma.StockCountInclude;

type ListRow = Prisma.StockCountGetPayload<{ include: typeof listInclude }>;

/**
 * Physical stock counts.
 *
 *  1. Start a count: the products of a warehouse (or one category) are listed
 *     with the quantity the system expects.
 *  2. Staff enter what they count, in several sessions if needed (or import a CSV).
 *  3. Validate: for every counted line, stock is adjusted to the counted quantity.
 *
 * The difference is computed against the stock AT VALIDATION, so sales made
 * during the count are not lost. Lines whose stock moved since the start are
 * flagged on screen so staff can recount them.
 */
@Injectable()
export class StockCountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: StockEngine,
    private readonly catalog: CatalogService,
  ) {}

  async list(q: ListStockDocumentsQueryDto): Promise<Paginated<StockCountListItem>> {
    const where: Prisma.StockCountWhereInput = {
      ...(q.status && { status: q.status }),
      ...(q.warehouseId && { warehouseId: q.warehouseId }),
      ...(q.search && { number: { contains: q.search, mode: 'insensitive' } }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.stockCount.findMany({
        where,
        include: listInclude,
        orderBy: { createdAt: 'desc' },
        ...pageOf(q.page, q.pageSize),
      }),
      this.prisma.stockCount.count({ where }),
    ]);
    const counted = await this.prisma.stockCountLine.groupBy({
      by: ['countId'],
      where: { countId: { in: rows.map((r) => r.id) }, countedQty: { not: null } },
      _count: { _all: true },
    });
    const countedBy = new Map(counted.map((c) => [c.countId, c._count._all]));
    return {
      items: rows.map((r) => toListItem(r, countedBy.get(r.id) ?? 0)),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  async get(id: string, user: RequestUser): Promise<StockCountDetail> {
    const doc = await this.prisma.stockCount.findUnique({
      where: { id },
      include: {
        ...listInclude,
        lines: {
          include: {
            product: { select: { id: true, sku: true, name: true, barcode: true, baseUnit: { select: { code: true } } } },
          },
          orderBy: { product: { name: 'asc' } },
        },
      },
    });
    if (!doc) throw new NotFoundException('Stock count not found');

    const canSeeCost = user.permissions.has('inventory.cost.view');
    const draft = doc.status === 'DRAFT';
    const current = draft ? await onHandIn(this.prisma, doc.warehouseId, doc.lines.map((l) => l.productId)) : null;

    let counted = 0;
    let withDifference = 0;
    let moved = 0;
    let totalValue = D(0);
    const lines: StockCountLine[] = doc.lines.map((l) => {
      const line: StockCountLine = {
        id: l.id,
        product: { id: l.product.id, sku: l.product.sku, name: l.product.name, unit: l.product.baseUnit.code },
        barcode: l.product.barcode,
        expectedQty: l.expectedQty.toString(),
        countedQty: l.countedQty?.toString() ?? null,
        difference: null,
      };
      if (l.countedQty !== null) counted++;
      if (current) {
        const now = D(current.get(l.productId) ?? 0);
        line.currentQty = now.toString();
        if (!now.equals(l.expectedQty)) moved++;
        if (l.countedQty !== null) line.difference = l.countedQty.sub(now).toString();
      } else if (l.difference !== null) {
        line.difference = l.difference.toString();
        if (canSeeCost && l.unitCost !== null) {
          const value = l.difference.mul(l.unitCost);
          totalValue = totalValue.add(value);
          line.differenceValue = money(value);
        }
      }
      if (line.difference !== null && !D(line.difference).isZero()) withDifference++;
      return line;
    });

    const countedCount = counted;
    return {
      ...toListItem(doc, countedCount),
      lines,
      summary: {
        lines: lines.length,
        counted: countedCount,
        withDifference,
        movedSinceStart: moved,
        ...(canSeeCost && !draft && { differenceValue: money(totalValue) }),
      },
    };
  }

  /** Starts a count with the products of a warehouse (optionally one category). */
  async create(dto: CreateStockCountDto, user: RequestUser): Promise<StockCountDetail> {
    await activeWarehouse(this.prisma, dto.warehouseId);
    let categoryIds: string[] | null = null;
    if (dto.categoryId) {
      const category = await this.prisma.category.findUnique({ where: { id: dto.categoryId } });
      if (!category) throw new NotFoundException('Category not found');
      categoryIds = await this.catalog.categoryAndDescendantIds(dto.categoryId);
    }
    const inCategory: Prisma.ProductWhereInput = categoryIds ? { categoryId: { in: categoryIds } } : {};

    // Everything that holds stock here (even inactive products), plus, if asked,
    // active products with no stock so that found goods can be counted.
    const [balances, zeroProducts] = await Promise.all([
      this.prisma.stockBalance.findMany({
        where: { warehouseId: dto.warehouseId, quantity: { not: 0 }, product: inCategory },
        select: { productId: true, quantity: true },
      }),
      dto.includeZero
        ? this.prisma.product.findMany({ where: { isActive: true, ...inCategory }, select: { id: true } })
        : Promise.resolve([]),
    ]);
    const expected = new Map(balances.map((b) => [b.productId, b.quantity]));
    for (const p of zeroProducts) if (!expected.has(p.id)) expected.set(p.id, D(0));

    if (!expected.size) {
      throw new BadRequestException(
        'No product to count: this warehouse has no stock here. Tick "include products with no stock" to count anyway.',
      );
    }
    if (expected.size > MAX_COUNT_LINES) {
      throw new BadRequestException(
        `This count would have ${expected.size} products (max ${MAX_COUNT_LINES}): count one category at a time`,
      );
    }

    const id = await this.prisma.$transaction(
      async (tx) => {
        const number = await nextDocumentNumber(tx, 'STOCK_COUNT');
        const doc = await tx.stockCount.create({
          data: {
            number,
            warehouseId: dto.warehouseId,
            categoryId: dto.categoryId ?? null,
            notes: dto.notes ?? null,
            createdById: user.id,
          },
        });
        await tx.stockCountLine.createMany({
          data: [...expected].map(([productId, qty]) => ({ countId: doc.id, productId, expectedQty: qty })),
        });
        await audit(tx, user, 'create', 'StockCount', doc.id, null, {
          number,
          warehouseId: dto.warehouseId,
          categoryId: dto.categoryId ?? null,
          lines: expected.size,
        });
        return doc.id;
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
    return this.get(id, user);
  }

  /** Saves counted quantities. A product that is not on the count yet is added. */
  async saveLines(id: string, dto: SaveCountLinesDto, user: RequestUser): Promise<StockCountDetail> {
    await this.applyLines(id, dto.lines, user);
    return this.get(id, user);
  }

  /** Imports counted quantities from a sheet (columns sku, counted_qty; others are ignored). */
  async importTable(id: string, rows: string[][], user: RequestUser): Promise<StockCountImportReport> {
    const table = rows.filter((r) => r.some((c) => c.trim() !== ''));
    if (table.length < 2) throw new BadRequestException('The file has no rows');
    const header = table[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
    const skuAt = header.indexOf('sku');
    const qtyAt = header.indexOf('counted_qty');
    if (skuAt < 0 || qtyAt < 0) {
      throw new BadRequestException(`The first line must contain the columns: ${COUNT_CSV_COLUMNS.join(', ')}`);
    }

    const skus = [...new Set(table.slice(1).map((r) => (r[skuAt] ?? '').trim()).filter(Boolean))];
    const products = await this.prisma.product.findMany({
      where: { sku: { in: skus, mode: 'insensitive' } },
      select: { id: true, sku: true },
    });
    const bySku = new Map(products.map((p) => [p.sku.toLowerCase(), p.id]));
    const onCount = new Set(
      (await this.prisma.stockCountLine.findMany({ where: { countId: id }, select: { productId: true } })).map((l) => l.productId),
    );

    const errors: StockCountImportReport['errors'] = [];
    let skipped = 0;
    const lines = new Map<string, string>();
    const lineOf = new Map<string, number>();
    table.slice(1).forEach((cells, i) => {
      const line = i + 2;
      const sku = (cells[skuAt] ?? '').trim();
      const qty = (cells[qtyAt] ?? '').trim().replace(/^(\d+),(\d+)$/, '$1.$2');
      const productId = bySku.get(sku.toLowerCase());
      if (!sku) return errors.push({ line, sku, error: 'sku is empty' });
      // An empty cell means "not counted in this file": it never erases a saved count.
      if (!qty) return skipped++;
      if (!productId) return errors.push({ line, sku, error: 'product does not exist' });
      if (!DECIMAL.test(qty)) return errors.push({ line, sku, error: `"${qty}" is not a valid quantity` });
      if (lineOf.has(productId)) return errors.push({ line, sku, error: `same product as line ${lineOf.get(productId)}` });
      lineOf.set(productId, line);
      lines.set(productId, qty);
    });

    const all = [...lines].map(([productId, countedQty]) => ({ productId, countedQty }));
    for (let i = 0; i < all.length; i += MAX_COUNT_LINES_PER_SAVE) {
      await this.applyLines(id, all.slice(i, i + MAX_COUNT_LINES_PER_SAVE), user);
    }
    return {
      updated: all.length,
      added: all.filter((l) => !onCount.has(l.productId)).length,
      skipped,
      errors,
    };
  }

  /** Count sheet to print or fill in Excel. `blind` leaves out the expected quantities. */
  async sheetRows(
    id: string,
    blind: boolean,
  ): Promise<{ name: string; columns: SheetColumn[]; rows: (string | null)[][] }> {
    const doc = await this.prisma.stockCount.findUnique({
      where: { id },
      include: {
        lines: {
          include: { product: { select: { sku: true, name: true, baseUnit: { select: { code: true } } } } },
          orderBy: { product: { name: 'asc' } },
        },
      },
    });
    if (!doc) throw new NotFoundException('Stock count not found');
    const header = ['sku', 'name', 'unit', ...(blind ? [] : ['expected_qty']), 'counted_qty'];
    const rows = doc.lines.map((l) => [
      l.product.sku,
      l.product.name,
      l.product.baseUnit.code,
      ...(blind ? [] : [l.expectedQty.toString()]),
      l.countedQty?.toString() ?? '',
    ]);
    return {
      name: `${doc.number}.xlsx`,
      columns: header.map((h) => ({
        header: h,
        numeric: h.endsWith('_qty'),
        width: h === 'name' ? 34 : h === 'counted_qty' ? 14 : undefined,
      })),
      rows,
    };
  }

  /** Validates the count: adjusts every counted product to the counted quantity. */
  async post(id: string, user: RequestUser): Promise<StockCountDetail> {
    await this.prisma.$transaction(
      async (tx) => {
        assertDraft('StockCount', await lockDocument(tx, 'StockCount', id), 'validated');
        const doc = await tx.stockCount.findUniqueOrThrow({ where: { id } });
        const lines = await tx.stockCountLine.findMany({ where: { countId: id, countedQty: { not: null } } });
        if (!lines.length) throw new BadRequestException('Nothing is counted yet: enter at least one quantity');

        // Lock the products (same order as the engine) BEFORE reading their stock, so
        // the difference is computed on the stock the adjustment will really change.
        const ids = [...new Set(lines.map((l) => l.productId))].sort();
        await tx.$queryRaw`SELECT id FROM products WHERE id = ANY(${ids}::uuid[]) ORDER BY id FOR UPDATE`;
        const now = await onHandIn(tx, doc.warehouseId, ids);

        const diffs = lines.map((l) => ({ line: l, diff: l.countedQty!.sub(D(now.get(l.productId) ?? 0)) }));
        const toPost = diffs.filter((d) => !d.diff.isZero());
        const moves = toPost.length
          ? await this.engine.post(
              tx,
              {
                sourceType: 'StockCount',
                sourceId: doc.id,
                reference: doc.number,
                reason: `Stock count ${doc.number}`,
                lines: toPost.map((d) => ({
                  productId: d.line.productId,
                  warehouseId: doc.warehouseId,
                  type: 'ADJUSTMENT' as const,
                  quantity: d.diff,
                  sourceLineId: d.line.id,
                })),
              },
              user,
            )
          : [];
        const costOf = new Map(moves.map((m) => [m.sourceLineId!, m.unitCost]));

        for (const d of diffs) {
          await tx.stockCountLine.update({
            where: { id: d.line.id },
            data: { difference: d.diff, unitCost: costOf.get(d.line.id) ?? null },
          });
        }
        await tx.stockCount.update({ where: { id }, data: { status: 'POSTED', postedAt: new Date() } });
        await audit(tx, user, 'post', 'StockCount', id, { status: 'DRAFT' }, {
          status: 'POSTED',
          counted: lines.length,
          adjusted: toPost.length,
        });
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
    return this.get(id, user);
  }

  async cancel(id: string, user: RequestUser): Promise<StockCountDetail> {
    await this.prisma.$transaction(async (tx) => {
      assertDraft('StockCount', await lockDocument(tx, 'StockCount', id), 'cancelled');
      await tx.stockCount.update({ where: { id }, data: { status: 'CANCELLED' } });
      await audit(tx, user, 'cancel', 'StockCount', id, { status: 'DRAFT' }, { status: 'CANCELLED' });
    });
    return this.get(id, user);
  }

  private async applyLines(
    id: string,
    lines: { productId: string; countedQty: string | null }[],
    user: RequestUser,
  ) {
    await checkProducts(this.prisma, lines.map((l) => l.productId));
    await this.prisma.$transaction(
      async (tx) => {
        assertDraft('StockCount', await lockDocument(tx, 'StockCount', id), 'changed');
        const doc = await tx.stockCount.findUniqueOrThrow({ where: { id }, select: { warehouseId: true } });
        const existing = new Map(
          (
            await tx.stockCountLine.findMany({
              where: { countId: id, productId: { in: lines.map((l) => l.productId) } },
              select: { id: true, productId: true },
            })
          ).map((l) => [l.productId, l.id]),
        );
        const added = lines.filter((l) => !existing.has(l.productId));
        if (added.length) {
          const total = await tx.stockCountLine.count({ where: { countId: id } });
          if (total + added.length > MAX_COUNT_LINES) {
            throw new BadRequestException(`A count can hold at most ${MAX_COUNT_LINES} products`);
          }
          const now = await onHandIn(tx, doc.warehouseId, added.map((l) => l.productId));
          await tx.stockCountLine.createMany({
            data: added.map((l) => ({
              countId: id,
              productId: l.productId,
              expectedQty: D(now.get(l.productId) ?? 0),
              countedQty: l.countedQty === null ? null : D(l.countedQty),
            })),
          });
        }
        for (const l of lines) {
          const lineId = existing.get(l.productId);
          if (lineId) {
            await tx.stockCountLine.update({
              where: { id: lineId },
              data: { countedQty: l.countedQty === null ? null : D(l.countedQty) },
            });
          }
        }
        await audit(tx, user, 'count', 'StockCount', id, null, { lines: lines.length, added: added.length });
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
  }
}

function money(v: Prisma.Decimal) {
  return v.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2);
}

function toListItem(d: ListRow, countedCount: number): StockCountListItem {
  return {
    id: d.id,
    number: d.number,
    status: d.status,
    date: d.date.toISOString(),
    notes: d.notes,
    createdBy: d.createdBy.fullName,
    createdAt: d.createdAt.toISOString(),
    postedAt: d.postedAt?.toISOString() ?? null,
    warehouse: toWarehouse(d.warehouse),
    category: d.category,
    lineCount: d._count.lines,
    countedCount,
  };
}
