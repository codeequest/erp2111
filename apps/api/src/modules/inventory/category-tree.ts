import type { CategoryNode } from '@erp/shared';

export type FlatCategory = Omit<CategoryNode, 'children'>;

/** Builds the tree from a flat list. Siblings are sorted by name. Orphans become roots. */
export function buildCategoryTree(flat: FlatCategory[]): CategoryNode[] {
  const nodes = new Map<string, CategoryNode>();
  for (const c of flat) nodes.set(c.id, { ...c, children: [] });

  const roots: CategoryNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    (parent ? parent.children : roots).push(node);
  }

  const sort = (list: CategoryNode[]) => {
    list.sort((a, b) => a.name.localeCompare(b.name));
    list.forEach((n) => sort(n.children));
  };
  sort(roots);
  return roots;
}

/** `categoryId` and the ids of all its sub-categories, at any depth. */
export function selfAndDescendants(
  flat: Pick<FlatCategory, 'id' | 'parentId'>[],
  categoryId: string,
): string[] {
  const childrenOf = new Map<string, string[]>();
  for (const c of flat) {
    if (c.parentId) childrenOf.set(c.parentId, [...(childrenOf.get(c.parentId) ?? []), c.id]);
  }
  const result: string[] = [];
  const stack = [categoryId];
  while (stack.length) {
    const id = stack.pop()!;
    if (result.includes(id)) continue;
    result.push(id);
    stack.push(...(childrenOf.get(id) ?? []));
  }
  return result;
}

/**
 * True if `candidateParentId` is `categoryId` itself or one of its descendants,
 * i.e. moving `categoryId` under it would create a loop.
 */
export function wouldCreateCycle(
  flat: Pick<FlatCategory, 'id' | 'parentId'>[],
  categoryId: string,
  candidateParentId: string,
): boolean {
  const parentOf = new Map(flat.map((c) => [c.id, c.parentId]));
  let current: string | null | undefined = candidateParentId;
  const seen = new Set<string>();
  while (current) {
    if (current === categoryId) return true;
    if (seen.has(current)) return true; // existing data already has a loop: refuse
    seen.add(current);
    current = parentOf.get(current);
  }
  return false;
}
