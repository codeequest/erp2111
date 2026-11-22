import { buildCategoryTree, categoryWithDescendants } from './category-tree';

const rows = [
  { id: 'oils', name: 'Oils', parentId: 'food', isActive: true },
  { id: 'drinks', name: 'Drinks', parentId: null, isActive: true },
  { id: 'food', name: 'Food', parentId: null, isActive: true, productCount: 2 },
  { id: 'olive', name: 'Olive', parentId: 'oils', isActive: false },
  { id: 'cereal', name: 'cereals', parentId: 'food', isActive: true },
];

describe('buildCategoryTree', () => {
  const tree = buildCategoryTree(rows);

  it('lists parents before children, siblings by name (case-insensitive)', () => {
    expect(tree.map((c) => c.id)).toEqual(['drinks', 'food', 'cereal', 'oils', 'olive']);
  });

  it('adds the full path and depth', () => {
    const olive = tree.find((c) => c.id === 'olive')!;
    expect(olive.path).toBe('Food › Oils › Olive');
    expect(olive.depth).toBe(2);
    expect(tree.find((c) => c.id === 'food')!.productCount).toBe(2);
  });

  it('treats a category whose parent is missing as top level', () => {
    const t = buildCategoryTree([{ id: 'x', name: 'X', parentId: 'gone', isActive: true }]);
    expect(t[0]).toMatchObject({ id: 'x', depth: 0, path: 'X' });
  });

  it('does not loop forever on a cycle', () => {
    const t = buildCategoryTree([
      { id: 'a', name: 'A', parentId: 'b', isActive: true },
      { id: 'b', name: 'B', parentId: 'a', isActive: true },
    ]);
    expect(t).toEqual([]);
  });
});

describe('categoryWithDescendants', () => {
  it('returns the category and everything below it', () => {
    expect(categoryWithDescendants(rows, 'food').sort()).toEqual([
      'cereal',
      'food',
      'oils',
      'olive',
    ]);
  });

  it('returns only the id for a leaf', () => {
    expect(categoryWithDescendants(rows, 'drinks')).toEqual(['drinks']);
  });
});
