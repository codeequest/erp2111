import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  OPENING_CSV_COLUMNS,
  type OpeningImportReport,
  type OpeningRowResult,
} from '@erp/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { RequestUser } from '../../../common/types/request-user';
import { StockEngine } from './stock-engine.service';
import { D } from './stock-rules';

export const MAX_OPENING_ROWS = 5000;
const DECIMAL = /^\d{1,14}(\.\d{1,4})?$/;

type Column = (typeof OPENING_CSV_COLUMNS)[number];

interface PlannedLine {
  productId: string;
  warehouseId: string;
  quantity: Prisma.Decimal;
  unitCost: Prisma.Decimal;
}

/**
 * Go-live import of the stock already on the shelves: one OPENING move per
 * product and warehouse, at the given cost (or the product's current average cost).
 *
 * A product that already has stock history in a warehouse is refused there:
 * opening stock is entered once, later corrections are adjustments.
 */
@Injectable()
export class OpeningBalanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: StockEngine,
  ) {}

  async importTable(
    cells: string[][],
    dryRun: boolean,
    defaultWarehouseId: string | undefined,
    user: RequestUser,
  ): Promise<OpeningImportReport> {
    const table = cells.filter((r) => r.some((c) => c.trim() !== ''));
    if (table.length < 2) throw new BadRequestException('The file has no stock rows');
    if (table.length - 1 > MAX_OPENING_ROWS) {
      throw new BadRequestException(`At most ${MAX_OPENING_ROWS} rows can be imported at once`);
    }

    const header = table[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
    const index = new Map<Column, number>();
    header.forEach((h, i) => {
      if ((OPENING_CSV_COLUMNS as readonly string[]).includes(h)) index.set(h as Column, i);
    });
    if (!index.has('sku') || !index.has('quantity')) {
      throw new BadRequestException(
        `The first line must contain column names, including "sku" and "quantity". ` +
          `Expected: ${OPENING_CSV_COLUMNS.join(', ')}`,
      );
    }

    const canSeeCost = user.permissions.has('inventory.cost.view');
    // Excel in comma-decimal locales writes "12,50" in ";" files.
    // Decimal commas of ";" CSV files are already turned into dots by readTable().
    const num = (v: string) => v;

    const [products, warehouses] = await Promise.all([
      this.prisma.product.findMany({
        select: { id: true, sku: true, isActive: true, averageCost: true },
      }),
      this.prisma.warehouse.findMany({ select: { id: true, code: true, isActive: true } }),
    ]);
    const bySku = new Map(products.map((p) => [p.sku.toLowerCase(), p]));
    const byCode = new Map(warehouses.map((w) => [w.code.toUpperCase(), w]));
    const byId = new Map(warehouses.map((w) => [w.id, w]));

    let defaultWarehouse: (typeof warehouses)[number] | undefined;
    if (defaultWarehouseId) {
      defaultWarehouse = byId.get(defaultWarehouseId);
      if (!defaultWarehouse) throw new NotFoundException('Default warehouse not found');
      if (!defaultWarehouse.isActive) {
        throw new BadRequestException(`Warehouse ${defaultWarehouse.code} is not active`);
      }
    }

    const skuAt = index.get('sku')!;
    const productIdsInFile = table
      .slice(1)
      .map((cells) => bySku.get((cells[skuAt] ?? '').trim().toLowerCase())?.id)
      .filter((id): id is string => !!id);
    const history = await this.pairsWithHistory(this.prisma, productIdsInFile);
    const seen = new Map<string, number>();
    const rows: OpeningRowResult[] = [];
    const planned: PlannedLine[] = [];

    table.slice(1).forEach((cells, i) => {
      const line = i + 2;
      const get = (c: Column): string => {
        const at = index.get(c);
        return at === undefined ? '' : (cells[at] ?? '').trim();
      };
      const errors: string[] = [];

      const sku = get('sku');
      const product = sku ? bySku.get(sku.toLowerCase()) : undefined;
      if (!sku) errors.push('sku is empty');
      else if (!product) errors.push(`product "${sku}" does not exist`);
      else if (!product.isActive) errors.push(`product "${sku}" is inactive`);

      const code = get('warehouse').toUpperCase();
      const warehouse = code ? byCode.get(code) : defaultWarehouse;
      if (code && !warehouse) errors.push(`warehouse "${code}" does not exist`);
      else if (!warehouse) errors.push('warehouse is empty (choose a default warehouse)');
      else if (!warehouse.isActive) errors.push(`warehouse ${warehouse.code} is not active`);

      const qtyText = num(get('quantity'));
      let quantity: Prisma.Decimal | undefined;
      if (!qtyText) errors.push('quantity is empty');
      else if (!DECIMAL.test(qtyText)) errors.push(`quantity "${qtyText}" is not a positive number (max 4 decimals)`);
      else if (D(qtyText).isZero()) errors.push('quantity must be more than zero');
      else quantity = D(qtyText);

      const costText = num(get('unit_cost'));
      let unitCost = product ? D(product.averageCost) : D(0);
      if (costText) {
        if (!canSeeCost) errors.push('you need the inventory.cost.view permission to set costs');
        else if (!DECIMAL.test(costText)) errors.push(`unit_cost "${costText}" is not a valid cost (max 4 decimals)`);
        else unitCost = D(costText);
      }

      if (product && warehouse) {
        const key = `${product.id}:${warehouse.id}`;
        if (history.has(key)) {
          errors.push(`already has stock history in ${warehouse.code}: use a stock adjustment instead`);
        }
        // Only a valid row claims its product + warehouse, so a corrected row
        // below a mistyped one is not reported as a duplicate.
        if (seen.has(key)) errors.push(`same product and warehouse as line ${seen.get(key)}`);
        else if (!errors.length) seen.set(key, line);
      }

      const row: OpeningRowResult = {
        line,
        sku,
        warehouse: warehouse?.code ?? code,
        quantity: quantity?.toString() ?? qtyText,
        errors,
      };
      if (canSeeCost) row.unitCost = unitCost.toString();
      rows.push(row);

      if (!errors.length && product && warehouse && quantity) {
        planned.push({ productId: product.id, warehouseId: warehouse.id, quantity, unitCost });
      }
    });

    const reference = `OPENING-${new Date().toISOString().slice(0, 10)}`;
    const report: OpeningImportReport = {
      dryRun,
      totals: { ok: planned.length, error: rows.length - planned.length },
      reference,
      rows,
    };
    if (canSeeCost) {
      report.totalValue = planned
        .reduce((sum, l) => sum.add(l.quantity.mul(l.unitCost)), D(0))
        .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
        .toFixed(2);
    }

    if (!dryRun && planned.length) {
      await this.prisma.$transaction(
        async (tx) => {
          // Stock may have moved since the preview: check again inside the transaction.
          const now = await this.pairsWithHistory(tx, planned.map((l) => l.productId));
          if (planned.some((l) => now.has(`${l.productId}:${l.warehouseId}`))) {
            throw new ConflictException('Stock changed since the preview: check the file again');
          }
          await this.engine.post(
            tx,
            {
              sourceType: 'OpeningBalance',
              sourceId: randomUUID(),
              reference,
              reason: 'Opening stock',
              lines: planned.map((l) => ({
                productId: l.productId,
                warehouseId: l.warehouseId,
                type: 'OPENING' as const,
                quantity: l.quantity,
                unitCost: l.unitCost,
                sourceLineId: randomUUID(),
              })),
            },
            user,
          );
        },
        { timeout: 120_000, maxWait: 10_000 },
      );
    }
    return report;
  }

  /** "productId:warehouseId" pairs that already have stock moves. */
  private async pairsWithHistory(
    db: Prisma.TransactionClient | PrismaService,
    productIds: string[],
  ): Promise<Set<string>> {
    if (!productIds.length) return new Set();
    const rows = await db.stockMove.groupBy({
      by: ['productId', 'warehouseId'],
      where: { productId: { in: [...new Set(productIds)] } },
    });
    return new Set(rows.map((r) => `${r.productId}:${r.warehouseId}`));
  }
}
