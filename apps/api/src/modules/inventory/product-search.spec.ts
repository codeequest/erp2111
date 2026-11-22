import { stockStatusOf } from '@erp/shared';
import { likePattern, orderBy, searchTerms } from './product-search';

describe('product search helpers', () => {
  it('splits the search text into words', () => {
    expect(searchTerms('  coca   cola 1.5L ')).toEqual(['coca', 'cola', '1.5L']);
    expect(searchTerms('"lait" demi')).toEqual(['lait', 'demi']);
    expect(searchTerms(undefined)).toEqual([]);
    expect(searchTerms('a b c d e f g h i j')).toHaveLength(8);
  });

  it('escapes LIKE wildcards', () => {
    expect(likePattern('50%')).toBe('%50\\%%');
    expect(likePattern('a_b')).toBe('%a\\_b%');
    expect(likePattern('cafe')).toBe('%cafe%');
  });

  it('builds an ORDER BY for every sort and passes the text as a parameter', () => {
    expect(orderBy('price', 'desc', undefined).sql).toContain('p.sale_price DESC');
    expect(orderBy('relevance', 'asc', undefined).sql).toContain('p.name ASC');
    const rel = orderBy('relevance', 'asc', "x'; DROP TABLE products;--");
    expect(rel.sql).not.toContain('DROP TABLE');
    expect(rel.values).toContain("x'; DROP TABLE products;--");
  });

  it('classifies stock levels', () => {
    expect(stockStatusOf(0, 5)).toBe('out');
    expect(stockStatusOf(-2, 5)).toBe('out');
    expect(stockStatusOf(5, 5)).toBe('low');
    expect(stockStatusOf(6, 5)).toBe('in_stock');
    expect(stockStatusOf(1, 0)).toBe('in_stock');
  });
});
