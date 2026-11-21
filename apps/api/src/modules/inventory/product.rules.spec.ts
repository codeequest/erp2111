import { Prisma } from '@prisma/client';
import type { ProductListItem } from '@erp/shared';
import {
  applyCostVisibility,
  canChangeBaseUnit,
  canChangeTracking,
  categoryWithDescendants,
  dec,
  detectImageType,
  emptyToNull,
  formatProductCode,
  isLowStock,
  nextFreeProductCode,
  wouldCreateCategoryCycle,
} from './product.rules';

describe('formatProductCode', () => {
  it('pads the number to the configured digits', () => {
    expect(formatProductCode('ART-', 5, 42)).toBe('ART-00042');
  });
  it('never truncates a number longer than the padding', () => {
    expect(formatProductCode('A', 2, 1234)).toBe('A1234');
  });
  it('works without a prefix', () => {
    expect(formatProductCode('', 4, 7)).toBe('0007');
  });
});

describe('nextFreeProductCode', () => {
  it('returns the next number when it is free', async () => {
    const r = await nextFreeProductCode('ART-', 5, 3, async () => false);
    expect(r).toEqual({ code: 'ART-00003', number: 3 });
  });
  it('skips codes a user already typed by hand', async () => {
    const taken = new Set(['ART-00003', 'ART-00004']);
    const r = await nextFreeProductCode('ART-', 5, 3, async (c) => taken.has(c));
    expect(r).toEqual({ code: 'ART-00005', number: 5 });
  });
  it('gives up after maxTries instead of looping forever', async () => {
    await expect(nextFreeProductCode('X', 1, 1, async () => true, 5)).rejects.toThrow();
  });
});

describe('canChangeTracking', () => {
  it('allows switching to lot tracking before any stock movement', () => {
    expect(canChangeTracking('NONE', 'LOT', 0)).toBe(true);
  });
  it('refuses switching to serial numbers once stock has moved', () => {
    expect(canChangeTracking('NONE', 'SERIAL', 3)).toBe(false);
  });
});

describe('detectImageType', () => {
  it('recognises JPEG, PNG and WebP by their magic bytes', () => {
    expect(detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0]))?.ext).toBe('jpg');
    expect(
      detectImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))?.ext,
    ).toBe('png');
    expect(detectImageType(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'binary'))?.ext).toBe('webp');
  });
  it('rejects anything else, whatever its name or declared type', () => {
    expect(detectImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(detectImageType(Buffer.from('%PDF-1.7'))).toBeNull();
    expect(detectImageType(Buffer.alloc(0))).toBeNull();
  });
});

const D = (v: string | number) => new Prisma.Decimal(v);

describe('isLowStock', () => {
  it('is false when no minimum is set', () => {
    expect(isLowStock(D(0), D(0))).toBe(false);
  });
  it('is true when on-hand is below the minimum', () => {
    expect(isLowStock(D('4.9999'), D(5))).toBe(true);
  });
  it('is false when on-hand equals the minimum', () => {
    expect(isLowStock(D(5), D(5))).toBe(false);
  });
  it('is always true for negative stock, even without a minimum', () => {
    expect(isLowStock(D(-3), D(0))).toBe(true);
  });
});

describe('dec', () => {
  it('formats with 4 decimals without float drift', () => {
    expect(dec(D('0.1').plus(D('0.2')))).toBe('0.3000');
  });
});

describe('canChangeBaseUnit', () => {
  it('allows keeping the same unit even with history', () => {
    expect(canChangeBaseUnit('pcs', 'pcs', 10)).toBe(true);
  });
  it('allows an update that does not touch the unit', () => {
    expect(canChangeBaseUnit('pcs', undefined, 10)).toBe(true);
  });
  it('allows changing the unit before any stock movement', () => {
    expect(canChangeBaseUnit('pcs', 'kg', 0)).toBe(true);
  });
  it('refuses changing the unit once stock has moved', () => {
    expect(canChangeBaseUnit('pcs', 'kg', 1)).toBe(false);
  });
});

describe('wouldCreateCategoryCycle', () => {
  // Food > Drinks > Sodas
  const parentOf = new Map<string, string | null>([
    ['food', null],
    ['drinks', 'food'],
    ['sodas', 'drinks'],
  ]);

  it('allows moving to the root', () => {
    expect(wouldCreateCategoryCycle('drinks', null, parentOf)).toBe(false);
  });
  it('allows moving under an unrelated branch', () => {
    const map = new Map(parentOf).set('tools', null);
    expect(wouldCreateCategoryCycle('drinks', 'tools', map)).toBe(false);
  });
  it('refuses a category as its own parent', () => {
    expect(wouldCreateCategoryCycle('drinks', 'drinks', parentOf)).toBe(true);
  });
  it('refuses moving a category under its own descendant', () => {
    expect(wouldCreateCategoryCycle('food', 'sodas', parentOf)).toBe(true);
  });
});

describe('categoryWithDescendants', () => {
  const tree = [
    { id: 'bev', parentId: null },
    { id: 'soft', parentId: 'bev' },
    { id: 'cola', parentId: 'soft' },
    { id: 'water', parentId: 'bev' },
    { id: 'food', parentId: null },
  ];
  it('includes children and grandchildren', () => {
    expect(categoryWithDescendants('bev', tree).sort()).toEqual(['bev', 'cola', 'soft', 'water']);
  });
  it('returns just the category when it has no children', () => {
    expect(categoryWithDescendants('food', tree)).toEqual(['food']);
  });
  it('does not loop forever on corrupt (cyclic) data', () => {
    const cyclic = [
      { id: 'a', parentId: 'b' },
      { id: 'b', parentId: 'a' },
    ];
    expect(categoryWithDescendants('a', cyclic).sort()).toEqual(['a', 'b']);
  });
});

describe('applyCostVisibility', () => {
  const product = { id: '1', sku: 'A', averageCost: '3.2000' } as ProductListItem;

  it('keeps the cost for users with inventory.cost.view', () => {
    expect(applyCostVisibility(product, true).averageCost).toBe('3.2000');
  });
  it('removes the cost key entirely for other users', () => {
    expect('averageCost' in applyCostVisibility(product, false)).toBe(false);
  });
});

describe('emptyToNull', () => {
  it('turns blank strings into null and trims others', () => {
    expect(emptyToNull('   ')).toBeNull();
    expect(emptyToNull(' 123 ')).toBe('123');
    expect(emptyToNull(undefined)).toBeUndefined();
  });
});
