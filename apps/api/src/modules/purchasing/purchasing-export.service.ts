import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PurchaseOrderStatus } from '@erp/shared';
import { writeXlsx } from '../../common/xlsx';
import { PrismaService } from '../../prisma/prisma.service';
import { ExportDeliveriesQueryDto, ExportGoodsReceiptsQueryDto } from './dto/goods-receipt.dto';
import { ExportPurchaseOrdersQueryDto, type ExportLang } from './dto/purchase-order.dto';
import { GoodsReceiptsService, receiptWhere } from './goods-receipts.service';
import { ExportSuppliersQueryDto } from './dto/supplier.dto';
import { orderWhere } from './purchase-orders.service';
import { toDateString } from './purchase-order-rules';
import { supplierWhere } from './suppliers.service';

/** An export never returns more rows than this (the file stays openable). */
const MAX_ROWS = 10_000;
/** Tunisian dinar: 3 decimals (millimes) */
const MONEY = '#,##0.000';
const QTY = '#,##0.####';

const TEXT = {
  en: {
    suppliers: 'Suppliers',
    orders: 'Purchase orders',
    lines: 'Order lines',
    receipts: 'Goods receipts',
    receiptLines: 'Received lines',
    deliveries: 'Deliveries',
    delivery: { waiting: 'Waiting', in_progress: 'In progress', delivered: 'Delivered' },
    yes: 'Yes',
    deliveryCols: [
      'PO number',
      'Delivery status',
      'Supplier code',
      'Supplier',
      'Warehouse',
      'Order date',
      'Expected delivery',
      'First delivery',
      'Last delivery',
      'Late',
      'Received %',
      'Lines complete',
      'Order total',
      'Receipts',
      'Delivery notes',
      'Supplier invoices',
    ],
    receiptCols: [
      'Number',
      'Received on',
      'PO number',
      'Supplier code',
      'Supplier',
      'Delivery note',
      'Supplier invoice',
      'Invoice date',
      'Warehouse',
      'Lines',
      'Value excl. VAT',
      'Received by',
      'Notes',
    ],
    receiptLineCols: [
      'Receipt',
      'Received on',
      'PO number',
      'SKU',
      'Product',
      'Quantity',
      'Unit',
      'Base quantity',
      'Base unit',
      'Cost per base unit',
      'Value excl. VAT',
    ],
    active: 'Active',
    inactive: 'Inactive',
    productRate: 'Product rate',
    status: {
      DRAFT: 'Draft',
      CONFIRMED: 'Confirmed',
      PARTIALLY_RECEIVED: 'Partially received',
      RECEIVED: 'Received',
      CANCELLED: 'Cancelled',
    },
    supplierCols: [
      'Code',
      'Name',
      'RNE',
      'Tax ID',
      'Tax rate',
      'Tax %',
      'Main phone',
      'E-mail',
      'Site address',
      'Payment terms (days)',
      'Open orders',
      'Status',
      'Created on',
    ],
    orderCols: [
      'Number',
      'Status',
      'Supplier code',
      'Supplier',
      'Warehouse',
      'Order date',
      'Expected on',
      'Lines',
      'Subtotal',
      'Discounts',
      'Tax',
      'Total',
      'Confirmed on',
      'Created by',
    ],
    lineCols: [
      'PO number',
      'Line',
      'SKU',
      'Product',
      'Unit',
      'Base units per unit',
      'Quantity',
      'Unit price',
      'Discount %',
      'Tax %',
      'Line total',
      'Received',
    ],
  },
  fr: {
    suppliers: 'Fournisseurs',
    orders: 'Bons de commande',
    lines: 'Lignes de commande',
    receipts: 'Réceptions',
    receiptLines: 'Lignes reçues',
    deliveries: 'Livraisons',
    delivery: { waiting: 'En attente', in_progress: 'En cours', delivered: 'Livrée' },
    yes: 'Oui',
    deliveryCols: [
      'N° BC',
      'Statut de livraison',
      'Code fournisseur',
      'Fournisseur',
      'Dépôt',
      'Date de commande',
      'Livraison prévue',
      'Première livraison',
      'Dernière livraison',
      'En retard',
      '% reçu',
      'Lignes complètes',
      'Total commande',
      'Réceptions',
      'BL fournisseur',
      'Factures fournisseur',
    ],
    receiptCols: [
      'Numéro',
      'Reçu le',
      'N° BC',
      'Code fournisseur',
      'Fournisseur',
      'BL fournisseur',
      'Facture fournisseur',
      'Date facture',
      'Dépôt',
      'Lignes',
      'Valeur HT',
      'Reçu par',
      'Notes',
    ],
    receiptLineCols: [
      'Réception',
      'Reçu le',
      'N° BC',
      'Référence',
      'Article',
      'Quantité',
      'Unité',
      'Quantité de base',
      'Unité de base',
      'Coût par unité de base',
      'Valeur HT',
    ],
    active: 'Actif',
    inactive: 'Inactif',
    productRate: "Taux de l'article",
    status: {
      DRAFT: 'Brouillon',
      CONFIRMED: 'Confirmé',
      PARTIALLY_RECEIVED: 'Partiellement reçu',
      RECEIVED: 'Reçu',
      CANCELLED: 'Annulé',
    },
    supplierCols: [
      'Code',
      'Raison sociale',
      'RNE',
      'Matricule fiscal',
      'Taux de TVA',
      'TVA %',
      'Téléphone principal',
      'E-mail',
      'Adresse du site',
      'Délai de paiement (jours)',
      'Commandes en cours',
      'Statut',
      'Créé le',
    ],
    orderCols: [
      'Numéro',
      'Statut',
      'Code fournisseur',
      'Fournisseur',
      'Dépôt',
      'Date de commande',
      'Prévue le',
      'Lignes',
      'Sous-total',
      'Remises',
      'TVA',
      'Total',
      'Confirmé le',
      'Créé par',
    ],
    lineCols: [
      'N° BC',
      'Ligne',
      'Référence',
      'Article',
      'Unité',
      'Unités de base par unité',
      'Quantité',
      'Prix unitaire',
      'Remise %',
      'TVA %',
      'Total ligne',
      'Reçu',
    ],
  },
} satisfies Record<ExportLang, unknown>;

