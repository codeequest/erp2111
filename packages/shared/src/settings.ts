/**
 * Numbering settings shared by the API and the web app.
 *
 * Two kinds of sequences live in the same table (document_sequences):
 *  - master-data codes (PRODUCT): year 0, never reset → "ART-00042"
 *  - business documents (invoices, orders…): one sequence per year → "INV-2026-00042"
 */

export type SequenceType =
  | 'PRODUCT'
  | 'PURCHASE_ORDER'
  | 'GOODS_RECEIPT'
  | 'QUOTATION'
  | 'SALES_ORDER'
  | 'DELIVERY'
  | 'CUSTOMER_RETURN'
  | 'CUSTOMER_INVOICE'
  | 'CUSTOMER_CREDIT_NOTE'
  | 'SUPPLIER_BILL'
  | 'SUPPLIER_CREDIT_NOTE'
  | 'PAYMENT_IN'
  | 'PAYMENT_OUT'
  | 'STOCK_ADJUSTMENT'
  | 'STOCK_TRANSFER';

/** Plain-language names, in the order they are shown on the Settings page. */
export const SEQUENCE_LABELS: Record<SequenceType, string> = {
  PRODUCT: 'Product codes',
  QUOTATION: 'Quotations',
  SALES_ORDER: 'Sales orders',
  DELIVERY: 'Deliveries',
  CUSTOMER_RETURN: 'Customer returns',
  CUSTOMER_INVOICE: 'Customer invoices',
  CUSTOMER_CREDIT_NOTE: 'Customer credit notes',
  PURCHASE_ORDER: 'Purchase orders',
  GOODS_RECEIPT: 'Goods receipts',
  SUPPLIER_BILL: 'Supplier bills',
  SUPPLIER_CREDIT_NOTE: 'Supplier credit notes',
  PAYMENT_IN: 'Payments received',
  PAYMENT_OUT: 'Payments made',
  STOCK_ADJUSTMENT: 'Stock adjustments',
  STOCK_TRANSFER: 'Stock transfers',
};

export interface SequenceSetting {
  id: string;
  type: SequenceType;
  label: string;
  /** 0 for master-data codes that never reset */
  year: number;
  prefix: string;
  padding: number;
  nextNumber: number;
  /** The next value as it will be printed, e.g. "INV-2026-00042" or "ART-00042" */
  nextValue: string;
}

export interface SequenceSettingInput {
  prefix?: string;
  padding?: number;
  nextNumber?: number;
}

/** Prefix rule (same on both sides): letters, digits and . _ - / ; may be empty for product codes. */
export const SEQUENCE_PREFIX = /^[A-Za-z0-9._\-/]{0,20}$/;

/**
 * How a number is printed.
 *  - product codes: prefix + padded number            ("ART-" → ART-00042)
 *  - documents:     prefix-YEAR-padded number          ("INV" → INV-2026-00042)
 */
export function formatSequenceValue(
  seq: { prefix: string; padding: number; year: number },
  n: number,
): string {
  const num = String(n).padStart(seq.padding, '0');
  return seq.year === 0 ? `${seq.prefix}${num}` : `${seq.prefix}-${seq.year}-${num}`;
}

/**
 * Legal documents (invoices, orders…) must never reuse a number, so their counter can
 * only move forward. Product codes may go back: codes already in use are skipped.
 */
export function nextNumberProblem(
  type: SequenceType,
  current: number,
  requested: number,
): string | null {
  if (!Number.isInteger(requested) || requested < 1) return 'Enter a whole number of 1 or more';
  if (type !== 'PRODUCT' && requested < current) {
    return `Documents can't go back: numbers below ${current} may already be used. Use ${current} or higher.`;
  }
  return null;
}
