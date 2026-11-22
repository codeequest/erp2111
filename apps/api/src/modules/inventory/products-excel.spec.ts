import ExcelJS from 'exceljs';
import { Prisma } from '@prisma/client';
import { PermissionCode } from '@erp/shared';
import { RequestUser } from '../../common/types/request-user';
import { PrismaService } from '../../prisma/prisma.service';
import { cellText, mapHeaders, parseAmount, parseRows } from './products-excel';
import { ProductsExcelService } from './products-excel.service';

const D = (v: number | string) => new Prisma.Decimal(v);

const user = (...perms: PermissionCode[]): RequestUser => ({
  id: 'user-1',
  email: 'a@b.c',
  fullName: 'A',
  roles: [],
  permissions: new Set(perms),
});

const HEADERS = ['SKU', 'Name', 'Unit', 'Sale price', 'Barcode', 'Category'];
const rows = (...cells: string[][]) => cells.map((c, i) => ({ row: i + 2, cells: c }));

describe('products excel parsing', () => {
  it('maps headers case-insensitively and ignores unknown columns', () => {
    expect(mapHeaders(['sku', ' NAME ', 'On hand', 'Sale  price'])).toEqual({
      sku: 1,
      name: 2,
      salePrice: 4,
    });
  });

  it('reads numbers written with a decimal comma or spaces', () => {
    expect(parseAmount('12,5')).toBe(12.5);
    expect(parseAmount('1 234.50')).toBe(1234.5);
    expect(parseAmount('abc')).toBeNaN();
  });

  it('extracts text from rich text and formula cells', () => {
    expect(cellText({ richText: [{ text: 'Cof' }, { text: 'fee ' }] })).toBe('Coffee');
    expect(cellText({ formula: 'A1*2', result: 25 } as ExcelJS.CellFormulaValue)).toBe('25');
    expect(cellText(null)).toBe('');
  });

  it('requires a SKU column', () => {
    const res = parseRows(['Name'], rows(['Coffee']));
    expect(res.errors).toEqual([{ row: 1, message: 'Missing required "SKU" column' }]);
  });

  it('skips blank rows and parses values', () => {
    const res = parseRows(
      HEADERS,
      rows(['A1', 'Coffee', 'PCS', '12,5', '', ''], ['', '', '', '', '', '']),
    );
    expect(res.errors).toEqual([]);
    expect(res.rows).toEqual([
      {
        row: 2,
        sku: 'A1',
        name: 'Coffee',
        unit: 'PCS',
        salePrice: 12.5,
        barcode: null,
        category: null,
        description: undefined,
        taxRate: undefined,
        minStock: undefined,
      },
    ]);
  });

  it('reports bad numbers, negative values and duplicates with their row number', () => {
    const res = parseRows(
      HEADERS,
      rows(
        ['A1', 'Coffee', 'PCS', 'abc', '111', ''],
        ['A2', 'Tea', 'PCS', '-1', '111', ''],
        ['A1', 'Sugar', 'PCS', '1.123456', '', ''],
      ),
    );
    expect(res.errors).toEqual([
      { row: 2, message: 'Sale price "abc" is not a number' },
      { row: 3, message: 'Sale price cannot be negative' },
      { row: 3, message: 'Barcode "111" is already used on row 2' },
      { row: 4, message: 'Sale price has more than 4 decimals' },
      { row: 4, message: 'SKU "A1" is already used on row 2' },
    ]);
  });
});

// ── service (Prisma mocked) ───────────────────────────────────────────────────

function existingProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    sku: 'A1',
    barcode: null,
    name: 'Coffee',
    description: null,
    categoryId: null,
    baseUnitId: 'u1',
    taxRateId: null,
    salePrice: D('12.5'),
    averageCost: D('7.25'),
    minStock: D(0),
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
    category: null,
    baseUnit: { id: 'u1', code: 'PCS', name: 'Piece' },
    taxRate: null,
    stockBalances: [{ quantity: D(4) }],
    ...overrides,
  };
}

