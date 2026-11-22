import type { CategoryNode } from '@erp/shared';

export interface CategoryRow {
  id: string;
  name: string;
  parentId: string | null;
  isActive: boolean;
  productCount?: number;
}

const SEPARATOR = ' › ';

/**
 * Orders categories as a tree (each parent followed by its children, siblings
 * sorted by name) and adds the full path and depth to each one.
 */
export function buildCategoryTree(rows: CategoryRow[]): CategoryNode[] {
  const children = new Map<string | null, CategoryRow[]>();
  const ids = new Set(rows.map((r) => r.id));
  for (const r of rows) {
    // A parent that is missing from the input is treated as top level.
    const key = r.parentId && ids.has(r.parentId) ? r.parentId : null;
    const list = children.get(key) ?? [];
    list.push(r);
    children.set(key, list);
  }
  for (const list of children.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }

  const out: CategoryNode[] = [];
  const seen = new Set<string>();
  const walk = (parentId: string | null, parentPath: string, depth: number) => {
    for (const r of children.get(parentId) ?? []) {
      if (seen.has(r.id)) continue; // defensive: never loop on bad data
      seen.add(r.id);
      const path = parentPath ? `${parentPath}${SEPARATOR}${r.name}` : r.name;
      out.push({
        id: r.id,
        name: r.name,
        parentId: r.parentId,
        path,
        depth,
        isActive: r.isActive,
        productCount: r.productCount ?? 0,
      });
      walk(r.id, path, depth + 1);
    }
  };
  walk(null, '', 0);
  return out;
}

/** The id itself plus the ids of every category below it. */
export function categoryWithDescendants(
  rows: Pick<CategoryRow, 'id' | 'parentId'>[],
  rootId: string,
): string[] {
  const byParent = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.parentId) continue;
    const list = byParent.get(r.parentId) ?? [];
    list.push(r.id);
    byParent.set(r.parentId, list);
  }
  const result: string[] = [];
  const stack = [rootId];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
    stack.push(...(byParent.get(id) ?? []));
  }
  return result;
}
