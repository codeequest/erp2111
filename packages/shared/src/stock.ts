/** Types shared by the API and the web app for warehouses and stock. */

export interface WarehouseRow {
  id: string;
  code: string;
  name: string;
  address: string | null;
  isActive: boolean;
  /** Products with stock (on hand not zero) in this warehouse */
  productsInStock: number;
}

export interface WarehouseInput {
  code: string;
  name: string;
  address?: string | null;
}

export interface WarehouseUpdate {
  name?: string;
  address?: string | null;
  isActive?: boolean;
}

// ── Stock documents (adjustments, transfers) ────────────────────────────────

export const STOCK_DOCUMENT_STATUSES = ['DRAFT', 'POSTED', 'CANCELLED'] as const;
export type StockDocumentStatus = (typeof STOCK_DOCUMENT_STATUSES)[number];

/** Most lines accepted on one adjustment or transfer. */
export const MAX_STOCK_DOCUMENT_LINES = 500;

export interface WarehouseRef {
  id: string;
  code: string;
  name: string;
}

export interface StockDocProduct {
  id: string;
  sku: string;
  name: string;
  /** Code of the base unit, e.g. "PCS" */
  unit: string;
}

interface StockDocBase {
  id: string;
  number: string;
  status: StockDocumentStatus;
  date: string;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  postedAt: string | null;
}

export interface AdjustmentListItem extends StockDocBase {
  warehouse: WarehouseRef;
  reason: string;
  lineCount: number;
}

export interface AdjustmentLine {
  id: string;
  product: StockDocProduct;
  /** Signed quantity in base unit: + adds stock, - removes it */
  quantity: string;
  /** Only with inventory.cost.view. null = current average cost */
  unitCost?: string | null;
  notes: string | null;
  /** Current on-hand in the document's warehouse (drafts only) */
  onHand?: string;
}

export interface AdjustmentDetail extends AdjustmentListItem {
  lines: AdjustmentLine[];
}

export interface AdjustmentLineInput {
  productId: string;
  quantity: string;
  unitCost?: string | null;
  notes?: string | null;
}

export interface AdjustmentInput {
  warehouseId: string;
  reason: string;
  notes?: string | null;
  lines: AdjustmentLineInput[];
}

export interface TransferListItem extends StockDocBase {
  fromWarehouse: WarehouseRef;
  toWarehouse: WarehouseRef;
  lineCount: number;
}

export interface TransferLine {
  id: string;
  product: StockDocProduct;
  /** Positive quantity in base unit */
  quantity: string;
  /** Current on-hand in the source warehouse (drafts only) */
  onHand?: string;
}

export interface TransferDetail extends TransferListItem {
  lines: TransferLine[];
}

export interface TransferLineInput {
  productId: string;
  quantity: string;
}

export interface TransferInput {
  fromWarehouseId: string;
  toWarehouseId: string;
  notes?: string | null;
  lines: TransferLineInput[];
}

// ── Stock counts (physical inventory) ───────────────────────────────────────

/** Most products on one count. */
export const MAX_COUNT_LINES = 10_000;
/** Most lines saved in one request while counting. */
export const MAX_COUNT_LINES_PER_SAVE = 1_000;

export interface StockCountListItem extends StockDocBase {
  warehouse: WarehouseRef;
  /** Category the count was limited to, if any */
  category: { id: string; name: string } | null;
  lineCount: number;
  countedCount: number;
}

export interface StockCountLine {
  id: string;
  product: StockDocProduct;
  /** Barcode, to find the line when scanning */
  barcode: string | null;
  /** On hand when the count started */
  expectedQty: string;
  /** What staff counted; null = not counted yet */
  countedQty: string | null;
  /** Drafts: on hand now (stock may move during the count) */
  currentQty?: string;
  /**
   * Drafts: counted - on hand now (what validating would adjust).
   * Posted: the adjustment that was made. null when not counted.
   */
  difference: string | null;
  /** Posted, with inventory.cost.view: difference x cost at posting */
  differenceValue?: string;
}

export interface StockCountDetail extends StockCountListItem {
  lines: StockCountLine[];
  summary: {
    lines: number;
    counted: number;
    /** Counted lines whose difference is not zero */
    withDifference: number;
    /** Lines whose stock moved since the count started (drafts) */
    movedSinceStart: number;
    /** Posted, with inventory.cost.view: total value of the differences */
    differenceValue?: string;
  };
}

