import { Injectable } from '@nestjs/common';
import { Prisma, StockMoveType } from '@prisma/client';
import type {
  Paginated,
  StockConsistency,
  StockLevelRow,
  StockLevelSort,
  StockLevelsPage,
  StockMoveRow,
} from '@erp/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { RequestUser } from '../../../common/types/request-user';
import { SheetColumn } from '../../../common/spreadsheet';
import { CatalogService } from '../catalog.service';
import { StockLevelsQueryDto, StockMovesQueryDto } from '../dto/stock-query.dto';
import { StockEngine } from './stock-engine.service';
import { D } from './stock-rules';

/** Most rows in one CSV export. */
export const MAX_EXPORT_ROWS = 50_000;

/** Whitelisted ORDER BY expressions (never built from user text). */
const SORT_SQL: Record<StockLevelSort, string> = {
  name: 'x.name',
  sku: 'x.sku',
  onHand: 'x.on_hand',
  available: '(x.on_hand - x.reserved)',
  value: '(x.on_hand * x.average_cost)',
};

interface LevelSqlRow {
  id: string;
  sku: string;
  name: string;
  unit: string;
  is_active: boolean;
  min_stock: Prisma.Decimal;
  average_cost: Prisma.Decimal;
  on_hand: Prisma.Decimal;
  reserved: Prisma.Decimal;
  total: Prisma.Decimal;
}

interface MoveSqlRow {
  id: string;
  created_at: Date;
  type: StockMoveType;
  product_id: string;
  warehouse_id: string;
  quantity: Prisma.Decimal;
  unit_cost: Prisma.Decimal;
  reference: string | null;
  source_type: string | null;
  source_id: string | null;
  reason: string | null;
  reverses_move_id: string | null;
  created_by_id: string;
  balance_after: Prisma.Decimal;
}

