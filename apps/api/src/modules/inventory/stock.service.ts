import { randomUUID } from 'node:crypto';
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { DocumentType, Prisma, StockMoveType } from '@prisma/client';
import type {
  Paginated,
  PermissionCode,
  StockLevelRow,
  StockLevels,
  StockMoveItem,
  StockPostingResult,
} from '@erp/shared';
import { Decimal, roundMoney, roundQty, toDecimal } from '../../common/decimal';
import { AuditService } from '../../core/audit/audit.service';
import { DocumentNumberService } from '../../core/numbering/document-number.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateAdjustmentDto,
  CreateOpeningDto,
  CreateTransferDto,
  StockLevelsQueryDto,
  StockMovesQueryDto,
} from './dto/stock.dto';
import { LedgerLine, StockLedgerService } from './stock-ledger.service';
import { countDelta } from './stock-rules';

type Tx = Prisma.TransactionClient;
type Perms = Set<PermissionCode>;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Stock levels, the stock ledger, and the documents that move stock inside Inventory. */
@Injectable()
export class StockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: StockLedgerService,
    private readonly numbering: DocumentNumberService,
    private readonly audit: AuditService,
  ) {}

  // ── Read ──────────────────────────────────────────────────────────────────

  async levels(query: StockLevelsQueryDto, perms: Perms): Promise<StockLevels> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const showCost = perms.has('inventory.cost.view');

    const productWhere: Prisma.ProductWhereInput = { isActive: true };
    if (query.productId) productWhere.id = query.productId;
    if (query.q) {
      const contains = { contains: query.q, mode: 'insensitive' as const };
      productWhere.OR = [{ sku: contains }, { name: contains }, { barcode: query.q }];
    }

    const [warehouses, products, balances] = await Promise.all([
      this.prisma.warehouse.findMany({
        where: query.warehouseId ? { id: query.warehouseId } : { isActive: true },
        select: { id: true, code: true, name: true },
        orderBy: { code: 'asc' },
      }),
      this.prisma.product.findMany({
        where: productWhere,
        select: {
          id: true,
          sku: true,
          name: true,
          minStock: true,
          averageCost: true,
          isActive: true,
          baseUnit: { select: { code: true } },
        },
        orderBy: [{ name: 'asc' }, { sku: 'asc' }],
      }),
      this.prisma.stockBalance.findMany({
        where: {
          quantity: { not: 0 },
          ...(query.warehouseId && { warehouseId: query.warehouseId }),
          ...(query.productId && { productId: query.productId }),
        },
        select: { productId: true, warehouseId: true, quantity: true },
      }),
    ]);

    const byProduct = new Map<string, { warehouseId: string; quantity: Decimal }[]>();
    for (const b of balances) {
      byProduct.set(b.productId, [
        ...(byProduct.get(b.productId) ?? []),
        { warehouseId: b.warehouseId, quantity: new Decimal(b.quantity) },
      ]);
    }

    let totalValue = new Decimal(0);
    let rows: StockLevelRow[] = products.map((p) => {
      const lines = byProduct.get(p.id) ?? [];
      const total = lines.reduce((sum, l) => sum.plus(l.quantity), new Decimal(0));
      const minStock = new Decimal(p.minStock);
      const value = total.times(p.averageCost);
      return {
        product: {
          id: p.id,
          sku: p.sku,
          name: p.name,
          baseUnitCode: p.baseUnit.code,
          minStock: minStock.toString(),
          isActive: p.isActive,
        },
        byWarehouse: Object.fromEntries(lines.map((l) => [l.warehouseId, l.quantity.toString()])),
        total: total.toString(),
        isLow: minStock.greaterThan(0) && total.lessThan(minStock),
        ...(showCost && {
          averageCost: p.averageCost.toString(),
          value: roundMoney(value).toString(),
        }),
      };
    });

    if (query.lowOnly) rows = rows.filter((r) => r.isLow);
    if (query.inStockOnly) rows = rows.filter((r) => !new Decimal(r.total).isZero());
    if (showCost) {
      for (const r of rows) totalValue = totalValue.plus(r.value ?? 0);
    }

    return {
      warehouses,
      items: rows.slice((page - 1) * pageSize, page * pageSize),
      total: rows.length,
      page,
      pageSize,
      ...(showCost && { totalValue: roundMoney(totalValue).toString() }),
    };
  }

  async moves(query: StockMovesQueryDto, perms: Perms): Promise<Paginated<StockMoveItem>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    const where: Prisma.StockMoveWhereInput = {
      productId: query.productId,
      warehouseId: query.warehouseId,
      ...(query.type?.length && { type: { in: query.type } }),
      ...(query.reference && { reference: { contains: query.reference, mode: 'insensitive' } }),
    };
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from && { gte: new Date(query.from) }),
        // "to" is inclusive: everything before the start of the next day.
        ...(query.to && { lt: new Date(new Date(query.to).getTime() + DAY_MS) }),
      };
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.stockMove.count({ where }),
      this.prisma.stockMove.findMany({
        where,
        include: {
          product: {
            select: { id: true, sku: true, name: true, baseUnit: { select: { code: true } } },
          },
          warehouse: { select: { id: true, code: true } },
          createdBy: { select: { fullName: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const showCost = perms.has('inventory.cost.view');
    return {
      items: rows.map((m) => ({
        id: m.id,
        createdAt: m.createdAt.toISOString(),
        type: m.type,
        product: {
          id: m.product.id,
          sku: m.product.sku,
          name: m.product.name,
          baseUnitCode: m.product.baseUnit.code,
        },
        warehouse: m.warehouse,
        quantity: m.quantity.toString(),
        ...(showCost && { unitCost: m.unitCost.toString() }),
        reference: m.reference,
        reason: m.reason,
        createdBy: m.createdBy.fullName,
      })),
      total,
      page,
      pageSize,
    };
  }

  // ── Write ─────────────────────────────────────────────────────────────────

  /** Stock count ("count") or manual correction ("delta"), with a mandatory reason. */
  async adjust(dto: CreateAdjustmentDto, userId: string): Promise<StockPostingResult> {
    assertUniqueProducts(dto.lines);
    if (dto.mode === 'count' && dto.lines.some((l) => toDecimal(l.quantity).isNegative())) {
      throw new BadRequestException('A counted quantity cannot be negative');
    }

    return this.prisma.$transaction(async (tx) => {
      const warehouse = await this.activeWarehouse(tx, dto.warehouseId);
      const productIds = dto.lines.map((l) => l.productId);
      await this.assertActiveProducts(tx, productIds);
      // Lock first so the counted-vs-system difference is computed on stable figures.
      await this.ledger.lockProducts(tx, productIds);

      const current = await this.balancesIn(tx, dto.warehouseId, productIds);
      const lines: LedgerLine[] = [];
      const audited: { productId: string; before: string; change: string }[] = [];
      for (const l of dto.lines) {
        const before = current.get(l.productId) ?? new Decimal(0);
        const change = dto.mode === 'count' ? countDelta(before, l.quantity) : roundQty(l.quantity);
        if (change.isZero()) continue;
        lines.push({
          productId: l.productId,
          warehouseId: dto.warehouseId,
          type: StockMoveType.ADJUSTMENT,
          quantity: change,
        });
        audited.push({
          productId: l.productId,
          before: before.toString(),
          change: change.toString(),
        });
      }
      if (!lines.length) {
        throw new BadRequestException(
          dto.mode === 'count'
            ? 'Nothing to adjust: every counted quantity matches the system'
            : 'Nothing to adjust: all quantities are zero',
        );
      }

      const reference = await this.numbering.next(tx, DocumentType.STOCK_ADJUSTMENT);
      const moves = await this.ledger.post(tx, {
        lines,
        userId,
        reference,
        reason: dto.reason,
        sourceType: 'StockAdjustment',
      });
      await this.audit.log(tx, {
        userId,
        action: 'post',
        entity: 'StockAdjustment',
        entityId: reference,
        after: { warehouse: warehouse.code, mode: dto.mode, reason: dto.reason, lines: audited },
      });
      return { reference, moves };
    });
  }

  /** Moves stock from one warehouse to another (OUT + IN rows sharing a transferId). */
  async transfer(dto: CreateTransferDto, userId: string): Promise<StockPostingResult> {
    if (dto.fromWarehouseId === dto.toWarehouseId) {
      throw new BadRequestException('Choose two different warehouses');
    }
    assertUniqueProducts(dto.lines);
    assertPositive(dto.lines);

    return this.prisma.$transaction(async (tx) => {
      const from = await this.activeWarehouse(tx, dto.fromWarehouseId);
      const to = await this.activeWarehouse(tx, dto.toWarehouseId);
      await this.assertActiveProducts(
        tx,
        dto.lines.map((l) => l.productId),
      );

      const reference = await this.numbering.next(tx, DocumentType.STOCK_TRANSFER);
      const transferId = randomUUID();
      const lines = dto.lines.flatMap((l): LedgerLine[] => {
        const qty = roundQty(l.quantity);
        return [
          {
            productId: l.productId,
            warehouseId: from.id,
            type: StockMoveType.TRANSFER_OUT,
            quantity: qty.negated(),
          },
          {
            productId: l.productId,
            warehouseId: to.id,
            type: StockMoveType.TRANSFER_IN,
            quantity: qty,
          },
        ];
      });
      const moves = await this.ledger.post(tx, {
        lines,
        userId,
        reference,
        reason: dto.note,
        sourceType: 'StockTransfer',
        sourceId: transferId,
        transferId,
      });
      await this.audit.log(tx, {
        userId,
        action: 'post',
        entity: 'StockTransfer',
        entityId: reference,
        after: { from: from.code, to: to.code, note: dto.note ?? null, lines: dto.lines },
      });
      return { reference, moves };
    });
  }

  /**
   * Go-live stock and cost per warehouse. Must be the FIRST movement of each
   * product in that warehouse, so nothing is counted twice. Sets the average
   * cost, hence also requires inventory.cost.view.
   */
  async opening(dto: CreateOpeningDto, userId: string, perms: Perms): Promise<StockPostingResult> {
    if (!perms.has('inventory.cost.view')) {
      throw new ForbiddenException(
        'Opening balances set product costs: inventory.cost.view is also required',
      );
    }
    assertUniqueProducts(dto.lines);
    assertPositive(dto.lines);

    return this.prisma.$transaction(async (tx) => {
      const warehouse = await this.activeWarehouse(tx, dto.warehouseId);
      const productIds = dto.lines.map((l) => l.productId);
      await this.assertActiveProducts(tx, productIds);
      await this.ledger.lockProducts(tx, productIds);

      const already = await tx.stockMove.findMany({
        where: { warehouseId: warehouse.id, productId: { in: productIds } },
        distinct: ['productId'],
        select: { product: { select: { sku: true } } },
      });
      if (already.length) {
        const skus = already.map((m) => m.product.sku).join(', ');
        throw new BadRequestException(
          `Stock has already moved in ${warehouse.code} for: ${skus}. Use an adjustment instead.`,
        );
      }

      const reference = `OPENING-${warehouse.code}`;
      const moves = await this.ledger.post(tx, {
        lines: dto.lines.map((l) => ({
          productId: l.productId,
          warehouseId: warehouse.id,
          type: StockMoveType.OPENING,
          quantity: roundQty(l.quantity),
          unitCost: roundQty(l.unitCost),
        })),
        userId,
        reference,
        reason: 'Opening balance',
        sourceType: 'OpeningBalance',
      });
      await this.audit.log(tx, {
        userId,
        action: 'post',
        entity: 'OpeningBalance',
        entityId: reference,
        after: { warehouse: warehouse.code, lines: dto.lines },
      });
      return { reference, moves };
    });
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private async activeWarehouse(tx: Tx, id: string) {
    const w = await tx.warehouse.findUnique({ where: { id } });
    if (!w) throw new BadRequestException('Warehouse not found');
    if (!w.isActive) throw new BadRequestException(`Warehouse ${w.code} is inactive`);
    return w;
  }

  private async assertActiveProducts(tx: Tx, ids: string[]) {
    const products = await tx.product.findMany({
      where: { id: { in: ids } },
      select: { id: true, sku: true, isActive: true },
    });
    if (products.length !== new Set(ids).size)
      throw new BadRequestException('Unknown product in the lines');
    const inactive = products.filter((p) => !p.isActive).map((p) => p.sku);
    if (inactive.length)
      throw new BadRequestException(`Inactive product(s): ${inactive.join(', ')}`);
  }

  private async balancesIn(tx: Tx, warehouseId: string, productIds: string[]) {
    const rows = await tx.stockBalance.findMany({
      where: { warehouseId, productId: { in: productIds } },
    });
    return new Map(rows.map((r) => [r.productId, new Decimal(r.quantity)]));
  }
}

function assertUniqueProducts(lines: { productId: string }[]) {
  if (new Set(lines.map((l) => l.productId)).size !== lines.length) {
    throw new BadRequestException('Each product can only appear once per document');
  }
}

function assertPositive(lines: { quantity: string }[]) {
  if (lines.some((l) => !toDecimal(l.quantity).greaterThan(0))) {
    throw new BadRequestException('Quantities must be greater than 0');
  }
}
