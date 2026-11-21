export interface TreeNode {
  id: string;
  parentId: string | null;
}

/** The category and all categories below it, at any depth. */
export function descendantIds(nodes: TreeNode[], rootId: string): string[] {
  const children = new Map<string, string[]>();
  for (const n of nodes) {
    if (!n.parentId) continue;
    children.set(n.parentId, [...(children.get(n.parentId) ?? []), n.id]);
  }
  const seen = new Set<string>();
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(children.get(id) ?? []));
  }
  return [...seen];
}

/** True when giving `id` the parent `newParentId` would make the tree loop. */
export function wouldCreateCycle(
  nodes: TreeNode[],
  id: string,
  newParentId: string | null,
): boolean {
  if (!newParentId) return false;
  return descendantIds(nodes, id).includes(newParentId);
}
