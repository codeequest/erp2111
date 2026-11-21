import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestUser } from '../../common/types/request-user';
import { Granularity, marginPct, periodKey, periodsFor } from './stats-periods';

/** Invoices that count as sales: posted ones (paid or not). Drafts and cancelled ones don't. */
const COUNTED = Prisma.sql`status IN ('POSTED', 'PARTIALLY_PAID', 'PAID')`;

interface InvoiceRow {
  issue_date: Date;
  type: 'CUSTOMER_INVOICE' | 'CUSTOMER_CREDIT_NOTE';
  net: Prisma.Decimal;
  tax: Prisma.Decimal;
  total: Prisma.Decimal;
  count: bigint;
}

/**
 * Sales statistics from posted customer invoices minus credit notes (amounts excl. VAT),
 * with cost of sales from delivery / return stock moves (only for users who may see costs).
 */
@Injectable()
export class SalesStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async statistics(granularity: Granularity, year: number, user: RequestUser) {
    const periods = periodsFor(granularity, year);
    const from = new Date(periods[0].from);
    const to = new Date(periods[periods.length - 1].to);
    const canCost = user.permissions.has('inventory.cost.view');

    const [invoiceRows, costRows, previous, topProducts, topCategories, company] =
      await Promise.all([
        this.prisma.$queryRaw<InvoiceRow[]>`
          SELECT issue_date, type,
                 SUM(subtotal - discount_total) AS net, SUM(tax_total) AS tax, SUM(total) AS total,
                 COUNT(*)::bigint AS count
          FROM invoices
          WHERE type IN ('CUSTOMER_INVOICE', 'CUSTOMER_CREDIT_NOTE') AND ${COUNTED}
            AND issue_date >= ${from} AND issue_date < ${to}
          GROUP BY issue_date, type`,
        canCost
          ? this.prisma.$queryRaw<{ day: Date; cost: Prisma.Decimal }[]>`
              SELECT date_trunc('day', created_at)::date AS day, SUM(-quantity * unit_cost) AS cost
              FROM stock_moves
              WHERE type IN ('DELIVERY', 'CUSTOMER_RETURN')
                AND created_at >= ${from} AND created_at < ${to}
              GROUP BY 1`
          : Promise.resolve([]),
        granularity === 'year' ? Promise.resolve(null) : this.netByPeriod(granularity, year - 1),
        this.prisma.$queryRaw<
          {
            id: string;
            sku: string;
            name: string;
            quantity: Prisma.Decimal;
            revenue: Prisma.Decimal;
          }[]
        >`
          SELECT p.id, p.sku, p.name,
                 SUM(CASE WHEN i.type = 'CUSTOMER_INVOICE' THEN l.quantity ELSE -l.quantity END) AS quantity,
                 SUM(CASE WHEN i.type = 'CUSTOMER_INVOICE' THEN l.line_subtotal ELSE -l.line_subtotal END) AS revenue
          FROM invoice_lines l
          JOIN invoices i ON i.id = l.invoice_id
          JOIN products p ON p.id = l.product_id
          WHERE i.type IN ('CUSTOMER_INVOICE', 'CUSTOMER_CREDIT_NOTE') AND i.${COUNTED}
            AND i.issue_date >= ${from} AND i.issue_date < ${to}
          GROUP BY p.id, p.sku, p.name
          ORDER BY revenue DESC
          LIMIT 10`,
        this.prisma.$queryRaw<
          { id: string | null; name: string | null; revenue: Prisma.Decimal }[]
        >`
          SELECT c.id, c.name,
                 SUM(CASE WHEN i.type = 'CUSTOMER_INVOICE' THEN l.line_subtotal ELSE -l.line_subtotal END) AS revenue
          FROM invoice_lines l
          JOIN invoices i ON i.id = l.invoice_id
          LEFT JOIN products p ON p.id = l.product_id
          LEFT JOIN categories c ON c.id = p.category_id
          WHERE i.type IN ('CUSTOMER_INVOICE', 'CUSTOMER_CREDIT_NOTE') AND i.${COUNTED}
            AND i.issue_date >= ${from} AND i.issue_date < ${to}
          GROUP BY c.id, c.name
          ORDER BY revenue DESC
          LIMIT 10`,
        this.prisma.companySettings.findUnique({ where: { id: 1 }, select: { currency: true } }),
      ]);

