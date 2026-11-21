import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestUser } from '../../common/types/request-user';

interface LowStockRow {
  id: string;
  sku: string;
  name: string;
  min_stock: Prisma.Decimal;
  on_hand: Prisma.Decimal;
  unit: string;
}

/**
 * Dashboard figures. Only the inventory figures exist so far; the sales and
 * invoicing figures are null until those modules are built.
 * Each figure is only returned to users allowed to see its module.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(user: RequestUser) {
    const canStock = user.permissions.has('inventory.stock.read');
    let lowStockCount: number | null = null;
    /** Lots with stock expiring within 30 days / already expired */
    let expiringLotsCount: number | null = null;
    let expiredLotsCount: number | null = null;
    if (canStock) {
      const [row] = await this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count FROM (
          SELECT p.id
          FROM products p
          LEFT JOIN stock_balances b ON b.product_id = p.id
          WHERE p.is_active AND p.min_stock > 0
          GROUP BY p.id, p.min_stock
          HAVING COALESCE(SUM(b.quantity), 0) <= p.min_stock
        ) t`;
      lowStockCount = Number(row.count);

      const soon = new Date(Date.now() + 30 * 86_400_000);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const inStock = { balances: { some: { quantity: { gt: 0 } } }, product: { isActive: true } };
      [expiringLotsCount, expiredLotsCount] = await Promise.all([
        this.prisma.lot.count({ where: { ...inStock, expiryDate: { gte: today, lte: soon } } }),
        this.prisma.lot.count({ where: { ...inStock, expiryDate: { lt: today } } }),
      ]);
    }
    return {
      lowStockCount,
      expiringLotsCount,
      expiredLotsCount,
      salesToday: null,
      salesThisMonth: null,
      unpaidInvoices: null,
    };
  }

  /** Active products at or below their minimum, the most critical first. */
  async lowStock(user: RequestUser, limit = 10) {
    if (!user.permissions.has('inventory.stock.read')) return [];
    const rows = await this.prisma.$queryRaw<LowStockRow[]>`
      SELECT p.id, p.sku, p.name, p.min_stock, COALESCE(SUM(b.quantity), 0) AS on_hand, u.code AS unit
      FROM products p
      JOIN units u ON u.id = p.base_unit_id
      LEFT JOIN stock_balances b ON b.product_id = p.id
      WHERE p.is_active AND p.min_stock > 0
      GROUP BY p.id, p.sku, p.name, p.min_stock, u.code
      HAVING COALESCE(SUM(b.quantity), 0) <= p.min_stock
      ORDER BY COALESCE(SUM(b.quantity), 0) / p.min_stock ASC, p.name ASC
      LIMIT ${limit}`;
    return rows.map((r) => ({
      id: r.id,
      sku: r.sku,
      name: r.name,
      unit: r.unit,
      minStock: r.min_stock.toString(),
      onHand: r.on_hand.toString(),
    }));
  }
}
