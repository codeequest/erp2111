import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StockMoveType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestUser } from '../../common/types/request-user';
import { ListMovesQueryDto, OpeningBalancesDto, ProductImageDto } from './dto/stock.dto';
import { CsvRowError } from './product-csv';
import { mapOpeningCsv, weightedAverageCost } from './opening-csv';
import { daysUntil } from './price-utils';

interface ResolvedLine {
  line: number;
  productId: string;
  sku: string;
  name: string;
  warehouseId: string;
  warehouseCode: string;
  quantity: Prisma.Decimal;
  unitCost: Prisma.Decimal;
  trackLots: boolean;
  lotNumber: string | null;
  /** YYYY-MM-DD */
  expiryDate: string | null;
}

const MAX_IMAGE_BYTES = 1_500_000;

/**
 * Stock (opening balances), warehouses and product photos.
 * Stock only changes through StockMove rows; StockBalance and the product's
 * average cost are updated in the same transaction.
 */
@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService) {}

  listWarehouses() {
    return this.prisma.warehouse.findMany({ orderBy: [{ isActive: 'desc' }, { code: 'asc' }] });
  }

  /**
   * Go-live: sets the starting quantity and cost of products.
   * A product can get an opening balance in a warehouse only once, and only if it has
   * never had a stock move there. All-or-nothing: any error and nothing is saved.
   */
  async openingBalances(dto: OpeningBalancesDto, user: RequestUser) {
    if (!dto.csv === !dto.lines) throw new BadRequestException('Send either csv or lines');

    const errors: CsvRowError[] = [];
    const resolved: ResolvedLine[] = [];
    const warehouses = await this.prisma.warehouse.findMany();

    if (dto.csv) {
      const parsed = mapOpeningCsv(dto.csv);
      errors.push(...parsed.errors);
      const products = await this.prisma.product.findMany({
        where: { sku: { in: parsed.rows.map((r) => r.sku), mode: 'insensitive' } },
        select: { id: true, sku: true, name: true, isActive: true, trackLots: true },
      });
      const bySku = new Map(products.map((p) => [p.sku.toUpperCase(), p]));
      const byCode = new Map(warehouses.map((w) => [w.code.toUpperCase(), w]));
      const fallback = byCode.get('MAIN') ?? warehouses.find((w) => w.isActive);

      for (const r of parsed.rows) {
        const product = bySku.get(r.sku.toUpperCase());
        const warehouse = r.warehouse ? byCode.get(r.warehouse) : fallback;
        if (r.sku && !product)
          errors.push({ line: r.line, message: `product ${r.sku} does not exist` });
        else if (product && !product.isActive)
          errors.push({ line: r.line, message: `product ${r.sku} is inactive` });
        if (!warehouse)
          errors.push({
            line: r.line,
            message: `warehouse ${r.warehouse ?? '(default)'} does not exist`,
          });
        else if (!warehouse.isActive)
          errors.push({ line: r.line, message: `warehouse ${warehouse.code} is inactive` });
        if (product && warehouse && !Number.isNaN(r.quantity) && !Number.isNaN(r.unitCost)) {
          resolved.push({
            line: r.line,
            productId: product.id,
            sku: product.sku,
            name: product.name,
            warehouseId: warehouse.id,
            warehouseCode: warehouse.code,
            quantity: new Prisma.Decimal(r.quantity),
            unitCost: new Prisma.Decimal(r.unitCost),
            trackLots: product.trackLots,
            lotNumber: r.lotNumber,
            expiryDate: r.expiryDate,
          });
        }
      }
    } else {
      const lines = dto.lines!;
      const products = await this.prisma.product.findMany({
        where: { id: { in: lines.map((l) => l.productId) } },
        select: { id: true, sku: true, name: true, isActive: true, trackLots: true },
      });
      const byId = new Map(products.map((p) => [p.id, p]));
      const whById = new Map(warehouses.map((w) => [w.id, w]));
      lines.forEach((l, i) => {
        const product = byId.get(l.productId);
        const warehouse = whById.get(l.warehouseId);
        if (!product) errors.push({ line: i + 1, message: 'product not found' });
        else if (!product.isActive)
          errors.push({ line: i + 1, message: `product ${product.sku} is inactive` });
        if (!warehouse) errors.push({ line: i + 1, message: 'warehouse not found' });
        else if (!warehouse.isActive)
          errors.push({ line: i + 1, message: `warehouse ${warehouse.code} is inactive` });
        if (product && warehouse) {
          resolved.push({
            line: i + 1,
            productId: product.id,
            sku: product.sku,
            name: product.name,
            warehouseId: warehouse.id,
            warehouseCode: warehouse.code,
            quantity: new Prisma.Decimal(l.quantity),
            unitCost: new Prisma.Decimal(l.unitCost),
            trackLots: product.trackLots,
            lotNumber: l.lotNumber?.trim() || null,
            expiryDate: l.expiryDate ? l.expiryDate.slice(0, 10) : null,
          });
        }
      });
    }

    // Lot-tracked products need a lot number; other products must not have one.
    for (const r of resolved) {
      if (r.trackLots && !r.lotNumber) {
        errors.push({ line: r.line, message: `${r.sku} is lot-tracked: lot_number is required` });
      }
      if (!r.trackLots && (r.lotNumber || r.expiryDate)) {
        errors.push({
          line: r.line,
          message: `${r.sku} is not lot-tracked: leave lot_number and expiry_date empty (or enable lot tracking on the product)`,
        });
      }
    }
    // An existing lot keeps its expiry date; the same lot in the file must have one date.
    const lotKeys = resolved.filter((r) => r.lotNumber);
    if (lotKeys.length > 0) {
      const existingLots = await this.prisma.lot.findMany({
        where: { OR: lotKeys.map((r) => ({ productId: r.productId, lotNumber: r.lotNumber! })) },
      });
      const byKey = new Map(existingLots.map((l) => [`${l.productId}:${l.lotNumber}`, l]));
      const fileExpiry = new Map<string, string | null>();
      for (const r of lotKeys) {
        const key = `${r.productId}:${r.lotNumber}`;
        const lot = byKey.get(key);
        const lotExpiry = lot?.expiryDate ? lot.expiryDate.toISOString().slice(0, 10) : null;
        if (lot && r.expiryDate && lotExpiry !== r.expiryDate) {
          errors.push({
            line: r.line,
            message: `lot ${r.lotNumber} of ${r.sku} already exists with expiry ${lotExpiry ?? 'none'}`,
          });
        }
        if (fileExpiry.has(key) && fileExpiry.get(key) !== r.expiryDate) {
          errors.push({
            line: r.line,
            message: `lot ${r.lotNumber} of ${r.sku} has two different expiry dates in the file`,
          });
        } else fileExpiry.set(key, r.expiryDate);
      }
    }

    // Once per product (and lot) and warehouse: not twice in the input, and not if stock already moved there.
    const seen = new Map<string, number>();
    for (const r of resolved) {
      const key = `${r.productId}:${r.warehouseId}:${r.lotNumber ?? ''}`;
      const first = seen.get(key);
      if (first) {
        errors.push({
          line: r.line,
          message: `${r.sku}${r.lotNumber ? ` lot ${r.lotNumber}` : ''} in ${r.warehouseCode} already appears on line ${first}`,
        });
      } else seen.set(key, r.line);
    }
    if (resolved.length > 0) {
      const existing = await this.prisma.stockMove.groupBy({
        by: ['productId', 'warehouseId'],
        where: {
          OR: resolved.map((r) => ({ productId: r.productId, warehouseId: r.warehouseId })),
        },
      });
      const moved = new Set(existing.map((e) => `${e.productId}:${e.warehouseId}`));
      for (const r of resolved) {
        if (moved.has(`${r.productId}:${r.warehouseId}`)) {
          errors.push({
            line: r.line,
            message: `${r.sku} already has stock movements in ${r.warehouseCode}: use an adjustment instead`,
          });
        }
      }
    }

    errors.sort((a, b) => a.line - b.line);
    const report = {
      dryRun: dto.dryRun ?? false,
      totalRows: resolved.length,
      totalQuantity: resolved.reduce((s, r) => s.plus(r.quantity), new Prisma.Decimal(0)),
      totalValue: resolved
        .reduce((s, r) => s.plus(r.quantity.times(r.unitCost)), new Prisma.Decimal(0))
        .toDecimalPlaces(2),
      errors,
      saved: false,
    };
    if (errors.length > 0 || report.dryRun) return report;

    await this.prisma.$transaction(
      async (tx) => {
        for (const r of resolved) {
          const product = await tx.product.findUniqueOrThrow({
            where: { id: r.productId },
            include: { stockBalances: { select: { quantity: true } } },
          });
          const onHand = product.stockBalances.reduce(
            (s, b) => s.plus(b.quantity),
            new Prisma.Decimal(0),
          );

          let lotId: string | null = null;
          if (r.lotNumber) {
            const lot = await tx.lot.upsert({
              where: { productId_lotNumber: { productId: r.productId, lotNumber: r.lotNumber } },
              create: {
                productId: r.productId,
                lotNumber: r.lotNumber,
                expiryDate: r.expiryDate ? new Date(r.expiryDate) : null,
              },
              update: {},
            });
            lotId = lot.id;
            await tx.lotBalance.upsert({
              where: { lotId_warehouseId: { lotId, warehouseId: r.warehouseId } },
              create: { lotId, warehouseId: r.warehouseId, quantity: r.quantity },
              update: { quantity: { increment: r.quantity } },
            });
          }

          await tx.stockMove.create({
            data: {
              productId: r.productId,
              warehouseId: r.warehouseId,
              lotId,
              type: StockMoveType.OPENING,
              quantity: r.quantity,
              unitCost: r.unitCost,
              reference: 'OPENING',
              reason: 'Opening balance',
              createdById: user.id,
            },
          });
          await tx.stockBalance.upsert({
            where: {
              productId_warehouseId: { productId: r.productId, warehouseId: r.warehouseId },
            },
            create: { productId: r.productId, warehouseId: r.warehouseId, quantity: r.quantity },
            update: { quantity: { increment: r.quantity } },
          });
          const averageCost = weightedAverageCost(
            onHand,
            product.averageCost,
            r.quantity,
            r.unitCost,
          );
          await tx.product.update({ where: { id: r.productId }, data: { averageCost } });

          await tx.auditLog.create({
            data: {
              userId: user.id,
              action: 'opening-balance',
              entity: 'Product',
              entityId: r.productId,
              before: { onHand: onHand.toString(), averageCost: product.averageCost.toString() },
              after: {
                warehouse: r.warehouseCode,
                lot: r.lotNumber,
                expiryDate: r.expiryDate,
                quantity: r.quantity.toString(),
                unitCost: r.unitCost.toString(),
                averageCost: averageCost.toString(),
              },
            },
          });
        }
      },
      { timeout: 120_000 },
    );
    return { ...report, saved: true };
  }

  // ─────────────────────────── Stock ledger ───────────────────────────

  /**
   * Stock movements, newest first. With a productId, each row also gets the running
   * balance after the move (for that product, in the filtered warehouse or overall).
   * Costs are hidden without inventory.cost.view.
   */
  async listMoves(query: ListMovesQueryDto, user: RequestUser) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const scope: Prisma.StockMoveWhereInput = {
      productId: query.productId,
      warehouseId: query.warehouseId,
    };
    const createdAt: Prisma.DateTimeFilter = {};
    if (query.from) createdAt.gte = new Date(`${query.from.slice(0, 10)}T00:00:00`);
    if (query.to) createdAt.lte = new Date(`${query.to.slice(0, 10)}T23:59:59.999`);
    const where: Prisma.StockMoveWhereInput = {
      ...scope,
      type: query.type,
      createdAt: query.from || query.to ? createdAt : undefined,
    };

    const [total, moves] = await this.prisma.$transaction([
      this.prisma.stockMove.count({ where }),
      this.prisma.stockMove.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          product: {
            select: { id: true, sku: true, name: true, baseUnit: { select: { code: true } } },
          },
          warehouse: { select: { id: true, code: true, name: true } },
          lot: { select: { id: true, lotNumber: true, expiryDate: true } },
          createdBy: { select: { id: true, fullName: true } },
        },
      }),
    ]);

    // Running balance after each move, over ALL moves of the product (in the warehouse
    // filter, if any) — rows hidden by the type / date filters still count.
    let balanceById: Map<string, Prisma.Decimal> | null = null;
    if (query.productId && moves.length > 0) {
      const ids = moves.map((m) => m.id);
      const warehouseFilter = query.warehouseId
        ? Prisma.sql`AND warehouse_id = ${query.warehouseId}::uuid`
        : Prisma.empty;
      const rows = await this.prisma.$queryRaw<{ id: string; balance: Prisma.Decimal }[]>`
        SELECT id, balance FROM (
          SELECT id, SUM(quantity) OVER (ORDER BY created_at, id) AS balance
          FROM stock_moves
          WHERE product_id = ${query.productId}::uuid ${warehouseFilter}
        ) t
        WHERE id = ANY(${ids}::uuid[])`;
      balanceById = new Map(rows.map((r) => [r.id, r.balance]));
    }

    const canCost = user.permissions.has('inventory.cost.view');
    return {
      total,
      page,
      pageSize,
      items: moves.map((m) => ({
        id: m.id,
        createdAt: m.createdAt,
        type: m.type,
        quantity: m.quantity,
        unitCost: canCost ? m.unitCost : undefined,
        reference: m.reference,
        reason: m.reason,
        product: m.product,
        warehouse: m.warehouse,
        lot: m.lot,
        createdBy: m.createdBy,
        balanceAfter: balanceById?.get(m.id),
      })),
    };
  }

  /** Lots with stock that expire within `days` days (or have expired), soonest first. */
  async expiringLots(days: number, limit = 50) {
    const until = new Date(Date.now() + days * 86_400_000);
    const lots = await this.prisma.lot.findMany({
      where: {
        expiryDate: { lte: until },
        product: { isActive: true },
        balances: { some: { quantity: { gt: 0 } } },
      },
      orderBy: { expiryDate: 'asc' },
      take: limit,
      include: {
        product: {
          select: { id: true, sku: true, name: true, baseUnit: { select: { code: true } } },
        },
        balances: { where: { quantity: { gt: 0 } }, select: { quantity: true } },
      },
    });
    return lots.map((l) => ({
      id: l.id,
      lotNumber: l.lotNumber,
      expiryDate: l.expiryDate,
      daysLeft: daysUntil(l.expiryDate!),
      quantity: l.balances.reduce((s, b) => s.plus(b.quantity), new Prisma.Decimal(0)),
      product: l.product,
    }));
  }

  // ─────────────────────────── Product photos ──────────────────────────

  async setImage(productId: string, dto: ProductImageDto, user: RequestUser) {
    const [, mimeType, base64] = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dto.dataUrl)!;
    const data = Buffer.from(base64, 'base64');
    if (data.length > MAX_IMAGE_BYTES) {
      throw new BadRequestException('The image is larger than 1.5 MB');
    }
    if (!looksLikeImage(data, mimeType)) {
      throw new BadRequestException('The file content is not a valid image');
    }

    return this.prisma.$transaction(async (tx) => {
      if (!(await tx.product.findUnique({ where: { id: productId }, select: { id: true } }))) {
        throw new NotFoundException('Product not found');
      }
      await tx.productImage.upsert({
        where: { productId },
        create: { productId, mimeType, data },
        update: { mimeType, data },
      });
      const product = await tx.product.update({
        where: { id: productId },
        data: { imageUpdatedAt: new Date() },
        select: { id: true, imageUpdatedAt: true },
      });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'update-image',
          entity: 'Product',
          entityId: productId,
          after: { mimeType, bytes: data.length },
        },
      });
      return product;
    });
  }

  async removeImage(productId: string, user: RequestUser) {
    return this.prisma.$transaction(async (tx) => {
      if (!(await tx.product.findUnique({ where: { id: productId }, select: { id: true } }))) {
        throw new NotFoundException('Product not found');
      }
      await tx.productImage.deleteMany({ where: { productId } });
      await tx.auditLog.create({
        data: { userId: user.id, action: 'remove-image', entity: 'Product', entityId: productId },
      });
      return tx.product.update({
        where: { id: productId },
        data: { imageUpdatedAt: null },
        select: { id: true, imageUpdatedAt: true },
      });
    });
  }

  async getImage(productId: string) {
    const image = await this.prisma.productImage.findUnique({ where: { productId } });
    if (!image) throw new NotFoundException('This product has no photo');
    return image;
  }
}

/** Checks the magic bytes so a renamed non-image file is rejected. */
export function looksLikeImage(data: Buffer, mimeType: string): boolean {
  if (mimeType === 'image/jpeg') return data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  if (mimeType === 'image/png')
    return data
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === 'image/webp')
    return (
      data.subarray(0, 4).toString('ascii') === 'RIFF' &&
      data.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  return false;
}
