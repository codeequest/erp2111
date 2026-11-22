import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import {
  PRODUCT_CSV_COLUMNS,
  type ImportMode,
  type ImportPreview,
  type ImportResult,
  type ImportRowResult,
  type ProductCsvColumn,
  type ProductType,
} from '@erp/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService, type AuditEntry } from '../../../core/audit/audit.service';
import type { RequestUser } from '../../../common/types/request-user';
import { buildCategoryPaths } from '../catalog.service';
import { decodeCsv, parseCsv, toCsv } from './csv';
import { nextAutoSku, parseBoolean, parseProductType, parseUserDecimal } from './product-rules';
import { ProductsService } from './products.service';

export const MAX_IMPORT_ROWS = 5000;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

/** Friendly alternative column names accepted in the header. */
const HEADER_ALIASES: Record<string, ProductCsvColumn> = {
  code: 'sku',
  reference: 'sku',
  product: 'name',
  product_name: 'name',
  ean: 'barcode',
  unit: 'base_unit',
  uom: 'base_unit',
  tax: 'tax_rate',
  vat: 'tax_rate',
  price: 'sale_price',
  cost: 'purchase_price',
  min: 'min_stock',
  status: 'active',
  is_active: 'active',
};

interface Lookups {
  categories: { byPath: Map<string, string>; byName: Map<string, string[]> };
  units: Map<string, string>;
  taxRates: Map<string, string>;
  existing: Map<
    string,
    {
      id: string;
      sku: string;
      baseUnitId: string;
      type: ProductType;
      used: boolean;
      before: unknown;
    }
  >;
  /** barcode → product id owning it (product barcode or unit barcode) */
  barcodes: Map<string, string>;
}

interface RowPlan {
  line: number;
  action: 'create' | 'update';
  productId?: string;
  sku: string | null;
  data: {
    name?: string;
    barcode?: string | null;
    type?: ProductType;
    categoryId?: string | null;
    baseUnitId?: string;
    taxRateId?: string | null;
    salePrice?: string;
    purchasePrice?: string;
    minStock?: string;
    description?: string | null;
    isActive?: boolean;
  };
  before?: unknown;
}

export function normalizeHeader(raw: string): string {
  const h = raw
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  return HEADER_ALIASES[h] ?? h;
}

/** Undo the ' prefix our export adds in front of =, +, - and @ (Excel formula protection). */
function clean(v: string | undefined): string {
  const s = (v ?? '').trim();
  return /^'[=+\-@]/.test(s) ? s.slice(1) : s;
}

