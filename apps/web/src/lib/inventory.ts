import type {
  CategoryInput,
  CategoryNode,
  CategoryUpdate,
  Product,
  ProductFormOptions,
  ProductInput,
  ProductListQuery,
  ProductListResponse,
} from '@erp/shared';
import { api } from './api';

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const productsApi = {
  list(query: ProductListQuery) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== '' && v !== false) params.set(k, String(v));
    }
    return api<ProductListResponse>(`/inventory/products?${params}`);
  },
  get: (id: string) => api<Product>(`/inventory/products/${id}`),
  options: () => api<ProductFormOptions>('/inventory/products/form-options'),
  create: (input: ProductInput) => api<Product>('/inventory/products', json('POST', input)),
  update: (id: string, input: Partial<ProductInput>) =>
    api<Product>(`/inventory/products/${id}`, json('PATCH', input)),
  archive: (id: string) => api<Product>(`/inventory/products/${id}/deactivate`, json('POST')),
  restore: (id: string) => api<Product>(`/inventory/products/${id}/activate`, json('POST')),
};

export const categoriesApi = {
  list: () => api<CategoryNode[]>('/inventory/categories'),
  create: (input: CategoryInput) => api<CategoryNode>('/inventory/categories', json('POST', input)),
  update: (id: string, input: CategoryUpdate) =>
    api<CategoryNode>(`/inventory/categories/${id}`, json('PATCH', input)),
};

export interface TreeRow extends CategoryNode {
  depth: number;
  /** "Beverages › Soft drinks" */
  path: string;
  childCount: number;
}

/** Depth-first ordered rows of the category tree, for indented lists and selects. */
export function flattenTree(nodes: CategoryNode[]): TreeRow[] {
  const byParent = new Map<string | null, CategoryNode[]>();
  const ids = new Set(nodes.map((n) => n.id));
  for (const n of nodes) {
    // orphans (parent missing) are shown at the top level
    const key = n.parentId && ids.has(n.parentId) ? n.parentId : null;
    byParent.set(key, [...(byParent.get(key) ?? []), n]);
  }
  const rows: TreeRow[] = [];
  const seen = new Set<string>();
  const walk = (parentId: string | null, depth: number, prefix: string) => {
    const children = (byParent.get(parentId) ?? []).sort((a, b) => a.name.localeCompare(b.name));
    for (const c of children) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      const path = prefix ? `${prefix} › ${c.name}` : c.name;
      rows.push({ ...c, depth, path, childCount: byParent.get(c.id)?.length ?? 0 });
      walk(c.id, depth + 1, path);
    }
  };
  walk(null, 0, '');
  return rows;
}

/** The ids of a category and everything below it. */
export function subtreeIds(rows: TreeRow[], id: string): Set<string> {
  const out = new Set<string>([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const r of rows) {
      if (r.parentId && out.has(r.parentId) && !out.has(r.id)) {
        out.add(r.id);
        changed = true;
      }
    }
  }
  return out;
}
