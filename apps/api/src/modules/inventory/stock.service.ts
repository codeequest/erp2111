import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  Paginated,
  StockFilter,
  StockLevelRow,
  StockLevelsResponse,
  StockMoveRow,
  WarehouseDto,
} from '@erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestUser } from '../../common/types/request-user';
import { StockLevelsQueryDto, StockMovesQueryDto } from './dto/stock.dto';
import { canSeeCost } from './stock-ledger';

const ZERO = new Prisma.Decimal(0);
const warehouseSelect = { id: true, code: true, name: true, isActive: true } as const;

/** Read side of the stock ledger: levels per warehouse and the movement history. */
@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService) {}

  /** Active warehouses, plus inactive ones that still hold stock. */
  listWarehouses(): Promise<WarehouseDto[]> {
    return this.prisma.warehouse.findMany({
      where: { OR: [{ isActive: true }, { stockBalances: { some: { quantity: { not: 0 } } } }] },
      select: warehouseSelect,
      orderBy: { code: 'asc' },
    });
  }

  /**
   * One row per product. The stock filters (low / out / in stock) depend on summed
   * quantities, so matching products are loaded once and filtered in memory, then
   * paginated. Fine for catalogues of a few thousand items; move to SQL if it grows.
   */
  async levels(query: StockLevelsQueryDto, user: RequestUser): Promise<StockLevelsResponse> {
    const where: Prisma.ProductWhereInput = {
      // Inactive products stay visible as long as they still have stock.
      OR: [{ isActive: true }, { stockBalances: { some: { quantity: { not: 0 } } } }],
    };
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.search) {
      const contains = { contains: query.search, mode: 'insensitive' as const };
      where.AND = [{ OR: [{ sku: contains }, { name: contains }, { barcode: contains }] }];
    }

    const [allWarehouses, products] = await Promise.all([
      this.listWarehouses(),
      this.prisma.product.findMany({
        where,
        select: {
          id: true,
          sku: true,
          name: true,
          isActive: true,
          minStock: true,
          averageCost: true,
          baseUnit: { select: { id: true, code: true } },
          category: { select: { id: true, name: true } },
          stockBalances: { select: { warehouseId: true, quantity: true } },
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
    ]);

    const showCost = canSeeCost(user);
    const warehouses = query.warehouseId
      ? allWarehouses.filter((w) => w.id === query.warehouseId)
      : allWarehouses;

    let totalValue = ZERO;
    const rows: StockLevelRow[] = [];
    for (const p of products) {
      const byWarehouse: Record<string, string> = {};
      let overall = ZERO;
      let shown = ZERO;
      for (const b of p.stockBalances) {
        overall = overall.plus(b.quantity);
        if (!query.warehouseId || b.warehouseId === query.warehouseId) {
          shown = shown.plus(b.quantity);
          if (!b.quantity.isZero()) byWarehouse[b.warehouseId] = b.quantity.toFixed(4);
        }
      }
      // Min stock is set per product, so "low" always compares the overall total.
      const isLow = p.minStock.greaterThan(0) && overall.lessThan(p.minStock);
      if (!matchesFilter(query.stock, shown, isLow)) continue;

      const value = shown.times(p.averageCost);
      totalValue = totalValue.plus(value);
      rows.push({
        product: {
          id: p.id,
          sku: p.sku,
          name: p.name,
          isActive: p.isActive,
          baseUnit: p.baseUnit,
          category: p.category,
        },
        byWarehouse,
        total: shown.toFixed(4),
        minStock: p.minStock.toFixed(4),
        isLow,
        ...(showCost && { value: value.toFixed(2) }),
      });
    }

    const start = (query.page - 1) * query.pageSize;
    return {
      items: rows.slice(start, start + query.pageSize),
      total: rows.length,
      page: query.page,
      pageSize: query.pageSize,
      warehouses,
      ...(showCost && { totalValue: totalValue.toFixed(2) }),
    };
  }

  /** The ledger, newest first. */
  async moves(query: StockMovesQueryDto, user: RequestUser): Promise<Paginated<StockMoveRow>> {
    const where: Prisma.StockMoveWhereInput = {};
    if (query.productId) where.productId = query.productId;
    if (query.warehouseId) where.warehouseId = query.warehouseId;
    if (query.type) where.type = query.type;
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from && { gte: query.from }),
        ...(query.to && { lt: query.to }),
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
          warehouse: { select: { id: true, code: true, name: true } },
          createdBy: { select: { id: true, fullName: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    const showCost = canSeeCost(user);
    return {
      items: rows.map((m) => ({
        id: m.id,
        createdAt: m.createdAt.toISOString(),
        type: m.type,
        quantity: m.quantity.toFixed(4),
        ...(showCost && { unitCost: m.unitCost.toFixed(4) }),
        reference: m.reference,
        reason: m.reason,
        product: m.product,
        warehouse: m.warehouse,
        createdBy: m.createdBy,
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }
}

export function matchesFilter(filter: StockFilter, qty: Prisma.Decimal, isLow: boolean): boolean {
  switch (filter) {
    case 'inStock':
      return qty.greaterThan(0);
    case 'out':
      return qty.lessThanOrEqualTo(0);
    case 'low':
      return isLow;
    default:
      return true;
  }
}
