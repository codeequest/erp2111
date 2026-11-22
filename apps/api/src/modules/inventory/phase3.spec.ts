import { diff } from './product-history.service';
import { normalisePath } from './product-transfer.service';
import { sniffImageType } from './product-bulk.service';

describe('history diff', () => {
  const names = new Map([
    ['cat-1', 'Oils'],
    ['unit-ctn', 'CTN'],
  ]);

  it('lists only changed fields, with ids shown as names', () => {
    const changes = diff(
      { salePrice: '12.5', categoryId: null, name: 'Oil' },
      { salePrice: '13.9', categoryId: 'cat-1', name: 'Oil' },
      names,
    );
    expect(changes).toEqual([
      { field: 'salePrice', from: '12.5', to: '13.9' },
      { field: 'categoryId', from: null, to: 'Oils' },
    ]);
  });

  it('describes creation as every field going from empty', () => {
    expect(diff(null, { sku: 'A', isActive: true }, names)).toEqual([
      { field: 'sku', from: null, to: 'A' },
      { field: 'isActive', from: null, to: 'yes' },
    ]);
  });

  it('summarises pack sizes', () => {
    const changes = diff(
      { packUnits: [] },
      { packUnits: [{ unitId: 'unit-ctn', factor: '12', barcode: null }] },
      names,
    );
    expect(changes).toEqual([{ field: 'packUnits', from: null, to: 'CTN × 12' }]);
  });
});

describe('normalisePath', () => {
  it('matches the same category whatever separator or case is used', () => {
    const target = normalisePath('Food › Oils');
    expect(normalisePath('food > oils')).toBe(target);
    expect(normalisePath(' Food/Oils ')).toBe(target);
    expect(normalisePath('Food')).not.toBe(target);
  });
});

describe('sniffImageType', () => {
  it('recognises JPEG, PNG and WebP by their first bytes', () => {
    expect(sniffImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpg');
    expect(sniffImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe(
      'png',
    );
    expect(sniffImageType(Buffer.from('RIFF\0\0\0\0WEBPVP8 '))).toBe('webp');
  });

  it('rejects anything else, whatever its name or mimetype', () => {
    expect(sniffImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(sniffImageType(Buffer.from('GIF89a'))).toBeNull();
    expect(sniffImageType(Buffer.alloc(0))).toBeNull();
  });
});
