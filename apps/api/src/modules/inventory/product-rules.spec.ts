import 'reflect-metadata';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateProductDto } from './dto/product.dto';
import { looksLikeImage } from './inventory.service';
import {
  CategoryNode,
  categoryPath,
  descendantIds,
  marginPercent,
  priceInclTax,
  stockStatus,
  wouldCreateCycle,
} from './product-rules';

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

describe('stockStatus', () => {
  it('is "out" with nothing on hand', () => {
    expect(stockStatus(D(0), D(5))).toBe('out');
    expect(stockStatus(D(-2), D(0))).toBe('out');
  });
  it('is "low" at or under the minimum', () => {
    expect(stockStatus(D(5), D(5))).toBe('low');
    expect(stockStatus(D(1.5), D(5))).toBe('low');
  });
  it('is "ok" above the minimum or when no minimum is set', () => {
    expect(stockStatus(D(6), D(5))).toBe('ok');
    expect(stockStatus(D(1), D(0))).toBe('ok');
  });
});

describe('prices', () => {
  it('adds VAT and keeps 4 decimals', () => {
    expect(priceInclTax(D('10'), D('19')).toString()).toBe('11.9');
    expect(priceInclTax(D('3.3333'), D('7')).toString()).toBe('3.5666');
  });
  it('leaves the price unchanged without a VAT rate', () => {
    expect(priceInclTax(D('10'), null).toString()).toBe('10');
  });
  it('computes the margin on the selling price', () => {
    expect(marginPercent(D(10), D(7.5))?.toString()).toBe('25');
    expect(marginPercent(D(0), D(5))).toBeNull();
    expect(marginPercent(D(10), D(0))).toBeNull();
  });
});

describe('category tree', () => {
  const nodes: CategoryNode[] = [
    { id: 'food', name: 'Food', parentId: null },
    { id: 'drinks', name: 'Drinks', parentId: 'food' },
    { id: 'juice', name: 'Juices', parentId: 'drinks' },
    { id: 'tools', name: 'Tools', parentId: null },
  ];
  const byId = new Map(nodes.map((n) => [n.id, n]));

  it('builds the full path', () => {
    expect(categoryPath('juice', byId)).toBe('Food › Drinks › Juices');
  });
  it('detects moves that would create a loop', () => {
    expect(wouldCreateCycle('food', 'juice', byId)).toBe(true);
    expect(wouldCreateCycle('food', 'food', byId)).toBe(true);
    expect(wouldCreateCycle('juice', 'tools', byId)).toBe(false);
    expect(wouldCreateCycle('drinks', null, byId)).toBe(false);
  });
  it('lists a category with all its descendants', () => {
    expect(descendantIds('food', nodes).sort()).toEqual(['drinks', 'food', 'juice']);
    expect(descendantIds('tools', nodes)).toEqual(['tools']);
  });
});

describe('CreateProductDto validation', () => {
  const errorsFor = (body: object) =>
    validateSync(plainToInstance(CreateProductDto, body)).map((e) => e.property);

  it('accepts a minimal product and normalises the SKU', () => {
    const dto = plainToInstance(CreateProductDto, { name: ' Tea ', sku: ' tea-01 ' });
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.sku).toBe('TEA-01');
    expect(dto.name).toBe('Tea');
  });
  it('turns empty optional text into null', () => {
    const dto = plainToInstance(CreateProductDto, { name: 'Tea', sku: 'T1', barcode: '  ' });
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.barcode).toBeNull();
  });
  it('rejects negative prices and bad SKUs', () => {
    expect(errorsFor({ name: 'Tea', sku: 'T1', salePrice: -1 })).toContain('salePrice');
    expect(errorsFor({ name: 'Tea', sku: 'has space' })).toContain('sku');
    expect(errorsFor({ name: '', sku: 'T1' })).toContain('name');
  });
});

describe('looksLikeImage', () => {
  it('recognises a PNG signature', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    expect(looksLikeImage(png, 'png')).toBe(true);
  });
  it('rejects a text file renamed as an image', () => {
    expect(looksLikeImage(Buffer.from('hello world, not an image'), 'jpg')).toBe(false);
  });
});
