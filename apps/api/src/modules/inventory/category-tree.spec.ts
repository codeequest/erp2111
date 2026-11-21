import { descendantIds, wouldCreateCycle } from './category-tree';

//  food ─┬─ drinks ── soda
//        └─ snacks
//  tools
const nodes = [
  { id: 'food', parentId: null },
  { id: 'drinks', parentId: 'food' },
  { id: 'soda', parentId: 'drinks' },
  { id: 'snacks', parentId: 'food' },
  { id: 'tools', parentId: null },
];

describe('descendantIds', () => {
  it('returns the category itself and every level below it', () => {
    expect(descendantIds(nodes, 'food').sort()).toEqual(['drinks', 'food', 'snacks', 'soda']);
  });

  it('returns only the category for a leaf', () => {
    expect(descendantIds(nodes, 'soda')).toEqual(['soda']);
  });

  it('survives corrupted data that already contains a loop', () => {
    const looped = [
      { id: 'a', parentId: 'b' },
      { id: 'b', parentId: 'a' },
    ];
    expect(descendantIds(looped, 'a').sort()).toEqual(['a', 'b']);
  });
});

describe('wouldCreateCycle', () => {
  it('allows moving to the root', () => {
    expect(wouldCreateCycle(nodes, 'drinks', null)).toBe(false);
  });

  it('allows moving under an unrelated branch', () => {
    expect(wouldCreateCycle(nodes, 'drinks', 'tools')).toBe(false);
  });

  it('rejects a category as its own parent', () => {
    expect(wouldCreateCycle(nodes, 'food', 'food')).toBe(true);
  });

  it('rejects moving a category under one of its descendants', () => {
    expect(wouldCreateCycle(nodes, 'food', 'soda')).toBe(true);
  });
});