    type Bucket = {
      revenue: number;
      tax: number;
      total: number;
      invoices: number;
      creditNotes: number;
      creditNoteAmount: number;
      cost: number;
    };
    const buckets = new Map<string, Bucket>(
      periods.map((p) => [
        p.key,
        { revenue: 0, tax: 0, total: 0, invoices: 0, creditNotes: 0, creditNoteAmount: 0, cost: 0 },
      ]),
    );
    for (const r of invoiceRows) {
      const b = buckets.get(periodKey(r.issue_date, granularity));
      if (!b) continue;
      const sign = r.type === 'CUSTOMER_INVOICE' ? 1 : -1;
      b.revenue += sign * Number(r.net);
      b.tax += sign * Number(r.tax);
      b.total += sign * Number(r.total);
      if (sign > 0) b.invoices += Number(r.count);
      else {
        b.creditNotes += Number(r.count);
        b.creditNoteAmount += Number(r.net);
      }
    }
    for (const r of costRows) {
      const b = buckets.get(periodKey(r.day, granularity));
      if (b) b.cost += Number(r.cost);
    }

    const round = (n: number) => Math.round(n * 100) / 100;
    const rows = periods.map((p, i) => {
      const b = buckets.get(p.key)!;
      return {
        key: p.key,
        label: p.label,
        revenue: round(b.revenue),
        tax: round(b.tax),
        total: round(b.total),
        invoices: b.invoices,
        creditNotes: b.creditNotes,
        creditNoteAmount: round(b.creditNoteAmount),
        averageInvoice: b.invoices > 0 ? round(b.revenue / b.invoices) : null,
        previousRevenue: previous ? round(previous[i]) : null,
        ...(canCost
          ? {
              costOfSales: round(b.cost),
              margin: round(b.revenue - b.cost),
              marginPct: marginPct(b.revenue, b.cost),
            }
          : {}),
      };
    });

    const sum = (k: 'revenue' | 'tax' | 'total' | 'invoices' | 'creditNoteAmount') =>
      round(rows.reduce((s, r) => s + r[k], 0));
    const totalCost = canCost ? round(rows.reduce((s, r) => s + (r.costOfSales ?? 0), 0)) : null;
    const totals = {
      revenue: sum('revenue'),
      tax: sum('tax'),
      total: sum('total'),
      invoices: sum('invoices'),
      creditNoteAmount: sum('creditNoteAmount'),
      previousRevenue: previous ? round(previous.reduce((s, v) => s + v, 0)) : null,
      ...(canCost && totalCost !== null
        ? {
            costOfSales: totalCost,
            margin: round(sum('revenue') - totalCost),
            marginPct: marginPct(sum('revenue'), totalCost),
          }
        : {}),
    };

    return {
      granularity,
      year,
      currency: company?.currency ?? 'USD',
      canSeeCost: canCost,
      periods: rows,
      totals,
      topProducts: topProducts.map((p) => ({
        ...p,
        quantity: Number(p.quantity),
        revenue: round(Number(p.revenue)),
      })),
      topCategories: topCategories.map((c) => ({
        id: c.id,
        name: c.name ?? 'No category / services',
        revenue: round(Number(c.revenue)),
      })),
    };
  }

  /** Net revenue per period of another year, for the "same period last year" comparison. */
  private async netByPeriod(granularity: Granularity, year: number): Promise<number[]> {
    const periods = periodsFor(granularity, year);
    const rows = await this.prisma.$queryRaw<{ issue_date: Date; net: Prisma.Decimal }[]>`
      SELECT issue_date,
             SUM(CASE WHEN type = 'CUSTOMER_INVOICE' THEN subtotal - discount_total
                      ELSE -(subtotal - discount_total) END) AS net
      FROM invoices
      WHERE type IN ('CUSTOMER_INVOICE', 'CUSTOMER_CREDIT_NOTE') AND ${COUNTED}
        AND issue_date >= ${new Date(periods[0].from)} AND issue_date < ${new Date(periods[periods.length - 1].to)}
      GROUP BY issue_date`;
    const byKey = new Map<string, number>();
    for (const r of rows) {
      const k = periodKey(r.issue_date, granularity);
      byKey.set(k, (byKey.get(k) ?? 0) + Number(r.net));
    }
    return periods.map((p) => byKey.get(p.key) ?? 0);
  }
}
