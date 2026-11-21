import { Prisma } from '@prisma/client';
import { packagingPrice, photoUrl } from './products.service';
import { PHOTO_FILE_PATTERN } from './product-photos.service';

const D = (v: string) => new Prisma.Decimal(v);

describe('packagingPrice', () => {
  it('uses base price × quantity when the packaging has no own price', () => {
    expect(
      packagingPrice({ salePrice: D('1.350') }, { salePrice: null, factor: D('12') }, 3).toFixed(3),
    ).toBe('16.200');
  });

  it('uses the packaging own price when set', () => {
    expect(
      packagingPrice({ salePrice: D('1.350') }, { salePrice: D('15'), factor: D('12') }, 3).toFixed(
        3,
      ),
    ).toBe('15.000');
  });

  it('rounds to the currency decimals', () => {
    expect(
      packagingPrice({ salePrice: D('0.3333') }, { salePrice: null, factor: D('3') }, 3).toFixed(3),
    ).toBe('1.000');
  });
});

describe('product photos', () => {
  it('builds the public URL', () => {
    expect(photoUrl(null)).toBeNull();
    expect(photoUrl('a.png')).toBe('/api/v1/products/photos/a.png');
  });

  it('only accepts generated file names (no path traversal)', () => {
    expect(PHOTO_FILE_PATTERN.test('0123456789abcdef0123456789abcdef.jpg')).toBe(true);
    expect(PHOTO_FILE_PATTERN.test('../../.env')).toBe(false);
    expect(PHOTO_FILE_PATTERN.test('0123456789abcdef0123456789abcdef.svg')).toBe(false);
  });
});
