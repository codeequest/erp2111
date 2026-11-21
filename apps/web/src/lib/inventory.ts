import type { CategoryNode, StockMoveTypeCode } from '@erp/shared';

export interface FlatCategoryRow {
  node: CategoryNode;
  depth: number;
}

/** Depth-first list of every category, for pickers and filters. */
export function flattenCategories(
  nodes: CategoryNode[],
  depth = 0,
  out: FlatCategoryRow[] = [],
): FlatCategoryRow[] {
  for (const node of nodes) {
    out.push({ node, depth });
    flattenCategories(node.children, depth + 1, out);
  }
  return out;
}

/** Indented label for a <select> option: "   └ Soft drinks". */
export function categoryOptionLabel({ node, depth }: FlatCategoryRow): string {
  return `${'   '.repeat(depth)}${depth > 0 ? '└ ' : ''}${node.name}${
    node.isActive ? '' : ' (inactive)'
  }`;
}

/** Same rule as the API: non-negative, at most 4 decimals. */
export const DECIMAL_4 = /^\d{1,14}(\.\d{1,4})?$/;

/**
 * Formats a decimal string from the API for DISPLAY only (never for maths).
 * "1.3" → "1.30", "24" → "24".
 */
export function formatDecimal(value: string | undefined, minDigits = 0, maxDigits = 4): string {
  if (value === undefined) return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return n.toLocaleString(undefined, {
    minimumFractionDigits: minDigits,
    maximumFractionDigits: maxDigits,
  });
}

/** Display-only check used to flag low stock in lists. */
export function isBelow(value: string | undefined, threshold: string): boolean {
  if (value === undefined) return false;
  return Number(threshold) > 0 && Number(value) < Number(threshold);
}

/** Label and colour of each stock movement type (ledger badges and filters). */
export const MOVE_TYPES: Record<StockMoveTypeCode, { label: string; className: string }> = {
  OPENING: { label: 'Opening', className: 'bg-sky-50 text-sky-700 ring-sky-200' },
  RECEIPT: { label: 'Receipt', className: 'bg-amber-50 text-amber-700 ring-amber-200' },
  DELIVERY: { label: 'Delivery', className: 'bg-blue-50 text-blue-700 ring-blue-200' },
  ADJUSTMENT: { label: 'Adjustment', className: 'bg-violet-50 text-violet-700 ring-violet-200' },
  TRANSFER_IN: {
    label: 'Transfer in',
    className: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  },
  TRANSFER_OUT: { label: 'Transfer out', className: 'bg-teal-50 text-teal-700 ring-teal-200' },
  CUSTOMER_RETURN: { label: 'Return', className: 'bg-rose-50 text-rose-700 ring-rose-200' },
};

/** "2026-11-21T16:15:13Z" → "21 Nov 2026, 17:15" in the viewer's locale. */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Display-only sign of a decimal string. */
export const isNegative = (v: string) => v.trim().startsWith('-');