const n = (d: Prisma.Decimal | null | undefined) => (d == null ? null : d.toNumber());

/** Excel exports of the purchasing lists, with the same filters as the screens. */
@Injectable()
export class PurchasingExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly receipts: GoodsReceiptsService,
  ) {}

  async suppliersXlsx(query: ExportSuppliersQueryDto): Promise<Buffer> {
    const tx = TEXT[query.lang];
    const rows = await this.prisma.supplier.findMany({
      where: supplierWhere(query),
      orderBy: { name: 'asc' },
      take: MAX_ROWS,
      include: {
        taxRate: { select: { name: true, rate: true } },
        _count: {
          select: {
            purchaseOrders: { where: { status: { in: ['CONFIRMED', 'PARTIALLY_RECEIVED'] } } },
          },
        },
      },
    });
    return writeXlsx([
      {
        name: tx.suppliers,
        rows: [
          tx.supplierCols,
          ...rows.map((s) => [
            s.code,
            s.name,
            s.rne,
            s.taxId,
            s.taxRate?.name ?? tx.productRate,
            n(s.taxRate?.rate),
            s.phone,
            s.email,
            s.address,
            s.paymentTermDays,
            s._count.purchaseOrders,
            s.isActive ? tx.active : tx.inactive,
            toDateString(s.createdAt),
          ]),
        ],
        widths: [12, 32, 11, 20, 22, 8, 18, 28, 40, 12, 12, 10, 12],
        numFmt: { 5: '0.00' },
      },
    ]);
  }

  /** Sheet 1: one row per order. Sheet 2: every line of those orders. */
  async ordersXlsx(query: ExportPurchaseOrdersQueryDto): Promise<Buffer> {
    const tx = TEXT[query.lang];
    const orders = await this.prisma.purchaseOrder.findMany({
      where: orderWhere(query),
      orderBy: [{ orderDate: 'desc' }, { number: 'desc' }],
      take: MAX_ROWS,
      include: {
        supplier: { select: { code: true, name: true } },
        warehouse: { select: { code: true } },
        createdBy: { select: { fullName: true } },
        lines: {
          orderBy: { lineNo: 'asc' },
          include: {
            product: { select: { sku: true, name: true } },
            unit: { select: { code: true } },
          },
        },
      },
    });
    return writeXlsx([
      {
        name: tx.orders,
        rows: [
          tx.orderCols,
          ...orders.map((o) => [
            o.number,
            tx.status[o.status as PurchaseOrderStatus],
            o.supplier.code,
            o.supplier.name,
            o.warehouse.code,
            toDateString(o.orderDate),
            o.expectedDate ? toDateString(o.expectedDate) : null,
            o.lines.length,
            n(o.subtotal),
            n(o.discountTotal),
            n(o.taxTotal),
            n(o.total),
            o.confirmedAt ? toDateString(o.confirmedAt) : null,
            o.createdBy.fullName,
          ]),
        ],
        widths: [16, 18, 12, 30, 10, 14, 14, 8, 14, 12, 12, 14, 14, 22],
        numFmt: { 8: MONEY, 9: MONEY, 10: MONEY, 11: MONEY },
      },
      {
        name: tx.lines,
        rows: [
          tx.lineCols,
          ...orders.flatMap((o) =>
            o.lines.map((l) => [
              o.number,
              l.lineNo,
              l.product.sku,
              l.product.name,
              l.unit.code,
              n(l.unitFactor),
              n(l.quantity),
              n(l.unitPrice),
              n(l.discountPct),
              n(l.taxRate),
              n(l.lineTotal),
              n(l.receivedQty),
            ]),
          ),
        ],
        widths: [16, 7, 16, 32, 8, 12, 11, 12, 10, 8, 13, 11],
        numFmt: { 5: QTY, 6: QTY, 7: '#,##0.000#', 8: '0.00', 9: '0.00', 10: MONEY, 11: QTY },
      },
    ]);
  }

  /** Sheet 1: one row per receipt. Sheet 2: every received line. */
  async receiptsXlsx(query: ExportGoodsReceiptsQueryDto): Promise<Buffer> {
    const tx = TEXT[query.lang];
    const receipts = await this.prisma.goodsReceipt.findMany({
      where: receiptWhere(query),
      orderBy: [{ receivedAt: 'desc' }, { number: 'desc' }],
      take: MAX_ROWS,
      include: {
        purchaseOrder: { select: { number: true } },
        supplier: { select: { code: true, name: true } },
        warehouse: { select: { code: true } },
        createdBy: { select: { fullName: true } },
        lines: {
          orderBy: { lineNo: 'asc' },
          include: {
            product: { select: { sku: true, name: true, baseUnit: { select: { code: true } } } },
            unit: { select: { code: true } },
          },
        },
      },
    });
    const value = (lines: { value: Prisma.Decimal }[]) =>
      n(lines.reduce((sum, l) => sum.plus(l.value), new Prisma.Decimal(0)));
    return writeXlsx([
      {
        name: tx.receipts,
        rows: [
          tx.receiptCols,
          ...receipts.map((r) => [
            r.number,
            toDateString(r.receivedAt),
            r.purchaseOrder?.number ?? null,
            r.supplier.code,
            r.supplier.name,
            r.supplierRef,
            r.supplierInvoiceNumber,
            r.supplierInvoiceDate ? toDateString(r.supplierInvoiceDate) : null,
            r.warehouse.code,
            r.lines.length,
            value(r.lines),
            r.createdBy.fullName,
            r.notes,
          ]),
        ],
        widths: [16, 12, 16, 12, 30, 16, 18, 12, 10, 8, 14, 22, 40],
        numFmt: { 10: MONEY },
      },
      {
        name: tx.receiptLines,
        rows: [
          tx.receiptLineCols,
          ...receipts.flatMap((r) =>
            r.lines.map((l) => [
              r.number,
              toDateString(r.receivedAt),
              r.purchaseOrder?.number ?? null,
              l.product.sku,
              l.product.name,
              n(l.quantity),
              l.unit.code,
              n(l.baseQuantity),
              l.product.baseUnit.code,
              n(l.unitCost),
              n(l.value),
            ]),
          ),
        ],
        widths: [16, 12, 16, 16, 32, 11, 8, 13, 10, 14, 14],
        numFmt: { 5: QTY, 7: QTY, 9: '#,##0.000#', 10: MONEY },
      },
    ]);
  }

  /** The delivery follow-up, one row per order, with the same filters as the screen. */
  async deliveriesXlsx(query: ExportDeliveriesQueryDto): Promise<Buffer> {
    const tx = TEXT[query.lang];
    const { items } = await this.receipts.deliveries({ ...query, page: 1, pageSize: MAX_ROWS });
    const day = (iso: string | null) => (iso ? iso.slice(0, 10) : null);
    const join = (values: (string | null)[]) => values.filter(Boolean).join(', ') || null;
    return writeXlsx([
      {
        name: tx.deliveries,
        rows: [
          tx.deliveryCols,
          ...items.map((d) => [
            d.order.number,
            tx.delivery[d.status],
            d.supplier.code,
            d.supplier.name,
            d.warehouse.code,
            d.order.orderDate,
            d.expectedDate,
            day(d.firstDeliveryAt),
            day(d.lastDeliveryAt),
            d.late ? tx.yes : null,
            d.progressPct / 100,
            `${d.linesDone} / ${d.lineCount}`,
            Number(d.order.total),
            join(d.receipts.map((r) => r.number)),
            join(d.receipts.map((r) => r.supplierRef)),
            join(
              d.receipts.map((r) =>
                r.supplierInvoiceNumber
                  ? `${r.supplierInvoiceNumber} (${r.supplierInvoiceDate})`
                  : null,
              ),
            ),
          ]),
        ],
        widths: [16, 16, 12, 30, 10, 14, 14, 14, 14, 10, 10, 12, 14, 30, 24, 34],
        numFmt: { 10: '0%', 12: MONEY },
      },
    ]);
  }
}
