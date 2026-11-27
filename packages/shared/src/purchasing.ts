/**
 * Purchasing API shapes, shared by the API and the web app.
 * Decimals travel as strings ("12.5000") so no precision is lost in JSON.
 */

import type { TaxRateRef } from './products';

// ── Suppliers ────────────────────────────────────────────────────────────────

/**
 * Tunisian RNE "identifiant unique": 7 digits and a key letter, e.g. "1234567A".
 * Also accepted as "1234567/A"; stored without the slash.
 */
export const TN_RNE_PATTERN = /^\d{7}\/?[A-Z]$/;

/**
 * Tunisian tax ID (matricule fiscal), e.g. "1234567A/A/M/000": identifier and key letter,
 * VAT code, category code, establishment number. Only used for a hint: foreign suppliers
 * have other formats.
 */
export const TN_TAX_ID_PATTERN = /^\d{7}\/?[A-Z]\/?[A-Z]\/?[A-Z]\/?\d{3}$/;

/** "1234567/a" → "1234567A" */
export const normalizeRne = (rne: string) => rne.trim().toUpperCase().replace('/', '');

export const SUPPLIER_STATUS_FILTERS = ['active', 'inactive', 'all'] as const;
export type SupplierStatusFilter = (typeof SUPPLIER_STATUS_FILTERS)[number];

/** One row of GET /purchasing/suppliers */
export interface SupplierListItem {
  id: string;
  code: string;
  name: string;
  /** Tunisian trade register identifier */
  rne: string | null;
  /** Matricule fiscal */
  taxId: string | null;
  email: string | null;
  /** Main phone number */
  phone: string | null;
  /** VAT applied to this supplier's purchases; null = each product's own rate */
  taxRate: TaxRateRef | null;
  paymentTermDays: number;
  isActive: boolean;
  /** Confirmed or partially received orders */
  openOrders: number;
}

/** GET /purchasing/suppliers/:id */
export interface SupplierDetail extends SupplierListItem {
  /** Site address */
  address: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  /** Sum of the totals of every order that is not draft or cancelled */
  orderedTotal: string;
  lastOrderDate: string | null;
}

/** Body of POST /purchasing/suppliers. PATCH accepts any subset (plus isActive). */
export interface SupplierInput {
  /** Left empty on create: the next SUP-NNNNN code is used */
  code?: string;
  name: string;
  /** Tunisian RNE identifier, e.g. 1234567A */
  rne?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  taxId?: string | null;
  /** null = use each product's own rate */
  taxRateId?: string | null;
  paymentTermDays?: number;
  notes?: string | null;
  isActive?: boolean;
}

/** GET /purchasing/suppliers/lookups: choices for the supplier form. */
export interface SupplierLookups {
  /** Active tax rates, highest first */
  taxRates: TaxRateRef[];
}

// ── Purchase orders ──────────────────────────────────────────────────────────

export const PURCHASE_ORDER_STATUSES = [
  'DRAFT',
  'CONFIRMED',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CANCELLED',
] as const;
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

/** Status filter of the list: a status, or "open" = confirmed or partially received */
export type PurchaseOrderStatusFilter = PurchaseOrderStatus | 'open' | 'all';

/** One row of GET /purchasing/orders */
export interface PurchaseOrderListItem {
  id: string;
  number: string;
  status: PurchaseOrderStatus;
  supplier: { id: string; code: string; name: string };
  warehouse: { id: string; code: string; name: string };
  orderDate: string;
  expectedDate: string | null;
  lineCount: number;
  total: string;
}

export interface PurchaseOrderLineDto {
  id: string;
  lineNo: number;
  product: { id: string; sku: string; name: string; baseUnitCode: string };
  unit: { id: string; code: string; name: string };
  /** Base units per line unit, copied at order time */
  unitFactor: string;
  quantity: string;
  unitPrice: string;
  discountPct: string;
  /** Tax % copied at order time */
  taxRate: string;
  /** Net of discount, before tax */
  lineTotal: string;
  /** In line units */
  receivedQty: string;
}

/** GET /purchasing/orders/:id */
export interface PurchaseOrderDetail extends PurchaseOrderListItem {
  notes: string | null;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  confirmedAt: string | null;
  createdBy: { id: string; fullName: string };
  createdAt: string;
  updatedAt: string;
  lines: PurchaseOrderLineDto[];
  receipts: { id: string; number: string; receivedAt: string; status: GoodsReceiptStatus }[];
}

export interface PurchaseOrderLineInput {
  productId: string;
  /** The product's base unit or one of its purchase pack units */
  unitId: string;
  quantity: string;
  unitPrice: string;
  /** 0–100, default 0 */
  discountPct?: string;
}

/** Body of POST /purchasing/orders. PATCH (draft only) accepts any subset. */
export interface PurchaseOrderInput {
  supplierId: string;
  warehouseId: string;
  /** YYYY-MM-DD, default today */
  orderDate?: string;
  expectedDate?: string | null;
  notes?: string | null;
  lines: PurchaseOrderLineInput[];
}

// ── Goods receipts ───────────────────────────────────────────────────────────

/** DRAFT = editable, no stock yet; POSTED = in stock, immutable; CANCELLED = reversed. */
export const GOODS_RECEIPT_STATUSES = ['DRAFT', 'POSTED', 'CANCELLED'] as const;
export type GoodsReceiptStatus = (typeof GOODS_RECEIPT_STATUSES)[number];
export type GoodsReceiptStatusFilter = GoodsReceiptStatus | 'all';

