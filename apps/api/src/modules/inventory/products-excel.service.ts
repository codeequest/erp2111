import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import type { ProductImportResult } from '@erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestUser } from '../../common/types/request-user';
import { ExportProductsQueryDto } from './dto/product.dto';
import { rethrowPrismaError, toAuditJson } from './prisma-errors';
import {
  auditSnapshot,
  canSeeCost,
  productInclude,
  productListWhere,
  toListItem,
} from './products.service';
import { ParsedProductRow, RowError, cellText, parseRows } from './products-excel';

const MONEY_FMT = '#,##0.00##';
const QTY_FMT = '#,##0.####';

type Lookup = { id: string; label: string };

/** Excel (.xlsx) export and import of the product catalogue. */
@Injectable()
export class ProductsExcelService {
  constructor(private readonly prisma: PrismaService) {}

  // ── export ────────────────────────────────────────────────────────────────

  async export(query: ExportProductsQueryDto, user: RequestUser): Promise<Buffer> {
    const rows = await this.prisma.product.findMany({
      where: productListWhere(query),
      include: productInclude,
      orderBy: [{ [query.sort]: query.order }, { id: 'asc' }],
    });
    const canViewCost = canSeeCost(user);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'ERP';
    wb.created = new Date();
    const ws = wb.addWorksheet('Products', { views: [{ state: 'frozen', ySplit: 1 }] });

    ws.columns = [
      { header: 'SKU', key: 'sku', width: 16 },
      { header: 'Name', key: 'name', width: 36 },
      { header: 'Barcode', key: 'barcode', width: 18 },
      { header: 'Description', key: 'description', width: 40 },
      { header: 'Category', key: 'category', width: 20 },
      { header: 'Unit', key: 'unit', width: 8 },
      { header: 'Tax rate', key: 'taxRate', width: 14 },
      { header: 'Sale price', key: 'salePrice', width: 14, style: { numFmt: MONEY_FMT } },
      { header: 'Min stock', key: 'minStock', width: 12, style: { numFmt: QTY_FMT } },
      ...(canViewCost
        ? [{ header: 'Avg. cost', key: 'averageCost', width: 14, style: { numFmt: MONEY_FMT } }]
        : []),
      { header: 'On hand', key: 'onHand', width: 12, style: { numFmt: QTY_FMT } },
      { header: 'Status', key: 'status', width: 10 },
    ];

    for (const r of rows) {
      const item = toListItem(r, canViewCost);
      ws.addRow({
        sku: r.sku,
        name: r.name,
        barcode: r.barcode ?? '',
        description: r.description ?? '',
        category: r.category?.name ?? '',
        unit: r.baseUnit.code,
        taxRate: r.taxRate?.name ?? '',
        salePrice: Number(item.salePrice),
        minStock: Number(item.minStock),
        ...(canViewCost && { averageCost: Number(item.averageCost) }),
        onHand: Number(item.onHand),
        status: r.isActive ? 'Active' : 'Inactive',
      });
    }

    const header = ws.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };

    const help = wb.addWorksheet('Instructions');
    help.getColumn(1).width = 100;
    [
      'Importing products',
      '',
      '• Edit the "Products" sheet and import it back from the Products screen (Import button).',
      '• Rows are matched by SKU: an existing SKU is updated, a new SKU creates a product.',
      '• Required for a new product: SKU, Name, Unit (unit code, e.g. PCS) and Sale price.',
      '• Category and Tax rate must match existing names exactly (case does not matter).',
      '• An empty cell clears Barcode, Description, Category and Tax rate; a column you remove is left unchanged.',
      '• Avg. cost, On hand and Status are informative only and are ignored by the import.',
      '• The import is all-or-nothing: if one row has an error, nothing is imported.',
    ].forEach((line, i) => {
      const c = help.getCell(i + 1, 1);
      c.value = line;
      if (i === 0) c.font = { bold: true, size: 14 };
    });

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  // ── import ────────────────────────────────────────────────────────────────