@Injectable()
export class ProductImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly products: ProductsService,
  ) {}

  template(user: RequestUser): string {
    const canSeeCost = user.permissions.has('inventory.cost.view');
    const header = PRODUCT_CSV_COLUMNS.filter((c) => canSeeCost || c !== 'purchase_price');
    const examples: Record<string, string>[] = [
      {
        sku: 'TSH-001',
        name: 'T-shirt blue M',
        barcode: '6191234567890',
        type: 'STOCKABLE',
        category: 'Clothing / T-shirts',
        base_unit: 'PCS',
        tax_rate: '',
        sale_price: '29.900',
        purchase_price: '15.000',
        min_stock: '10',
        description: '100% cotton',
        active: 'yes',
      },
      {
        sku: '',
        name: 'Installation service',
        barcode: '',
        type: 'SERVICE',
        category: '',
        base_unit: 'PCS',
        tax_rate: '',
        sale_price: '50',
        purchase_price: '',
        min_stock: '0',
        description: 'SKU left empty = generated automatically',
        active: 'yes',
      },
    ];
    return toCsv(
      header,
      examples.map((e) => header.map((h) => e[h])),
    );
  }

  async preview(
    file: Buffer | undefined,
    mode: ImportMode,
    user: RequestUser,
  ): Promise<ImportPreview> {
    return (await this.analyze(file, mode, user)).preview;
  }

  /** All or nothing: if any row has an error, nothing is saved. */
  async run(file: Buffer | undefined, mode: ImportMode, user: RequestUser): Promise<ImportResult> {
    const { preview, plans } = await this.analyze(file, mode, user);
    if (preview.errorRows > 0) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: `The file has ${preview.errorRows} row(s) with errors. Nothing was imported — fix them and try again.`,
        preview,
      });
    }

    // Automatic SKUs for rows that left the column empty, avoiding SKUs used elsewhere in the file.
    const usedSkus = new Set(plans.filter((p) => p.sku).map((p) => p.sku!.toLowerCase()));
    const lastAuto = await this.products.lastAutoSku();
    let n = 0;
    for (const plan of plans.filter((p) => p.action === 'create' && !p.sku)) {
      let sku: string;
      do sku = nextAutoSku(lastAuto, n++);
      while (usedSkus.has(sku.toLowerCase()));
      plan.sku = sku;
      usedSkus.add(sku.toLowerCase());
    }

    const creates = plans.filter((p) => p.action === 'create');
    const updates = plans.filter((p) => p.action === 'update');

    await this.prisma.$transaction(
      async (tx) => {
        const entries: AuditEntry[] = [];
        if (creates.length) {
          const rows: Prisma.ProductCreateManyInput[] = creates.map((p) => ({
            id: randomUUID(),
            sku: p.sku!,
            name: p.data.name!,
            barcode: p.data.barcode ?? null,
            type: p.data.type ?? 'STOCKABLE',
            categoryId: p.data.categoryId ?? null,
            baseUnitId: p.data.baseUnitId!,
            taxRateId: p.data.taxRateId ?? null,
            salePrice: p.data.salePrice ?? '0',
            purchasePrice: p.data.purchasePrice ?? '0',
            minStock: p.data.minStock ?? '0',
            description: p.data.description ?? null,
            isActive: p.data.isActive ?? true,
          }));
          await tx.product.createMany({ data: rows });
          for (const r of rows) {
            entries.push({
              userId: user.id,
              action: 'create',
              entity: 'Product',
              entityId: r.id,
              after: { ...r, source: 'import' },
            });
          }
        }
        for (const p of updates) {
          const after = await tx.product.update({ where: { id: p.productId }, data: p.data });
          entries.push({
            userId: user.id,
            action: 'update',
            entity: 'Product',
            entityId: p.productId,
            before: p.before,
            after,
          });
        }
        await this.audit.recordMany(tx, entries);
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
    return { created: creates.length, updated: updates.length };
  }

  // ── Validation ────────────────────────────────────────────────────────────

  private async analyze(file: Buffer | undefined, mode: ImportMode, user: RequestUser) {
    if (!file || file.length === 0) throw new BadRequestException('Choose a CSV file to import');
    if (file.length > MAX_IMPORT_BYTES)
      throw new BadRequestException('The file must be 5 MB or smaller');

    const table = parseCsv(decodeCsv(file));
    if (table.length < 2)
      throw new BadRequestException(
        'The file is empty: it needs a header line and at least one product',
      );
    const header = table[0].map(normalizeHeader);
    const unknown = header.filter(
      (h) => h && !(PRODUCT_CSV_COLUMNS as readonly string[]).includes(h),
    );
    if (unknown.length) {
      throw new BadRequestException(
        `Unknown column(s): ${unknown.join(', ')}. Expected: ${PRODUCT_CSV_COLUMNS.join(', ')}. Download the template to see the format.`,
      );
    }
    const dupCol = header.find((h, i) => h && header.indexOf(h) !== i);
    if (dupCol) throw new BadRequestException(`Column "${dupCol}" appears twice`);
    if (!header.includes('sku') && mode !== 'create')
      throw new BadRequestException('A "sku" column is required to update products');
    if (!header.includes('name') && mode === 'create')
      throw new BadRequestException('A "name" column is required to create products');
    if (header.includes('purchase_price') && !user.permissions.has('inventory.cost.view')) {
      throw new BadRequestException(
        'You need inventory.cost.view to import purchase prices — remove the purchase_price column',
      );
    }
    const dataRows = table.slice(1);
    if (dataRows.length > MAX_IMPORT_ROWS) {
      throw new BadRequestException(
        `Too many rows (${dataRows.length}). Split the file into parts of ${MAX_IMPORT_ROWS} rows maximum.`,
      );
    }

    const records = dataRows.map((cells, i) => {
      const rec = {} as Record<ProductCsvColumn, string>;
      header.forEach((h, c) => {
        if (h) rec[h as ProductCsvColumn] = clean(cells[c]);
      });
      return { line: i + 2, rec, has: (col: ProductCsvColumn) => header.includes(col) };
    });

    const lookups = await this.loadLookups(records.map((r) => r.rec.sku).filter(Boolean));
    const results: ImportRowResult[] = [];
    const plans: RowPlan[] = [];
    const skuLines = new Map<string, number>();
    const barcodeLines = new Map<string, number>();

    for (const { line, rec, has } of records) {
      const errors: string[] = [];
      const sku = rec.sku ?? '';
      const existing = sku ? lookups.existing.get(sku.toLowerCase()) : undefined;
      let action: 'create' | 'update' = existing ? 'update' : 'create';

      if (mode === 'create' && existing)
        errors.push(`SKU ${sku} already exists (use mode "update" or "create + update")`);
      if (mode === 'update' && !sku) errors.push('SKU is required to update a product');
      else if (mode === 'update' && !existing) errors.push(`SKU ${sku} not found`);
      if (mode === 'create') action = 'create';

      if (sku) {
        if (sku.length > 64) errors.push('SKU is longer than 64 characters');
        const first = skuLines.get(sku.toLowerCase());
        if (first) errors.push(`SKU ${sku} is also on line ${first}`);
        else skuLines.set(sku.toLowerCase(), line);
      }

      const data: RowPlan['data'] = {};
      const isCreate = action === 'create';
      const val = (col: ProductCsvColumn) => (has(col) ? (rec[col] ?? '') : '');
      // On update, an empty cell (or a missing column) keeps the current value.
      const provided = (col: ProductCsvColumn) => has(col) && val(col) !== '';

      if (provided('name')) {
        if (val('name').length > 200) errors.push('Name is longer than 200 characters');
        data.name = val('name');
      } else if (isCreate) errors.push('Name is required');

      if (provided('type') || isCreate) {
        const t = parseProductType(val('type'));
        if (!t) errors.push(`Unknown type "${val('type')}" (use STOCKABLE, CONSUMABLE or SERVICE)`);
        else data.type = t;
      }

      if (provided('category')) {
        const id = this.findCategory(val('category'), lookups);
        if (typeof id === 'string') data.categoryId = id;
        else errors.push(id.error);
      }

      if (provided('base_unit')) {
        const key = val('base_unit');
        const id = lookups.units.get(key.toUpperCase()) ?? lookups.units.get(key.toLowerCase());
        if (!id) errors.push(`Unknown unit "${key}" — create it first in Categories & units`);
        else data.baseUnitId = id;
      } else if (isCreate) errors.push('base_unit is required');

      if (provided('tax_rate')) {
        const key = val('tax_rate').toLowerCase();
        const rate = parseUserDecimal(key.replace('%', ''));
        const id =
          lookups.taxRates.get(key) ??
          (rate ? lookups.taxRates.get(`rate:${rate.toString()}`) : undefined);
        if (!id) errors.push(`Unknown tax rate "${val('tax_rate')}"`);
        else data.taxRateId = id;
      }

      for (const [col, field] of [
        ['sale_price', 'salePrice'],
        ['purchase_price', 'purchasePrice'],
        ['min_stock', 'minStock'],
      ] as const) {
        if (!provided(col)) continue;
        const d = parseUserDecimal(val(col));
        if (!d) errors.push(`${col} "${val(col)}" is not a valid positive number`);
        else data[field] = d.toString();
      }

      if (provided('barcode')) {
        const code = val('barcode');
        const owner = lookups.barcodes.get(code);
        if (code.length > 64) errors.push('Barcode is longer than 64 characters');
        else if (owner && owner !== existing?.id)
          errors.push(`Barcode ${code} is already used by another product`);
        const first = barcodeLines.get(code);
        if (first) errors.push(`Barcode ${code} is also on line ${first}`);
        else barcodeLines.set(code, line);
        data.barcode = code;
      }

      if (provided('description')) data.description = val('description');

      if (provided('active') || isCreate) {
        const b = parseBoolean(val('active'), true);
        if (b === null) errors.push(`active "${val('active')}" must be yes or no`);
        else data.isActive = b;
      }

      if (existing && !isCreate) {
        if (data.baseUnitId && data.baseUnitId !== existing.baseUnitId && existing.used) {
          errors.push(
            'Base unit cannot change: the product already has stock movements or documents',
          );
        }
        if (
          data.type &&
          data.type !== existing.type &&
          existing.type === 'STOCKABLE' &&
          existing.used
        ) {
          errors.push('Type cannot change: the product already has stock movements or documents');
        }
      }

      results.push({ line, sku, name: data.name ?? '', action, errors });
      if (errors.length === 0) {
        plans.push({
          line,
          action,
          productId: existing?.id,
          sku: isCreate ? sku || null : existing!.sku,
          data,
          before: existing?.before,
        });
      }
    }

    const errorRows = results.filter((r) => r.errors.length > 0).length;
    const preview: ImportPreview = {
      mode,
      totalRows: results.length,
      validRows: results.length - errorRows,
      errorRows,
      toCreate: plans.filter((p) => p.action === 'create').length,
      toUpdate: plans.filter((p) => p.action === 'update').length,
      rows: results,
    };
    return { preview, plans };
  }

  private findCategory(raw: string, l: Lookups): string | { error: string } {
    const key = raw
      .toLowerCase()
      .split('/')
      .map((s) => s.trim())
      .join(' / ');
    const byPath = l.categories.byPath.get(key);
    if (byPath) return byPath;
    const byName = l.categories.byName.get(key) ?? [];
    if (byName.length === 1) return byName[0];
    if (byName.length > 1)
      return {
        error: `Category "${raw}" is ambiguous — write the full path, e.g. "Parent / ${raw}"`,
      };
    return { error: `Unknown or inactive category "${raw}" — create it first` };
  }

  private async loadLookups(skus: string[]): Promise<Lookups> {
    const [categories, units, taxRates, existing, productBarcodes, unitBarcodes] =
      await Promise.all([
        this.prisma.category.findMany(),
        this.prisma.unit.findMany(),
        this.prisma.taxRate.findMany({ where: { isActive: true } }),
        skus.length
          ? this.prisma.product.findMany({
              where: {
                OR: skus.map((s) => ({ sku: { equals: s, mode: 'insensitive' as const } })),
              },
              include: {
                _count: {
                  select: {
                    stockMoves: true,
                    purchaseOrderLines: true,
                    goodsReceiptLines: true,
                    salesOrderLines: true,
                    deliveryLines: true,
                    customerReturnLines: true,
                    invoiceLines: true,
                  },
                },
              },
            })
          : Promise.resolve([]),
        this.prisma.product.findMany({
          where: { barcode: { not: null } },
          select: { id: true, barcode: true },
        }),
        this.prisma.productUnit.findMany({
          where: { barcode: { not: null } },
          select: { productId: true, barcode: true },
        }),
      ]);

    const paths = buildCategoryPaths(categories);
    const byPath = new Map<string, string>();
    const byName = new Map<string, string[]>();
    for (const c of categories.filter((c) => c.isActive)) {
      byPath.set(paths.get(c.id)!.toLowerCase(), c.id);
      const n = c.name.toLowerCase();
      byName.set(n, [...(byName.get(n) ?? []), c.id]);
    }

    const unitMap = new Map<string, string>();
    for (const u of units) {
      unitMap.set(u.code.toUpperCase(), u.id);
      unitMap.set(u.name.toLowerCase(), u.id);
    }
    const taxMap = new Map<string, string>();
    for (const t of taxRates) {
      taxMap.set(t.name.toLowerCase(), t.id);
      const key = `rate:${t.rate.toString()}`;
      if (!taxMap.has(key)) taxMap.set(key, t.id);
    }

    const barcodes = new Map<string, string>();
    productBarcodes.forEach((p) => barcodes.set(p.barcode!, p.id));
    unitBarcodes.forEach((u) => barcodes.set(u.barcode!, u.productId));

    const existingMap: Lookups['existing'] = new Map();
    for (const p of existing) {
      const { _count, ...before } = p;
      existingMap.set(p.sku.toLowerCase(), {
        id: p.id,
        sku: p.sku,
        baseUnitId: p.baseUnitId,
        type: p.type as ProductType,
        used: Object.values(_count).some((n) => n > 0),
        before,
      });
    }
    return {
      categories: { byPath, byName },
      units: unitMap,
      taxRates: taxMap,
      existing: existingMap,
      barcodes,
    };
  }
}