/** Read-only stock screens: levels, low stock, ledger, consistency check. */
@Injectable()
export class StockReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly engine: StockEngine,
  ) {}

  // ── Levels ─────────────────────────────────────────────────────────────────

  async levels(q: StockLevelsQueryDto, user: RequestUser): Promise<StockLevelsPage> {
    const canSeeCost = user.permissions.has('inventory.cost.view');
    const base = await this.levelsSql(q);
    const sort = q.sort === 'value' && !canSeeCost ? 'name' : q.sort;
    const dir = q.order === 'desc' ? 'DESC' : 'ASC';

    const [rows, [summary]] = await Promise.all([
      this.prisma.$queryRaw<LevelSqlRow[]>`
        SELECT * FROM (${base}) x
        ORDER BY ${Prisma.raw(`${SORT_SQL[sort]} ${dir}`)}, x.id
        LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`,
      this.prisma.$queryRaw<{ products: number; low: number; value: Prisma.Decimal }[]>`
        SELECT COUNT(*)::int AS products,
               (COUNT(*) FILTER (WHERE x.is_active AND x.min_stock > 0 AND x.total < x.min_stock))::int AS low,
               COALESCE(SUM(x.on_hand * x.average_cost), 0) AS value
        FROM (${base}) x`,
    ]);

    return {
      items: rows.map((r) => toLevelRow(r, canSeeCost)),
      total: summary.products,
      page: q.page,
      pageSize: q.pageSize,
      summary: {
        products: summary.products,
        low: summary.low,
        ...(canSeeCost && { value: money(summary.value) }),
      },
    };
  }

  async levelsRows(
    q: StockLevelsQueryDto,
    user: RequestUser,
  ): Promise<{ columns: SheetColumn[]; rows: (string | number)[][] }> {
    const canSeeCost = user.permissions.has('inventory.cost.view');
    const base = await this.levelsSql(q);
    const sort = q.sort === 'value' && !canSeeCost ? 'name' : q.sort;
    const rows = await this.prisma.$queryRaw<LevelSqlRow[]>`
      SELECT * FROM (${base}) x
      ORDER BY ${Prisma.raw(`${SORT_SQL[sort]} ${q.order === 'desc' ? 'DESC' : 'ASC'}`)}, x.id
      LIMIT ${MAX_EXPORT_ROWS}`;
    const warehouse = q.warehouseId
      ? ((await this.prisma.warehouse.findUnique({ where: { id: q.warehouseId } }))?.code ?? '')
      : 'ALL';

    const header = ['sku', 'name', 'unit', 'warehouse', 'on_hand', 'reserved', 'available', 'min_stock', 'low_stock'];
    if (canSeeCost) header.push('average_cost', 'value');
    const text = new Set(['sku', 'name', 'unit', 'warehouse', 'low_stock']);
    return {
      columns: header.map((h) => ({ header: h, numeric: !text.has(h), width: h === 'name' ? 30 : undefined })),
      rows: rows.map((r) => {
        const row = toLevelRow(r, canSeeCost);
        const line: (string | number)[] = [
          row.product.sku,
          row.product.name,
          row.product.unit,
          warehouse,
          row.onHand,
          row.reserved,
          row.available,
          row.minStock,
          row.low ? 'yes' : 'no',
        ];
        if (canSeeCost) line.push(row.averageCost!, row.value!);
        return line;
      }),
    };
  }

  /** One row per product with its stock, as a SQL fragment the callers sort and page. */
  private async levelsSql(q: StockLevelsQueryDto): Promise<Prisma.Sql> {
    const where: Prisma.Sql[] = [
      // Inactive products are hidden unless they still hold stock somewhere.
      Prisma.sql`(p.is_active OR COALESCE(t.total, 0) <> 0)`,
    ];
    if (q.search) {
      const like = `%${q.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      where.push(Prisma.sql`(p.name ILIKE ${like} OR p.sku ILIKE ${like} OR p.barcode = ${q.search})`);
    }
    if (q.categoryId) {
      const ids = await this.catalog.categoryAndDescendantIds(q.categoryId);
      where.push(Prisma.sql`p.category_id = ANY(${ids}::uuid[])`);
    }
    if (q.inStock) where.push(Prisma.sql`COALESCE(s.q, 0) <> 0`);
    if (q.lowStock) {
      where.push(Prisma.sql`(p.is_active AND p.min_stock > 0 AND COALESCE(t.total, 0) < p.min_stock)`);
    }
    const inWarehouse = q.warehouseId
      ? Prisma.sql`WHERE warehouse_id = ${q.warehouseId}::uuid`
      : Prisma.empty;

    return Prisma.sql`
      WITH s AS (
        SELECT product_id, SUM(quantity) AS q, SUM(reserved) AS r
        FROM stock_balances ${inWarehouse} GROUP BY product_id
      ),
      t AS (SELECT product_id, SUM(quantity) AS total FROM stock_balances GROUP BY product_id)
      SELECT p.id::text AS id, p.sku, p.name, u.code AS unit, p.is_active, p.min_stock, p.average_cost,
             COALESCE(s.q, 0) AS on_hand, COALESCE(s.r, 0) AS reserved, COALESCE(t.total, 0) AS total
      FROM products p
      JOIN units u ON u.id = p.base_unit_id
      LEFT JOIN s ON s.product_id = p.id
      LEFT JOIN t ON t.product_id = p.id
      WHERE ${Prisma.join(where, ' AND ')}`;
  }

  // ── Ledger ─────────────────────────────────────────────────────────────────

  /**
   * Stock moves, newest first, each with the balance of its product in its
   * warehouse right after it. The running balance is computed over the whole
   * history of each product + warehouse before the date/type filters apply.
   */
  async moves(q: StockMovesQueryDto, user: RequestUser): Promise<Paginated<StockMoveRow>> {
    const canSeeCost = user.permissions.has('inventory.cost.view');
    const inner: Prisma.Sql[] = [];
    if (q.productId) inner.push(Prisma.sql`product_id = ${q.productId}::uuid`);
    if (q.warehouseId) inner.push(Prisma.sql`warehouse_id = ${q.warehouseId}::uuid`);
    const outer: Prisma.Sql[] = [];
    if (q.type) outer.push(Prisma.sql`m.type = ${q.type}::"StockMoveType"`);
    // created_at holds UTC without a time zone: compare in UTC, whatever the server's zone.
    const utc = (iso: string) =>
      Prisma.sql`(${new Date(iso).toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
    if (q.from) outer.push(Prisma.sql`m.created_at >= ${utc(q.from)}`);
    if (q.to) outer.push(Prisma.sql`m.created_at < ${utc(q.to)}`);
    if (q.search) {
      const like = `%${q.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      outer.push(Prisma.sql`m.reference ILIKE ${like}`);
    }

    const base = Prisma.sql`
      SELECT * FROM (
        SELECT id::text AS id, created_at, type, product_id::text AS product_id,
               warehouse_id::text AS warehouse_id, quantity, unit_cost, reference,
               source_type, source_id::text AS source_id, reason,
               reverses_move_id::text AS reverses_move_id, created_by_id::text AS created_by_id, seq,
               SUM(quantity) OVER (PARTITION BY product_id, warehouse_id ORDER BY seq) AS balance_after
        FROM stock_moves
        ${inner.length ? Prisma.sql`WHERE ${Prisma.join(inner, ' AND ')}` : Prisma.empty}
      ) m
      ${outer.length ? Prisma.sql`WHERE ${Prisma.join(outer, ' AND ')}` : Prisma.empty}`;

    const [rows, [{ total }]] = await Promise.all([
      this.prisma.$queryRaw<MoveSqlRow[]>`
        ${base} ORDER BY m.seq DESC LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`,
      this.prisma.$queryRaw<{ total: number }[]>`SELECT COUNT(*)::int AS total FROM (${base}) c`,
    ]);

    const [products, warehouses, users] = await Promise.all([
      this.productsById(rows.map((r) => r.product_id)),
      this.warehousesById(rows.map((r) => r.warehouse_id)),
      this.prisma.user.findMany({
        where: { id: { in: [...new Set(rows.map((r) => r.created_by_id))] } },
        select: { id: true, fullName: true },
      }),
    ]);
    const userName = new Map(users.map((u) => [u.id, u.fullName]));

    return {
      items: rows.map((r) => ({
        id: r.id,
        createdAt: r.created_at.toISOString(),
        type: r.type,
        product: products.get(r.product_id)!,
        warehouse: warehouses.get(r.warehouse_id)!,
        quantity: D(r.quantity).toString(),
        balanceAfter: D(r.balance_after).toString(),
        ...(canSeeCost && { unitCost: D(r.unit_cost).toString() }),
        reference: r.reference,
        sourceType: r.source_type,
        sourceId: r.source_id,
        reason: r.reason,
        isReversal: !!r.reverses_move_id,
        createdBy: userName.get(r.created_by_id) ?? '—',
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  // ── Consistency ────────────────────────────────────────────────────────────

  async consistency(): Promise<StockConsistency> {
    const [drift, reserved] = await Promise.all([this.engine.findDrift(), this.engine.findReservationDrift()]);
    const all = [...drift, ...reserved];
    const [products, warehouses] = await Promise.all([
      this.productsById(all.map((d) => d.productId)),
      this.warehousesById(all.map((d) => d.warehouseId)),
    ]);
    return {
      ok: all.length === 0,
      reservationDifferences: reserved.map((d) => ({
        product: products.get(d.productId)!,
        warehouse: warehouses.get(d.warehouseId)!,
        reserved: d.balance,
        orders: d.ledger,
      })),
      differences: drift.map((d) => ({
        product: products.get(d.productId)!,
        warehouse: warehouses.get(d.warehouseId)!,
        balance: d.balance,
        ledger: d.ledger,
      })),
    };
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private async productsById(ids: string[]) {
    const rows = await this.prisma.product.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, sku: true, name: true, baseUnit: { select: { code: true } } },
    });
    return new Map(rows.map((p) => [p.id, { id: p.id, sku: p.sku, name: p.name, unit: p.baseUnit.code }]));
  }

  private async warehousesById(ids: string[]) {
    const rows = await this.prisma.warehouse.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, code: true, name: true },
    });
    return new Map(rows.map((w) => [w.id, w]));
  }
}

function money(v: Prisma.Decimal | string | number) {
  return D(v).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2);
}

function toLevelRow(r: LevelSqlRow, canSeeCost: boolean): StockLevelRow {
  const onHand = D(r.on_hand);
  const reserved = D(r.reserved);
  const minStock = D(r.min_stock);
  const total = D(r.total);
  const row: StockLevelRow = {
    product: { id: r.id, sku: r.sku, name: r.name, unit: r.unit },
    isActive: r.is_active,
    onHand: onHand.toString(),
    reserved: reserved.toString(),
    available: onHand.sub(reserved).toString(),
    totalOnHand: total.toString(),
    minStock: minStock.toString(),
    low: r.is_active && minStock.isPositive() && total.lt(minStock),
  };
  if (canSeeCost) {
    row.averageCost = D(r.average_cost).toString();
    row.value = money(onHand.mul(D(r.average_cost)));
  }
  return row;
}
