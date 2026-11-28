import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma, StockDocumentStatus } from '@prisma/client';
import type { StockDocProduct, WarehouseRef } from '@erp/shared';
import { PrismaService } from '../../../prisma/prisma.service';

/** Helpers shared by stock adjustments and transfers. */

export type Db = Prisma.TransactionClient | PrismaService;

const DOCUMENT_TABLES = {
  StockAdjustment: 'stock_adjustments',
  StockTransfer: 'stock_transfers',
  StockCount: 'stock_counts',
} as const;
export type StockDocumentKind = keyof typeof DOCUMENT_TABLES;

/**
 * Locks a document row until the transaction ends and returns its status.
 * Two people pressing "Validate" at once are handled one after the other,
 * and the second one sees the document is already posted.
 */
export async function lockDocument(
  tx: Prisma.TransactionClient,
  kind: StockDocumentKind,
  id: string,
): Promise<StockDocumentStatus> {
  const rows = await tx.$queryRaw<{ status: StockDocumentStatus }[]>`
    SELECT status FROM ${Prisma.raw(`"${DOCUMENT_TABLES[kind]}"`)} WHERE id = ${id}::uuid FOR UPDATE`;
  if (!rows.length) throw new NotFoundException(`${label(kind)} not found`);
  return rows[0].status;
}

export function assertDraft(kind: StockDocumentKind, status: StockDocumentStatus, action: string) {
  if (status !== 'DRAFT') {
    throw new BadRequestException(
      `This ${label(kind).toLowerCase()} is ${status.toLowerCase()}: only a draft can be ${action}`,
    );
  }
}

const LABELS: Record<StockDocumentKind, string> = {
  StockAdjustment: 'Adjustment',
  StockTransfer: 'Transfer',
  StockCount: 'Stock count',
};

function label(kind: StockDocumentKind) {
  return LABELS[kind];
}

/** Checks the products of a document: they exist and none is listed twice. */
export async function checkProducts(db: Db, productIds: string[]) {
  const seen = new Set<string>();
  productIds.forEach((id, i) => {
    if (seen.has(id)) throw new BadRequestException(`Line ${i + 1}: this product is already on another line`);
    seen.add(id);
  });
  const found = await db.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true },
  });
  if (found.length !== seen.size) throw new NotFoundException('Product not found');
}

export async function activeWarehouse(db: Db, id: string, role = 'Warehouse') {
  const w = await db.warehouse.findUnique({ where: { id } });
  if (!w) throw new NotFoundException(`${role} not found`);
  if (!w.isActive) throw new BadRequestException(`${role} ${w.code} is not active`);
  return w;
}

/** On-hand quantity of some products in one warehouse. */
export async function onHandIn(db: Db, warehouseId: string, productIds: string[]) {
  const rows = await db.stockBalance.findMany({
    where: { warehouseId, productId: { in: productIds } },
    select: { productId: true, quantity: true },
  });
  return new Map(rows.map((r) => [r.productId, r.quantity.toString()]));
}

export const productSelect = {
  id: true,
  sku: true,
  name: true,
  baseUnit: { select: { code: true } },
} satisfies Prisma.ProductSelect;

export function toProduct(p: {
  id: string;
  sku: string;
  name: string;
  baseUnit: { code: string };
}): StockDocProduct {
  return { id: p.id, sku: p.sku, name: p.name, unit: p.baseUnit.code };
}

export function toWarehouse(w: { id: string; code: string; name: string }): WarehouseRef {
  return { id: w.id, code: w.code, name: w.name };
}

export function pageOf(page: number, pageSize: number) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}