function makeService(existing: ReturnType<typeof existingProduct>[] = [], moves: string[] = []) {
  const tx = {
    product: {
      create: jest.fn(async ({ data }) => existingProduct({ id: 'new', sku: data.sku })),
      update: jest.fn(async ({ where }) => existing.find((p) => p.id === where.id)),
    },
    auditLog: { create: jest.fn() },
  };
  const prisma = {
    unit: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'u1', code: 'PCS' },
        { id: 'u2', code: 'KG' },
      ]),
    },
    category: { findMany: jest.fn().mockResolvedValue([{ id: 'c1', name: 'Drinks' }]) },
    taxRate: { findMany: jest.fn().mockResolvedValue([{ id: 't1', name: 'VAT 19%' }]) },
    product: {
      findMany: jest.fn(async (args: { where: { sku?: unknown; barcode?: unknown } }) =>
        args.where.sku ? existing : [],
      ),
    },
    stockMove: { groupBy: jest.fn().mockResolvedValue(moves.map((productId) => ({ productId }))) },
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  return { service: new ProductsExcelService(prisma as unknown as PrismaService), prisma, tx };
}

async function workbook(...data: unknown[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Products');
  data.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('ProductsExcelService.import', () => {
  it('creates new SKUs and updates existing ones, with an audit row each', async () => {
    const { service, tx } = makeService([existingProduct()]);
    const file = await workbook(
      ['SKU', 'Name', 'Unit', 'Sale price', 'Category'],
      ['A1', 'Coffee', 'PCS', 13, 'drinks'],
      ['B2', 'Tea', 'kg', '4,2', ''],
    );
    const res = await service.import(file, user());
    expect(res).toEqual({ created: 1, updated: 1, unchanged: 0, errors: [] });
    expect(tx.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'p1' },
        data: { salePrice: 13, category: { connect: { id: 'c1' } } },
      }),
    );
    expect(tx.product.create.mock.calls[0][0].data).toMatchObject({
      sku: 'B2',
      salePrice: 4.2,
      baseUnit: { connect: { id: 'u2' } },
    });
    expect(tx.auditLog.create).toHaveBeenCalledTimes(2);
  });

  it('counts identical rows as unchanged', async () => {
    const { service, prisma } = makeService([existingProduct()]);
    const file = await workbook(['SKU', 'Name', 'Sale price'], ['A1', 'Coffee', 12.5]);
    expect(await service.import(file, user())).toEqual({
      created: 0,
      updated: 0,
      unchanged: 1,
      errors: [],
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('imports nothing when one row is invalid', async () => {
    const { service, prisma } = makeService([existingProduct()], ['p1']);
    const file = await workbook(
      ['SKU', 'Name', 'Unit', 'Sale price'],
      ['A1', 'Coffee', 'KG', 12.5],
      ['B2', 'Tea', 'BOX', 3],
      ['C3', '', 'PCS', ''],
    );
    const res = await service.import(file, user());
    expect(res.created + res.updated).toBe(0);
    expect(res.errors).toEqual([
      { row: 2, message: 'The unit cannot be changed once the product has stock movements' },
      { row: 3, message: 'Unknown unit "BOX"' },
      { row: 4, message: 'Name is required for a new product' },
      { row: 4, message: 'Sale price is required for a new product' },
    ]);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('reports format errors and lookup errors together', async () => {
    const { service, prisma } = makeService();
    const file = await workbook(
      ['SKU', 'Name', 'Unit', 'Sale price'],
      ['B2', 'Tea', 'BOX', 3],
      ['C3', 'Sugar', 'PCS', -1],
    );
    const res = await service.import(file, user());
    expect(res.errors).toEqual([
      { row: 2, message: 'Unknown unit "BOX"' },
      { row: 3, message: 'Sale price cannot be negative' },
    ]);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a file that is not an xlsx workbook', async () => {
    const { service } = makeService();
    await expect(service.import(Buffer.from('not excel'), user())).rejects.toThrow(
      'not a valid Excel',
    );
  });
});

describe('ProductsExcelService.export', () => {
  it('writes one row per product and hides the cost without inventory.cost.view', async () => {
    const { service, prisma } = makeService();
    prisma.product.findMany = jest.fn().mockResolvedValue([existingProduct()]);
    const query = { status: 'active', sort: 'name', order: 'asc' } as const;

    const read = async (buf: Buffer) => {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf as unknown as ArrayBuffer);
      const ws = wb.getWorksheet('Products')!;
      return [1, 2].map((n) => (ws.getRow(n).values as unknown[]).slice(1));
    };

    const [header, line] = await read(await service.export(query, user()));
    expect(header).not.toContain('Avg. cost');
    expect(line.slice(0, 2)).toEqual(['A1', 'Coffee']);
    expect(line).toContain(12.5);
    expect(line).toContain(4);

    const [headerWithCost] = await read(await service.export(query, user('inventory.cost.view')));
    expect(headerWithCost).toContain('Avg. cost');
  });
});