export interface StockCountCreateInput {
  warehouseId: string;
  /** Count only this category (and its sub-categories) */
  categoryId?: string | null;
  /** Also list active products that have no stock here (to count found goods) */
  includeZero?: boolean;
  notes?: string | null;
}

export interface StockCountLinesInput {
  /** Lines to change. A product not on the count is added. countedQty null = clear. */
  lines: { productId: string; countedQty: string | null }[];
}

export interface StockCountImportReport {
  /** Rows saved */
  updated: number;
  /** Rows for products that were not on the count and were added */
  added: number;
  /** Rows with an empty counted_qty (left as they were) */
  skipped: number;
  errors: { line: number; sku: string; error: string }[];
}

export const COUNT_CSV_COLUMNS = ['sku', 'counted_qty'] as const;

// ── Stock levels and ledger ─────────────────────────────────────────────────

export const STOCK_LEVEL_SORTS = ['name', 'sku', 'onHand', 'available', 'value'] as const;
export type StockLevelSort = (typeof STOCK_LEVEL_SORTS)[number];

export interface StockLevelRow {
  product: StockDocProduct;
  isActive: boolean;
  /** In the chosen warehouse, or all warehouses */
  onHand: string;
  reserved: string;
  /** onHand - reserved */
  available: string;
  /** Total in all warehouses (used for low stock) */
  totalOnHand: string;
  minStock: string;
  /** Active, has a minimum, and total on hand is below it */
  low: boolean;
  /** Only with inventory.cost.view */
  averageCost?: string;
  /** onHand x average cost; only with inventory.cost.view */
  value?: string;
}

export interface StockLevelsPage {
  items: StockLevelRow[];
  total: number;
  page: number;
  pageSize: number;
  summary: {
    /** Products matching the filters */
    products: number;
    /** Of those, how many are low */
    low: number;
    /** Only with inventory.cost.view */
    value?: string;
  };
}

export const STOCK_MOVE_TYPES = [
  'OPENING',
  'RECEIPT',
  'DELIVERY',
  'ADJUSTMENT',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'CUSTOMER_RETURN',
] as const;
export type StockMoveTypeCode = (typeof STOCK_MOVE_TYPES)[number];

export interface StockMoveRow {
  id: string;
  createdAt: string;
  type: StockMoveTypeCode;
  product: StockDocProduct;
  warehouse: WarehouseRef;
  /** Signed: + in, - out */
  quantity: string;
  /** Stock of this product in this warehouse right after the move */
  balanceAfter: string;
  /** Only with inventory.cost.view */
  unitCost?: string;
  reference: string | null;
  sourceType: string | null;
  sourceId: string | null;
  reason: string | null;
  /** True when this move cancels an earlier one */
  isReversal: boolean;
  createdBy: string;
}

export interface StockConsistency {
  ok: boolean;
  /** Rows where the cached balance differs from the ledger (should never happen) */
  differences: { product: StockDocProduct; warehouse: WarehouseRef; balance: string; ledger: string }[];
  /** Rows where the reserved quantity differs from the open sales orders (should never happen) */
  reservationDifferences: { product: StockDocProduct; warehouse: WarehouseRef; reserved: string; orders: string }[];
}

/** Columns of the opening stock CSV file. `warehouse` and `unit_cost` are optional. */
export const OPENING_CSV_COLUMNS = ['sku', 'warehouse', 'quantity', 'unit_cost'] as const;

export interface OpeningRowResult {
  /** Line number in the file (the header is line 1) */
  line: number;
  sku: string;
  /** Warehouse code */
  warehouse: string;
  quantity: string;
  /** Cost per base unit; only returned to users with inventory.cost.view */
  unitCost?: string;
  /** Why the row is skipped; empty = the row is imported */
  errors: string[];
}

export interface OpeningImportReport {
  /** true when nothing was written (preview) */
  dryRun: boolean;
  totals: { ok: number; error: number };
  /** Sum of quantity x cost of the valid rows; only with inventory.cost.view */
  totalValue?: string;
  /** Ledger reference of the import, e.g. "OPENING-2026-11-27" */
  reference: string;
  rows: OpeningRowResult[];
}
