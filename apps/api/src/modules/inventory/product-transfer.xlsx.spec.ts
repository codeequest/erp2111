import ExcelJS from 'exceljs';
import { Prisma } from '@prisma/client';
import { PRODUCT_CSV_COLUMNS, PermissionCode } from '@erp/shared';
import { RequestUser } from '../../common/types/request-user';
import { PrismaService } from '../../prisma/prisma.service';
import { cellText, isXlsx, readXlsxTable, writeXlsx } from '../../common/xlsx';
import { CatalogService } from './catalog.service';
import { ProductTransferService } from './product-transfer.service';
import { ProductsService } from './products.service';

const D = (v: number | string) => new Prisma.Decimal(v);

const user = (...perms: PermissionCode[]): RequestUser => ({
  id: 'user-1',
  email: 'a@b.c',
  fullName: 'A',
  roles: [],
  permissions: new Set(perms),
});

const coffee = {
  id: 'p1',
  sku: 'CAF-500',
  barcode: '6191234567890',
  name: 'Coffee',
  description: null,
  categoryId: 'c1',
  baseUnitId: 'u1',
  taxRateId: null,
  salePrice: D('13.9'),
  minStock: D(10),
  averageCost: D('8.2'),
  isActive: true,
  baseUnit: { id: 'u1', code: 'PCS' },
  taxRate: null,
};

function makeService() {
  const tx = {
    product: { update: jest.fn(), create: jest.fn(async ({ data }) => ({ id: 'new', ...data })) },
    auditLog: { create: jest.fn() },
  };
  const prisma = {
    product: { findMany: jest.fn().mockResolvedValue([coffee]) },
    productUnit: { findMany: jest.fn().mockResolvedValue([]) },
    unit: { findMany: jest.fn().mockResolvedValue([{ id: 'u1', code: 'PCS' }]) },
    taxRate: { findMany: jest.fn().mockResolvedValue([]) },
    stockMove: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const catalog = {
    listCategories: jest.fn().mockResolvedValue([{ id: 'c1', path: 'Food › Coffee' }]),
  };
  const products = { buildWhere: jest.fn().mockResolvedValue({}) };
  const service = new ProductTransferService(
    prisma as unknown as PrismaService,
    products as unknown as ProductsService,
    catalog as unknown as CatalogService,
  );
  return { service, prisma, tx };
}

async function workbook(...rows: unknown[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Products');
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const query = { status: 'all', sort: 'name', order: 'asc', page: 1, pageSize: 25 } as const;

describe('xlsx helpers', () => {
  it('recognises an xlsx by its ZIP signature', async () => {
    expect(isXlsx(await workbook(['a']))).toBe(true);
    expect(isXlsx(Buffer.from('sku,name\n'))).toBe(false);
  });

  it('reads cells as text and removes float noise', () => {
    expect(cellText(0.1 + 0.2)).toBe('0.3');
    expect(cellText({ richText: [{ text: 'Cof' }, { text: 'fee ' }] })).toBe('Coffee');
    expect(cellText({ formula: 'A1', result: 12.5 } as ExcelJS.CellFormulaValue)).toBe('12.5');
    expect(cellText(null)).toBe('');
  });

  it('round-trips a table and drops trailing empty rows', async () => {
    const buf = await writeXlsx([
      {
        name: 'S',
        rows: [
          ['a', 'b'],
          ['x', 2],
          [null, null],
        ],
      },
    ]);
    expect(await readXlsxTable(buf)).toEqual([
      ['a', 'b'],
      ['x', '2'],
    ]);
  });
});

describe('ProductTransferService Excel', () => {
  it('exports the CSV columns, with numbers as numbers and cost only when allowed', async () => {
    const { service } = makeService();
    const rows = async (u: RequestUser) => {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load((await service.exportXlsx(query, u)) as unknown as ArrayBuffer);
      const ws = wb.getWorksheet('Products')!;
      return [1, 2].map((n) => (ws.getRow(n).values as unknown[]).slice(1));
    };

    const [header, line] = await rows(user());
    expect(header).toEqual([...PRODUCT_CSV_COLUMNS]);
    expect(line).toEqual([
      'CAF-500',
      '6191234567890',
      'Coffee',
      undefined, // empty description
      'Food › Coffee',
      'PCS',
      undefined,
      13.9,
      10,
      'yes',
    ]);
    expect((await rows(user('inventory.cost.view')))[0]).toContain('average_cost');
  });

  it('previews an Excel import with the same rules as the CSV import', async () => {
    const { service, prisma } = makeService();
    const file = await workbook(
      ['SKU', 'Name', 'Base unit', 'Sale price', 'Category'],
      ['CAF-500', 'Coffee', 'PCS', 14.5, 'Food > Coffee'],
      ['NEW-1', 'Tea', 'pcs', '4,20', ''],
      ['NEW-2', 'Sugar', 'BOX', 2, ''],
      ['CAF-500', 'Again', 'PCS', 1, ''],
    );
    const report = await service.importXlsx(file, true, user());

    expect(report.dryRun).toBe(true);
    expect(report.totals).toEqual({ create: 1, update: 1, unchanged: 0, error: 2 });
    expect(report.rows.map((r) => [r.line, r.action, r.errors])).toEqual([
      [2, 'update', []],
      [3, 'create', []],
      [4, 'error', ['unit "BOX" does not exist']],
      [5, 'error', ['sku repeats line 2']],
    ]);
    expect(report.rows[0].changes).toEqual(['salePrice']);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('writes the valid rows when dryRun is false', async () => {
    const { service, tx } = makeService();
    const file = await workbook(
      ['sku', 'name', 'base_unit', 'sale_price'],
      ['NEW-1', 'Tea', 'PCS', 4.2],
    );
    const report = await service.importXlsx(file, false, user());
    expect(report.totals.create).toBe(1);
    expect(tx.product.create.mock.calls[0][0].data).toMatchObject({
      sku: 'NEW-1',
      salePrice: '4.2',
      baseUnitId: 'u1',
    });
  });

  it('rejects a file that is not a workbook', async () => {
    const { service } = makeService();
    await expect(service.importXlsx(Buffer.from('nope'), true, user())).rejects.toThrow(
      'not a valid Excel',
    );
  });
});
