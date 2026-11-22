import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Paginated, StockAdjustmentListItem, StockAdjustmentResult } from '@erp/shared';
import { nextDocumentNumber } from '../../common/document-number';
import { RequestUser } from '../../common/types/request-user';
import { PrismaService } from '../../prisma/prisma.service';
import { AdjustmentsQueryDto, CreateAdjustmentDto } from './dto/stock.dto';
import { canSeeCost } from './products.service';
import { toAuditJson } from './prisma-errors';
import { lockBalance, postMove } from './stock-ledger';

@Injectable()
export class AdjustmentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Posts a stock adjustment: one ADJUSTMENT move per changed product, all with the
   * same reference (ADJ-YYYY-NNNNN), in a single transaction.
   *
   * - count mode: the line quantity is what was counted; the posted change is
   *   counted - on hand, computed on the locked balance (so it is exact even if
   *   stock moved since the user opened the form).
   * - delta mode: the line quantity is the change itself.
   * Stock can never go below zero. Average cost is not changed: moves are valued
   * at the product's current average cost.
   */
  async create(dto: CreateAdjustmentDto, user: RequestUser): Promise<StockAdjustmentResult> {
    validateLines(dto);

    return this.prisma.$transaction(async (tx) => {
      const warehouse = await tx.warehouse.findUnique({
        where: { id: dto.warehouseId },
        select: { id: true, code: true, name: true, isActive: true },
      });
      if (!warehouse) throw new BadRequestException('Unknown warehouse');
      if (!warehouse.isActive) {
        throw new BadRequestException(`Warehouse ${warehouse.code} is inactive`);
      }

      const productIds = dto.lines.map((l) => l.productId);
      const products = await tx.product.findMany({
        where: { id: { in: productIds } },
        select: {
          id: true,
          sku: true,
          name: true,
          averageCost: true,
          baseUnit: { select: { code: true } },
        },
      });
      const byId = new Map(products.map((p) => [p.id, p]));
      const missing = productIds.filter((id) => !byId.has(id));
      if (missing.length)
        throw new BadRequestException(`Unknown product(s): ${missing.join(', ')}`);

      const id = randomUUID();
      const reference = await nextDocumentNumber(tx, 'STOCK_ADJUSTMENT');
      const createdAt = new Date();
      const lines: StockAdjustmentResult['lines'] = [];
      const errors: string[] = [];
      let unchanged = 0;

      // Lock in a stable order so two adjustments on the same products cannot deadlock.
      const sorted = [...dto.lines].sort((a, b) => a.productId.localeCompare(b.productId));
      for (const line of sorted) {
        const product = byId.get(line.productId)!;
        const before = await lockBalance(tx, product.id, warehouse.id);
        const input = new Prisma.Decimal(line.quantity);
        const change = dto.mode === 'count' ? input.minus(before) : input;
        const after = before.plus(change);

        if (change.isZero()) {
          unchanged++;
          continue;
        }
        if (after.isNegative()) {
          errors.push(
            `${product.sku}: only ${before.toString()} ${product.baseUnit.code} in ${warehouse.code}, cannot remove ${change.abs().toString()}`,
          );
          continue;
        }

        await postMove(
          tx,
          {
            productId: product.id,
            warehouseId: warehouse.id,
            type: 'ADJUSTMENT',
            quantity: change,
            unitCost: product.averageCost,
            createdById: user.id,
            sourceType: 'StockAdjustment',
            sourceId: id,
            reference,
            reason: dto.reason,
          },
          after,
        );
        lines.push({
          product: {
            id: product.id,
            sku: product.sku,
            name: product.name,
            baseUnit: product.baseUnit,
          },
          before: before.toFixed(4),
          change: change.toFixed(4),
          after: after.toFixed(4),
        });
      }

      // All or nothing: throwing rolls back every move and the document number.
      if (errors.length) throw new BadRequestException(errors);
      if (lines.length === 0) {
        throw new BadRequestException(
          'Nothing to adjust: every counted quantity already matches the stock',
        );
      }

      const result: StockAdjustmentResult = {
        id,
        reference,
        createdAt: createdAt.toISOString(),
        warehouse: { id: warehouse.id, code: warehouse.code, name: warehouse.name },
        reason: dto.reason,
        lines,
        unchanged,
      };
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'post',
          entity: 'StockAdjustment',
          entityId: id,
          after: toAuditJson({ ...result, mode: dto.mode }),
        },
      });
      return result;
    });
  }
  /** Posted adjustments, newest first, one item per document with its lines. */
  async list(
    query: AdjustmentsQueryDto,
    user: RequestUser,
  ): Promise<Paginated<StockAdjustmentListItem>> {
    const where: Prisma.StockMoveWhereInput = {
      type: 'ADJUSTMENT',
      sourceType: 'StockAdjustment',
      ...(query.warehouseId && { warehouseId: query.warehouseId }),
    };
    // One document = all moves sharing a sourceId; page over documents, not moves.
    const [groups, totalGroups] = await Promise.all([
      this.prisma.stockMove.groupBy({
        by: ['sourceId'],
        where,
        _max: { createdAt: true },
        orderBy: { _max: { createdAt: 'desc' } },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.stockMove.groupBy({ by: ['sourceId'], where }),
    ]);
    const ids = groups.map((g) => g.sourceId!);
    const moves = await this.prisma.stockMove.findMany({
      where: { sourceId: { in: ids } },
      include: {
        product: {
          select: { id: true, sku: true, name: true, baseUnit: { select: { code: true } } },
        },
        warehouse: { select: { id: true, code: true, name: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
      orderBy: { product: { name: 'asc' } },
    });

    const showCost = canSeeCost(user);
    const items = ids.map((id) => {
      const docMoves = moves.filter((m) => m.sourceId === id);
      const first = docMoves[0];
      const value = docMoves.reduce(
        (sum, m) => sum.plus(m.quantity.times(m.unitCost)),
        new Prisma.Decimal(0),
      );
      return {
        id,
        reference: first.reference ?? '',
        createdAt: first.createdAt.toISOString(),
        warehouse: first.warehouse,
        reason: first.reason ?? '',
        createdBy: first.createdBy,
        lines: docMoves.map((m) => ({ product: m.product, change: m.quantity.toFixed(4) })),
        ...(showCost && { valueChange: value.toFixed(2) }),
      };
    });
    return { items, total: totalGroups.length, page: query.page, pageSize: query.pageSize };
  }
}

function validateLines(dto: CreateAdjustmentDto) {
  const seen = new Set<string>();
  const problems: string[] = [];
  dto.lines.forEach((l, i) => {
    if (seen.has(l.productId)) problems.push(`Line ${i + 1}: product appears twice`);
    seen.add(l.productId);
    if (dto.mode === 'count' && l.quantity < 0) {
      problems.push(`Line ${i + 1}: a counted quantity cannot be negative`);
    }
    if (dto.mode === 'delta' && l.quantity === 0) {
      problems.push(`Line ${i + 1}: the change cannot be 0`);
    }
  });
  if (problems.length) throw new BadRequestException(problems);
}
