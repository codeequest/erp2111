/**
 * Invoicing API shapes (supplier bills and supplier payments), shared by the API
 * and the web app. Decimals travel as strings ("12.500") so no precision is lost.
 */

// ── Currencies ───────────────────────────────────────────────────────────────

/** The currencies a bill or a payment can be in. */
export const CURRENCIES = ['TND', 'EUR', 'USD'] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];

/** Decimals of each currency: the dinar has 1000 millimes, euro and dollar 100 cents. */
export const CURRENCY_DECIMALS: Record<CurrencyCode, number> = { TND: 3, EUR: 2, USD: 2 };

export const CURRENCY_LABELS: Record<CurrencyCode, { en: string; fr: string; symbol: string }> = {
  TND: { en: 'Tunisian dinar', fr: 'Dinar tunisien', symbol: 'DT' },
  EUR: { en: 'Euro', fr: 'Euro', symbol: '€' },
  USD: { en: 'US dollar', fr: 'Dollar américain', symbol: '$' },
};

export function isCurrency(value: unknown): value is CurrencyCode {
  return typeof value === 'string' && (CURRENCIES as readonly string[]).includes(value);
}

// ── Supplier bills ───────────────────────────────────────────────────────────

export const BILL_STATUSES = ['DRAFT', 'POSTED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'] as const;
export type BillStatus = (typeof BILL_STATUSES)[number];

/** List filter: a status, "open" = posted or partly paid (still something to pay), "overdue", or all. */
export type BillStatusFilter = BillStatus | 'open' | 'overdue' | 'all';

export const DISCOUNT_TYPES = ['PERCENT', 'AMOUNT'] as const;
export type DiscountTypeCode = (typeof DISCOUNT_TYPES)[number];

export interface BillListItem {
  id: string;
  /** BILL-2026-00001 once posted; "DRAFT-…" before */
  number: string;
  status: BillStatus;
  supplier: { id: string; code: string; name: string };
  /** The supplier's own bill number */
  supplierRef: string | null;
  purchaseOrder: { id: string; number: string } | null;
  /** YYYY-MM-DD */
  issueDate: string;
  dueDate: string | null;
  currency: CurrencyCode;
  total: string;
  amountPaid: string;
  /** total − amountPaid (0 for drafts and cancelled bills) */
  balance: string;
  /** Something is still to pay and the due date is past */
  overdue: boolean;
  /** Days past the due date (0 when not overdue) */
  daysOverdue: number;
}

export interface BillLineDto {
  id: string;
  lineNo: number;
  product: { id: string; sku: string; name: string; baseUnitCode: string } | null;
  description: string;
  quantity: string;
  unitPrice: string;
  discountPct: string;
  taxRateId: string | null;
  /** Tax % copied at bill time */
  taxRate: string;
  /** Net of the line discount and of its share of the bill discount, before tax */
  lineSubtotal: string;
  lineTax: string;
  lineTotal: string;
  /** The received line this bill line pays for */
  receiptLine: {
    id: string;
    receipt: { id: string; number: string };
    purchaseOrder: { id: string; number: string } | null;
    unit: { id: string; code: string };
    /** Received (posted) quantity, in the receipt line's unit */
    receivedQty: string;
    /** Already billed on other posted bills */
    billedElsewhere: string;
    /** Price entered on the receipt (before VAT), to compare */
    receiptPrice: string;
  } | null;
}

export interface BillPaymentRef {
  paymentId: string;
  number: string;
  paidAt: string;
  method: PaymentMethodCode;
  amount: string;
}

/** A difference between the bill and the order / receipt (shown, not blocking). */
export interface BillWarning {
  lineNo: number;
  kind: 'price' | 'quantity';
  /** What the bill says (net unit price, or quantity) */
  billed: string;
  /** What the receipt says (its price, or the quantity left to bill) */
  expected: string;
  receiptNumber: string;
  /** English sentence (logs, API clients); the web app builds its own from the fields */
  message: string;
}

