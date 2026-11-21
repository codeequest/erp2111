import {
  buildCategoryTree,
  FlatCategory,
  selfAndDescendants,
  wouldCreateCycle,
} from './category-tree';

const cat = (id: string, name: string, parentId: string | null = null): FlatCategory => ({
  id,
  name,
  parentId,
  isActive: true,
  productCount: 0,
});

//  Food ─┬─ Snacks
//        └─ Drinks ── Juices
//  Cleaning
const FLAT = [
  cat('juices', 'Juices', 'drinks'),
  cat('food', 'Food'),
  cat('snacks', 'Snacks', 'food'),
  cat('cleaning', 'Cleaning'),
  cat('drinks', 'Drinks', 'food'),
];

describe('buildCategoryTree', () => {
  it('nests children under their parent, sorted by name', () => {
    const tree = buildCategoryTree(FLAT);
    expect(tree.map((n) => n.name)).toEqual(['Cleaning', 'Food']);
    const food = tree[1];
    expect(food.children.map((n) => n.name)).toEqual(['Drinks', 'Snacks']);
    expect(food.children[0].children.map((n) => n.name)).toEqual(['Juices']);
  });

  it('treats a category whose parent is missing as a root', () => {
    const tree = buildCategoryTree([cat('x', 'Orphan', 'missing')]);
    expect(tree.map((n) => n.id)).toEqual(['x']);
  });
});

describe('selfAndDescendants', () => {
  it('returns the category and its whole sub-tree', () => {
    expect(selfAndDescendants(FLAT, 'food').sort()).toEqual(['drinks', 'food', 'juices', 'snacks']);
  });

  it('returns only itself for a leaf', () => {
    expect(selfAndDescendants(FLAT, 'juices')).toEqual(['juices']);
  });
});

describe('wouldCreateCycle', () => {
  it('refuses a category as its own parent', () => {
    expect(wouldCreateCycle(FLAT, 'food', 'food')).toBe(true);
  });

  it('refuses moving a category under one of its descendants', () => {
    expect(wouldCreateCycle(FLAT, 'food', 'juices')).toBe(true);
  });

  it('allows moving under an unrelated branch', () => {
    expect(wouldCreateCycle(FLAT, 'drinks', 'cleaning')).toBe(false);
    expect(wouldCreateCycle(FLAT, 'snacks', 'drinks')).toBe(false);
  });
});
