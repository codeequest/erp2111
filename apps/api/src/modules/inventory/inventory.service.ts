import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  stockStatusOf,
  type CategoryOption,
  type ProductDetail,
  type ProductSearchResult,
  type StockStatus,
} from '@erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { SearchProductsDto } from './dto/search-products.dto';
import { likePattern, orderBy, searchTerms } from './product-search';

interface ProductRow {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  category_id: string | null;
  category_name: string | null;
  unit: string;
  sale_price: Prisma.Decimal;
  average_cost: Prisma.Decimal;
  min_stock: Prisma.Decimal;
  stock: Prisma.Decimal;
  stock_status: StockStatus;
  is_active: boolean;
  updated_at: Date;
}

/**
 * Inventory business logic.
 * TODO: implement the write side. Remember:
 *  - wrap every operation that touches stock or money in this.prisma.$transaction(...)
 *  - write an AuditLog row for every create / update / status change
 */
@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async searchProducts(dto: SearchProductsDto, canViewCost: boolean): Promise<ProductSearchResult> {
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 25;
    const where: Prisma.Sql[] = [];

    if (dto.status === 'active' || dto.status === undefined) where.push(Prisma.sql`pr.is_active = true`);
    if (dto.status === 'inactive') where.push(Prisma.sql`pr.is_active = false`);
    if (dto.minPrice !== undefined) where.push(Prisma.sql`pr.sale_price >= ${dto.minPrice}`);
    if (dto.maxPrice !== undefined) where.push(Prisma.sql`pr.sale_price <= ${dto.maxPrice}`);
    if (dto.categoryId) {
      where.push(Prisma.sql`pr.category_id IN (
        WITH RECURSIVE tree AS (
          SELECT id FROM categories WHERE id = ${dto.categoryId}::uuid
          UNION ALL
          SELECT c.id FROM categories c JOIN tree t ON c.parent_id = t.id
        ) SELECT id FROM tree)`);
    }
    for (const term of searchTerms(dto.q)) {
      const pattern = likePattern(term);
      where.push(Prisma.sql`(
        pr.name ILIKE ${pattern} OR pr.sku ILIKE ${pattern} OR pr.barcode ILIKE ${pattern}
        OR pr.description ILIKE ${pattern} OR c.name ILIKE ${pattern}
        OR EXISTS (SELECT 1 FROM product_units pu WHERE pu.product_id = pr.id AND pu.barcode ILIKE ${pattern})
      )`);
    }
    const whereSql = where.length ? Prisma.sql`WHERE ${Prisma.join(where, ' AND ')}` : Prisma.empty;

    const base = Prisma.sql`
      WITH base AS (
        SELECT pr.id, pr.sku, pr.barcode, pr.name, pr.category_id, c.name AS category_name,
               u.code AS unit, pr.sale_price, pr.average_cost, pr.min_stock, pr.is_active, pr.updated_at,
               COALESCE((SELECT SUM(sb.quantity) FROM stock_balances sb WHERE sb.product_id = pr.id), 0) AS stock
        FROM products pr
        LEFT JOIN categories c ON c.id = pr.category_id
        JOIN units u ON u.id = pr.base_unit_id
        ${whereSql}
      ), p AS (
        SELECT base.*,
               CASE WHEN stock <= 0 THEN 'out' WHEN stock <= min_stock THEN 'low' ELSE 'in_stock' END AS stock_status
        FROM base
      )`;
    const stockFilter = dto.stockStatus
      ? Prisma.sql`WHERE p.stock_status = ${dto.stockStatus}`
      : Prisma.empty;

    const [rows, facetRows] = await Promise.all([
      this.prisma.$queryRaw<ProductRow[]>`
        ${base}
        SELECT * FROM p ${stockFilter}
        ORDER BY ${orderBy(dto.sort ?? 'relevance', dto.order ?? 'asc', dto.q)}
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      this.prisma.$queryRaw<{ stock_status: StockStatus; n: bigint }[]>`
        ${base}
        SELECT stock_status, COUNT(*) AS n FROM p GROUP BY stock_status`,
    ]);

    const facets: Record<StockStatus, number> = { in_stock: 0, low: 0, out: 0 };
    for (const f of facetRows) facets[f.stock_status] = Number(f.n);
    const total = dto.stockStatus
      ? facets[dto.stockStatus]
      : facets.in_stock + facets.low + facets.out;

    return {
      items: rows.map((r) => ({
        id: r.id,
        sku: r.sku,
        barcode: r.barcode,
        name: r.name,
        category: r.category_id ? { id: r.category_id, name: r.category_name ?? '' } : null,
        unit: r.unit,
        salePrice: Number(r.sale_price),
        ...(canViewCost ? { averageCost: Number(r.average_cost) } : {}),
        stock: Number(r.stock),
        minStock: Number(r.min_stock),
        stockStatus: r.stock_status,
        isActive: r.is_active,
        updatedAt: r.updated_at.toISOString(),
      })),
      total,
      page,
      pageSize,
      facets,
    };
  }

  async getProduct(id: string, canViewCost: boolean): Promise<ProductDetail> {
    const p = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        baseUnit: true,
        taxRate: true,
        stockBalances: { include: { warehouse: true }, orderBy: { warehouse: { code: 'asc' } } },
      },
    });
    if (!p) throw new NotFoundException('Product not found');

    const stock = p.stockBalances.reduce((sum, b) => sum + Number(b.quantity), 0);
    const minStock = Number(p.minStock);
    return {
      id: p.id,
      sku: p.sku,
      barcode: p.barcode,
      name: p.name,
      description: p.description,
      category: p.category ? { id: p.category.id, name: p.category.name } : null,
      unit: p.baseUnit.code,
      salePrice: Number(p.salePrice),
      ...(canViewCost ? { averageCost: Number(p.averageCost) } : {}),
      stock,
      minStock,
      stockStatus: stockStatusOf(stock, minStock),
      isActive: p.isActive,
      taxRate: p.taxRate ? { name: p.taxRate.name, rate: Number(p.taxRate.rate) } : null,
      stockByWarehouse: p.stockBalances.map((b) => ({
        warehouseId: b.warehouseId,
        code: b.warehouse.code,
        name: b.warehouse.name,
        quantity: Number(b.quantity),
      })),
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  }

  async listCategories(): Promise<CategoryOption[]> {
    const categories = await this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      include: { _count: { select: { products: { where: { isActive: true } } } } },
    });
    return categories.map((c) => ({
      id: c.id,
      name: c.name,
      parentId: c.parentId,
      productCount: c._count.products,
    }));
  }
}