export interface BillDetail extends BillListItem {
  discountType: DiscountTypeCode | null;
  discountValue: string;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  notes: string | null;
  postedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdBy: { id: string; fullName: string };
  createdAt: string;
  updatedAt: string;
  lines: BillLineDto[];
  payments: BillPaymentRef[];
  warnings: BillWarning[];
  /** Receipts the lines come from */
  receipts: { id: string; number: string; receivedAt: string }[];
}

export interface BillLineInput {
  /** Bill a received line (its product is taken from it) */
  goodsReceiptLineId?: string | null;
  /** Free lines: a product, or nothing for a service / fee */
  productId?: string | null;
  description: string;
  quantity: string;
  unitPrice: string;
  /** 0–100, default 0 */
  discountPct?: string;
  /** null = no VAT */
  taxRateId?: string | null;
}

/** Body of POST /invoicing/bills (a draft). PATCH (drafts only) takes the same fields. */
export interface BillInput {
  supplierId: string;
  supplierRef?: string | null;
  /** YYYY-MM-DD, default today */
  issueDate?: string;
  /** YYYY-MM-DD; default issue date + the supplier's payment terms */
  dueDate?: string | null;
  currency: CurrencyCode;
  discountType?: DiscountTypeCode | null;
  discountValue?: string;
  notes?: string | null;
  lines: BillLineInput[];
}

/** One received line that is not (fully) billed yet: GET /invoicing/bills/billable */
export interface BillableReceiptLine {
  goodsReceiptLineId: string;
  receipt: { id: string; number: string; receivedAt: string };
  purchaseOrder: { id: string; number: string } | null;
  product: { id: string; sku: string; name: string };
  unit: { id: string; code: string };
  receivedQty: string;
  billedQty: string;
  /** receivedQty − billedQty */
  toBill: string;
  /** Price entered on the receipt, before VAT */
  unitPrice: string;
  /** VAT % of the product (0 when it has none) */
  taxRate: string;
}

export interface BillableReceipt {
  id: string;
  number: string;
  receivedAt: string;
  purchaseOrder: { id: string; number: string } | null;
  /** Supplier invoice recorded on the receipt, if any (suggested as supplier ref) */
  supplierInvoiceNumber: string | null;
  supplierInvoiceDate: string | null;
  lines: BillableReceiptLine[];
}

/** Amounts per currency (bills are never summed across currencies). */
export type CurrencyAmounts = Partial<Record<CurrencyCode, string>>;

export interface BillSummary {
  drafts: number;
  /** Posted or partly paid */
  open: number;
  openBalance: CurrencyAmounts;
  overdue: number;
  overdueBalance: CurrencyAmounts;
  /** Paid out this month, per currency */
  paidThisMonth: CurrencyAmounts;
  /** Balance due per age bucket (days past the due date), per currency */
  aging: { bucket: AgingBucket; balance: CurrencyAmounts; count: number }[];
}

export const AGING_BUCKETS = ['current', '1-30', '31-60', '61-90', '90+'] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];

/** GET /invoicing/bills/lookups */
export interface BillLookups {
  companyCurrency: CurrencyCode;
  taxRates: { id: string; name: string; rate: string }[];
}

// ── Payments ─────────────────────────────────────────────────────────────────

export const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'OTHER'] as const;
export type PaymentMethodCode = (typeof PAYMENT_METHODS)[number];

export interface PaymentListItem {
  id: string;
  number: string;
  direction: 'IN' | 'OUT';
  method: PaymentMethodCode;
  amount: string;
  currency: CurrencyCode;
  /** YYYY-MM-DD */
  paidAt: string;
  supplier: { id: string; code: string; name: string } | null;
  reference: string | null;
  allocations: { invoiceId: string; number: string; amount: string }[];
  createdBy: { id: string; fullName: string };
}

export interface PaymentDetail extends PaymentListItem {
  notes: string | null;
  createdAt: string;
}

/** Body of POST /invoicing/payments: money paid to a supplier, split over open bills. */
export interface PaymentInput {
  supplierId: string;
  method: PaymentMethodCode;
  currency: CurrencyCode;
  /** Must equal the sum of the allocations */
  amount: string;
  /** YYYY-MM-DD, default today */
  paidAt?: string;
  reference?: string | null;
  notes?: string | null;
  allocations: { invoiceId: string; amount: string }[];
}
