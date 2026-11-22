import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PermissionCode } from '@erp/shared';
import type { RequestUser } from '../../../common/types/request-user';
import { ProductImportService } from './product-import.service';

const user = (perms: PermissionCode[]): RequestUser => ({
  id: 'u1',
  email: 'a@b.c',
  fullName: 'Tester',
  roles: [],
  permissions: new Set(perms),
});
const admin = user(['inventory.product.write', 'inventory.cost.view']);
const clerk = user(['inventory.product.write']);

const noUse = {
  stockMoves: 0,
  purchaseOrderLines: 0,
  goodsReceiptLines: 0,
  salesOrderLines: 0,
  deliveryLines: 0,
  customerReturnLines: 0,
  invoiceLines: 0,
};

/** In-memory stand-in for the parts of Prisma the import reads. */
function makeService(opts: { usedSkuExists?: boolean } = {}) {
  const prisma = {
    category: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'c1', name: 'Clothing', parentId: null, isActive: true },
        { id: 'c2', name: 'T-shirts', parentId: 'c1', isActive: true },
        { id: 'c3', name: 'Kids', parentId: 'c2', isActive: true },
        { id: 'c4', name: 'Kids', parentId: 'c1', isActive: true },
      ]),
    },
    unit: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'pcs', code: 'PCS', name: 'Piece' },
        { id: 'kg', code: 'KG', name: 'Kilogram' },
      ]),
    },
    taxRate: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 't19', name: 'VAT 19', rate: new Prisma.Decimal('19.00') }]),
    },
    product: {
      findMany: jest.fn().mockImplementation((args: { where: { barcode?: unknown } }) => {
        if (args.where.barcode) return Promise.resolve([{ id: 'p-old', barcode: '111' }]);
        return Promise.resolve([
          {
            id: 'p-old',
            sku: 'OLD-1',
            name: 'Old',
            baseUnitId: 'pcs',
            type: 'STOCKABLE',
            _count: { ...noUse, stockMoves: opts.usedSkuExists ? 3 : 0 },
          },
        ]);
      }),
    },
    productUnit: {
      findMany: jest.fn().mockResolvedValue([{ productId: 'p-old', barcode: '222' }]),
    },
  };
  return new ProductImportService(prisma as never, {} as never, {} as never);
}

const csv = (s: string) => Buffer.from(s, 'utf-8');

describe('ProductImportService.preview', () => {
  it('accepts a valid file, with French separators and aliases', async () => {
    const svc = makeService();
    const p = await svc.preview(
      csv(
        'sku;name;unit;price;cost;category;vat\nN-1;Shirt;pcs;12,500;7,2;Clothing / T-shirts;19%\n;Service;Piece;5;;;\n',
      ),
      'create',
      admin,
    );
    expect(p.errorRows).toBe(0);
    expect(p.toCreate).toBe(2);
  });

  it('reports every problem on its own line', async () => {
    const svc = makeService();
    const p = await svc.preview(
      csv(
        [
          'sku,name,base_unit,sale_price,barcode,category,type,active',
          'OLD-1,Dup,PCS,1,,,,', // exists already (create mode)
          'A,,PCS,1,,,,', // no name
          'B,Thing,BOX,1,,,,', // unknown unit
          'C,Thing,PCS,-3,,,,', // negative price
          'D,Thing,PCS,1,111,,,', // barcode used by another product
          'E,Thing,PCS,1,,Nowhere,,', // unknown category
          'F,Thing,PCS,1,,Kids,,', // ambiguous category
          'G,Thing,PCS,1,,,car,', // bad type
          'H,Thing,PCS,1,,,,maybe', // bad boolean
          'a,Thing,PCS,1,,,,', // same SKU as line 3, different case
          'I,Thing,,1,,,,', // no unit
        ].join('\n'),
      ),
      'create',
      admin,
    );
    const errs = Object.fromEntries(p.rows.map((r) => [r.line, r.errors.join(' | ')]));
    expect(errs[2]).toMatch(/already exists/);
    expect(errs[3]).toMatch(/Name is required/);
    expect(errs[4]).toMatch(/Unknown unit "BOX"/);
    expect(errs[5]).toMatch(/not a valid positive number/);
    expect(errs[6]).toMatch(/already used by another product/);
    expect(errs[7]).toMatch(/Unknown or inactive category/);
    expect(errs[8]).toMatch(/ambiguous/);
    expect(errs[9]).toMatch(/Unknown type/);
    expect(errs[10]).toMatch(/yes or no/);
    expect(errs[11]).toMatch(/also on line 3/);
    expect(errs[12]).toMatch(/base_unit is required/);
    expect(p.errorRows).toBe(11);
  });

  it('in update mode, empty cells keep the current value and unknown SKUs are errors', async () => {
    const svc = makeService();
    const p = await svc.preview(
      csv('sku,name,sale_price\nOLD-1,,9.5\nNEW-9,X,1\n'),
      'update',
      admin,
    );
    expect(p.rows[0]).toMatchObject({ action: 'update', errors: [] });
    expect(p.rows[1].errors[0]).toMatch(/not found/);
  });

  it('upsert creates new SKUs and updates existing ones', async () => {
    const svc = makeService();
    const p = await svc.preview(
      csv('sku,name,base_unit\nOLD-1,Renamed,\nNEW-1,New,PCS\n'),
      'upsert',
      admin,
    );
    expect(p).toMatchObject({ toCreate: 1, toUpdate: 1, errorRows: 0 });
  });

  it('refuses to change the base unit of a product that has stock movements', async () => {
    const svc = makeService({ usedSkuExists: true });
    const p = await svc.preview(csv('sku,base_unit\nOLD-1,KG\n'), 'update', admin);
    expect(p.rows[0].errors[0]).toMatch(/Base unit cannot change/);
  });

  it('keeps the barcode of the product being updated', async () => {
    const svc = makeService();
    const p = await svc.preview(csv('sku,barcode\nOLD-1,111\n'), 'update', admin);
    expect(p.errorRows).toBe(0);
  });

  it('rejects bad files before looking at rows', async () => {
    const svc = makeService();
    await expect(svc.preview(undefined, 'create', admin)).rejects.toThrow(BadRequestException);
    await expect(svc.preview(csv('sku,name\n'), 'create', admin)).rejects.toThrow(/empty/);
    await expect(svc.preview(csv('sku,name,colour\nA,B,red\n'), 'create', admin)).rejects.toThrow(
      /Unknown column/,
    );
    await expect(svc.preview(csv('sku,name,name\nA,B,C\n'), 'create', admin)).rejects.toThrow(
      /appears twice/,
    );
  });

  it('does not let users without inventory.cost.view import purchase prices', async () => {
    const svc = makeService();
    await expect(
      svc.preview(csv('sku,name,base_unit,purchase_price\nA,B,PCS,5\n'), 'create', clerk),
    ).rejects.toThrow(/inventory.cost.view/);
  });

  it('builds a template without the cost column for users who cannot see cost', () => {
    const svc = makeService();
    expect(svc.template(admin)).toContain('purchase_price');
    expect(svc.template(clerk)).not.toContain('purchase_price');
  });
});