export interface GoodsReceiptListItem {
  id: string;
  /** GR-2026-00001 once posted; "DRAFT-…" before */
  number: string;
  status: GoodsReceiptStatus;
  /** ISO date-time the goods arrived */
  receivedAt: string;
  purchaseOrder: { id: string; number: string };
  supplier: { id: string; code: string; name: string };
  warehouse: { id: string; code: string; name: string };
  /** The supplier's delivery note number (bon de livraison) */
  supplierRef: string | null;
  /** The supplier's invoice, when it came with the goods */
  supplierInvoiceNumber: string | null;
  /** YYYY-MM-DD */
  supplierInvoiceDate: string | null;
  lineCount: number;
  /** Value received, after discount and before VAT (3 decimals) */
  value: string;
  createdBy: { id: string; fullName: string };
  /** none = nothing billed yet, partial, full = every received quantity is on posted bills */
  billing: 'none' | 'partial' | 'full';
}

export interface GoodsReceiptLineDto {
  id: string;
  purchaseOrderLineId: string;
  product: { id: string; sku: string; name: string; baseUnitCode: string };
  unit: { id: string; code: string };
  unitFactor: string;
  /** In the order line's unit */
  quantity: string;
  /** What entered the stock, in the product's base unit */
  baseQuantity: string;
  /** Per base unit, after discount, before VAT */
  unitCost: string;
  value: string;
  /** Refused at reception (never entered the stock), in the order line's unit */
  rejectedQty: string;
  rejectReason: string | null;
  /** Already on posted supplier bills, in the order line's unit */
  billedQty: string;
  /** Ordered and already received (posted) on the order line, for drafts */
  orderedQty: string;
  receivedOnOrder: string;
}

export interface GoodsReceiptDetail extends GoodsReceiptListItem {
  notes: string | null;
  postedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  /** Supplier bills (not cancelled) with lines from this receipt */
  bills: { id: string; number: string; status: string }[];
  /** Over-receipt allowed by the company settings, in % of the ordered quantity */
  tolerancePct: string;
  /** True on the receipt that completed a delivered order: its supplier invoice can be recorded */
  invoiceEditable: boolean;
  createdAt: string;
  lines: GoodsReceiptLineDto[];
}

/** PATCH /purchasing/receipts/:id/invoice */
export interface SupplierInvoiceInput {
  supplierInvoiceNumber: string;
  /** YYYY-MM-DD */
  supplierInvoiceDate: string;
}

export interface GoodsReceiptInput {
  purchaseOrderId: string;
  /** YYYY-MM-DD; today when omitted */
  receivedDate?: string;
  supplierRef?: string | null;
  /** Both or neither; only when this receipt completes the order (100 % received) */
  supplierInvoiceNumber?: string | null;
  /** YYYY-MM-DD */
  supplierInvoiceDate?: string | null;
  notes?: string | null;
  /** Lines with a quantity of 0 (and nothing rejected) are ignored */
  lines: GoodsReceiptLineInput[];
  /** true = save as a draft (no stock movement); default false = receive and post at once */
  asDraft?: boolean;
}

export interface GoodsReceiptLineInput {
  purchaseOrderLineId: string;
  /** Accepted quantity, in the order line's unit */
  quantity: string;
  /** Refused at the door; does not enter the stock */
  rejectedQty?: string;
  rejectReason?: string | null;
}

/** GET / PATCH /purchasing/receipts/settings */
export interface ReceivingSettings {
  /** Receipts may exceed the ordered quantity by up to this % (0 = never), e.g. "5.00" */
  tolerancePct: string;
}

/** POST /purchasing/receipts/:id/cancel */
export interface CancelGoodsReceiptInput {
  reason: string;
}

/**
 * Delivery status of a confirmed order, as the receiving team sees it:
 * waiting = nothing received (CONFIRMED), in_progress = partly received,
 * delivered = everything received.
 */
export const DELIVERY_STATUSES = ['waiting', 'in_progress', 'delivered'] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];
export type DeliveryStatusFilter = DeliveryStatus | 'open' | 'all';

export interface DeliveryReceiptRef {
  id: string;
  number: string;
  receivedAt: string;
  supplierRef: string | null;
  supplierInvoiceNumber: string | null;
  supplierInvoiceDate: string | null;
}

/** One confirmed order in the delivery follow-up. */
export interface DeliveryListItem {
  order: { id: string; number: string; orderDate: string; total: string };
  supplier: { id: string; code: string; name: string };
  warehouse: { id: string; code: string; name: string };
  status: DeliveryStatus;
  /** YYYY-MM-DD or null */
  expectedDate: string | null;
  /** ISO date-time of the first and of the last receipt (null while waiting) */
  firstDeliveryAt: string | null;
  lastDeliveryAt: string | null;
  /** Not delivered and past the expected date; or delivered after it */
  late: boolean;
  /** Received value / ordered value, 0 to 100 */
  progressPct: number;
  lineCount: number;
  /** Lines fully received */
  linesDone: number;
  receipts: DeliveryReceiptRef[];
}

export interface GoodsReceiptSummary {
  /** Draft receipts (not in stock yet) */
  drafts: number;
  waiting: number;
  inProgress: number;
  /** Orders whose last delivery was this month */
  deliveredThisMonth: number;
  /** Open orders past their expected date */
  late: number;
  /** Receipts this month and their value excl. VAT */
  monthReceipts: number;
  monthValue: string;
}
