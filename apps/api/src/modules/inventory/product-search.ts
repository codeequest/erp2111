import { Prisma } from '@prisma/client';
import type { ProductSort, SortOrder } from '@erp/shared';

/** Splits the search box into words; quotes and extra spaces are ignored. */
export function searchTerms(q: string | undefined): string[] {
  if (!q) return [];
  return q
    .replace(/["']/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 8);
}

/** Escapes LIKE wildcards so "50%" searches for the text "50%". */
export function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * ORDER BY for the search query (columns of the `p` CTE).
 * "relevance" puts exact SKU / barcode hits first, then names starting with the text.
 */
export function orderBy(sort: ProductSort, order: SortOrder, q: string | undefined): Prisma.Sql {
  const dir = order === 'desc' ? Prisma.sql`DESC` : Prisma.sql`ASC`;
  switch (sort) {
    case 'name':
      return Prisma.sql`p.name ${dir}, p.sku`;
    case 'sku':
      return Prisma.sql`p.sku ${dir}`;
    case 'price':
      return Prisma.sql`p.sale_price ${dir}, p.name`;
    case 'stock':
      return Prisma.sql`p.stock ${dir}, p.name`;
    case 'updated':
      return Prisma.sql`p.updated_at ${dir}, p.name`;
    case 'relevance':
    default: {
      const text = (q ?? '').trim();
      if (!text) return Prisma.sql`p.name ASC, p.sku`;
      const prefix = likePattern(text).slice(1); // "text%"
      const wordStart = `% ${prefix}`; // a word of the name starts with the text
      const afterDash = `%-${prefix}`; // e.g. "Coca-Cola" for "cola"
      return Prisma.sql`
        CASE
          WHEN lower(p.sku) = lower(${text}) OR p.barcode = ${text} THEN 0
          WHEN p.name ILIKE ${prefix} THEN 1
          WHEN p.name ILIKE ${wordStart} OR p.name ILIKE ${afterDash} THEN 2
          WHEN p.sku ILIKE ${prefix} THEN 3
          ELSE 4
        END, p.name ASC, p.sku`;
    }
  }
}
