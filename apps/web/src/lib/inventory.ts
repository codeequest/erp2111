import type { CategoryNode } from '@erp/shared';

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
