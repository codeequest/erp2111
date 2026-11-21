import { allBarcodes, productUnitProblems } from './product-rules';

describe('productUnitProblems', () => {
  const BASE = 'pcs';

  it('accepts a carton of 24 pieces', () => {
    expect(productUnitProblems(BASE, null, [{ unitId: 'ctn', factor: '24' }])).toEqual([]);
  });

  it('refuses the base unit as an extra unit', () => {
    expect(productUnitProblems(BASE, null, [{ unitId: BASE, factor: '1' }])).toContain(
      'The base unit cannot also be listed as an extra unit',
    );
  });

  it('refuses the same unit twice', () => {
    const units = [
      { unitId: 'ctn', factor: '24' },
      { unitId: 'ctn', factor: '12' },
    ];
    expect(productUnitProblems(BASE, null, units)).toContain('The same unit is listed twice');
  });

  it('refuses a zero factor', () => {
    expect(productUnitProblems(BASE, null, [{ unitId: 'ctn', factor: '0.0000' }])).toContain(
      'A unit factor must be greater than 0',
    );
  });

  it('refuses a barcode shared by the product and one of its units', () => {
    const problems = productUnitProblems(BASE, '123', [
      { unitId: 'ctn', factor: '24', barcode: '123' },
    ]);
    expect(problems).toContain('Barcode "123" is used twice');
  });
});

describe('allBarcodes', () => {
  it('collects the non-empty barcodes', () => {
    expect(allBarcodes('A', [{ barcode: null }, { barcode: 'B' }, {}])).toEqual(['A', 'B']);
  });
});