  async import(file: Buffer, user: RequestUser): Promise<ProductImportResult> {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(file as unknown as ArrayBuffer);
    } catch {
      throw new BadRequestException('The file is not a valid Excel (.xlsx) workbook');
    }
    const ws = wb.getWorksheet('Products') ?? wb.worksheets[0];
    if (!ws) throw new BadRequestException('The workbook has no sheet');

    const width = ws.columnCount;
    const readRow = (n: number) =>
      Array.from({ length: width }, (_, i) => cellText(ws.getRow(n).getCell(i + 1).value));
    const headers = readRow(1);
    const raw = [];
    for (let n = 2; n <= ws.rowCount; n++) raw.push({ row: n, cells: readRow(n) });

    const parsed = parseRows(headers, raw);
    if (parsed.rows.length === 0) return fail(parsed.errors);

    // Keep checking the valid rows against the database so every error is reported at once.
    return this.apply(parsed.rows, parsed.errors, user);
  }

  private async apply(
    rows: ParsedProductRow[],
    parseErrors: RowError[],
    user: RequestUser,
  ): Promise<ProductImportResult> {
    const skus = rows.map((r) => r.sku);
    const barcodes = rows.flatMap((r) => (r.barcode ? [r.barcode] : []));

    const [units, categories, taxRates, existing, barcodeOwners] = await Promise.all([
      this.prisma.unit.findMany({ select: { id: true, code: true } }),
      this.prisma.category.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
      }),
      this.prisma.taxRate.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
      this.prisma.product.findMany({ where: { sku: { in: skus } }, include: productInclude }),
      this.prisma.product.findMany({
        where: { barcode: { in: barcodes } },
        select: { sku: true, barcode: true },
      }),
    ]);
    const unitBy = indexBy(units.map((u) => ({ id: u.id, label: u.code })));
    const categoryBy = indexBy(categories.map((c) => ({ id: c.id, label: c.name })));
    const taxBy = indexBy(taxRates.map((t) => ({ id: t.id, label: t.name })));
    const existingBy = new Map(existing.map((p) => [p.sku, p]));
    const barcodeOwnerBy = new Map(barcodeOwners.map((p) => [p.barcode!, p.sku]));

    const withMoves = new Set(
      (
        await this.prisma.stockMove.groupBy({
          by: ['productId'],
          where: { productId: { in: existing.map((p) => p.id) } },
        })
      ).map((m) => m.productId),
    );

    const errors: RowError[] = [...parseErrors];
    const creates: { row: number; data: Prisma.ProductCreateInput }[] = [];
    const updates: { id: string; data: Prisma.ProductUpdateInput }[] = [];
    let unchanged = 0;

    for (const r of rows) {
      const rowErrors: string[] = [];
      const resolve = (
        by: Map<string, Lookup[]>,
        value: string | null | undefined,
        what: string,
      ) => {
        if (!value) return value; // undefined = column absent, null = clear
        const hits = by.get(value.toLowerCase()) ?? [];
        if (hits.length === 0) rowErrors.push(`Unknown ${what} "${value}"`);
        else if (hits.length > 1) rowErrors.push(`${what} "${value}" is ambiguous`);
        return hits[0]?.id;
      };
      const unitId = resolve(unitBy, r.unit, 'unit');
      const categoryId = resolve(categoryBy, r.category, 'category');
      const taxRateId = resolve(taxBy, r.taxRate, 'tax rate');

      if (r.barcode) {
        const owner = barcodeOwnerBy.get(r.barcode);
        if (owner && owner !== r.sku) {
          rowErrors.push(`Barcode "${r.barcode}" already belongs to product ${owner}`);
        }
      }

      const current = existingBy.get(r.sku);
      if (!current) {
        if (!r.name) rowErrors.push('Name is required for a new product');
        if (!r.unit) rowErrors.push('Unit is required for a new product');
        if (r.salePrice === undefined || r.salePrice === null) {
          rowErrors.push('Sale price is required for a new product');
        }
        if (rowErrors.length) {
          errors.push(...rowErrors.map((message) => ({ row: r.row, message })));
          continue;
        }
        creates.push({
          row: r.row,
          data: {
            sku: r.sku,
            name: r.name!,
            barcode: r.barcode ?? null,
            description: r.description ?? null,
            salePrice: r.salePrice!,
            minStock: r.minStock ?? 0,
            baseUnit: { connect: { id: unitId! } },
            ...(categoryId && { category: { connect: { id: categoryId } } }),
            ...(taxRateId && { taxRate: { connect: { id: taxRateId } } }),
          },
        });
        continue;
      }

      // Existing product: only what actually changes. Empty required cells keep the value.
      const data: Prisma.ProductUpdateInput = {};
      if (r.name && r.name !== current.name) data.name = r.name;
      if (r.barcode !== undefined && r.barcode !== current.barcode) data.barcode = r.barcode;
      if (r.description !== undefined && r.description !== current.description) {
        data.description = r.description;
      }
      if (r.salePrice != null && !current.salePrice.equals(r.salePrice)) {
        data.salePrice = r.salePrice;
      }
      if (r.minStock != null && !current.minStock.equals(r.minStock)) data.minStock = r.minStock;
      if (unitId && unitId !== current.baseUnitId) {
        if (withMoves.has(current.id)) {
          rowErrors.push('The unit cannot be changed once the product has stock movements');
        } else data.baseUnit = { connect: { id: unitId } };
      }
      if (categoryId !== undefined && (categoryId ?? null) !== current.categoryId) {
        data.category = categoryId ? { connect: { id: categoryId } } : { disconnect: true };
      }
      if (taxRateId !== undefined && (taxRateId ?? null) !== current.taxRateId) {
        data.taxRate = taxRateId ? { connect: { id: taxRateId } } : { disconnect: true };
      }

      if (rowErrors.length) {
        errors.push(...rowErrors.map((message) => ({ row: r.row, message })));
      } else if (Object.keys(data).length === 0) unchanged++;
      else updates.push({ id: current.id, data });
    }

    if (errors.length) return fail(errors);
    if (creates.length + updates.length === 0) {
      return { created: 0, updated: 0, unchanged, errors: [] };
    }

    try {
      await this.prisma.$transaction(
        async (tx) => {
          for (const c of creates) {
            const created = await tx.product.create({ data: c.data, include: productInclude });
            await tx.auditLog.create({
              data: {
                userId: user.id,
                action: 'create',
                entity: 'Product',
                entityId: created.id,
                after: toAuditJson(auditSnapshot(created)),
              },
            });
          }
          for (const u of updates) {
            const before = existing.find((p) => p.id === u.id)!;
            const after = await tx.product.update({
              where: { id: u.id },
              data: u.data,
              include: productInclude,
            });
            await tx.auditLog.create({
              data: {
                userId: user.id,
                action: 'update',
                entity: 'Product',
                entityId: u.id,
                before: toAuditJson(auditSnapshot(before)),
                after: toAuditJson(auditSnapshot(after)),
              },
            });
          }
        },
        { timeout: 120_000, maxWait: 10_000 },
      );
    } catch (err) {
      // e.g. two rows swapping barcodes: caught by the unique index, nothing is written.
      rethrowPrismaError(err, 'Product');
    }

    return { created: creates.length, updated: updates.length, unchanged, errors: [] };
  }
}

function fail(errors: RowError[]): ProductImportResult {
  return { created: 0, updated: 0, unchanged: 0, errors: errors.sort((a, b) => a.row - b.row) };
}

/** Case-insensitive lookup; several hits mean the name is ambiguous. */
function indexBy(items: Lookup[]): Map<string, Lookup[]> {
  const map = new Map<string, Lookup[]>();
  for (const it of items) {
    const key = it.label.toLowerCase();
    map.set(key, [...(map.get(key) ?? []), it]);
  }
  return map;
}
