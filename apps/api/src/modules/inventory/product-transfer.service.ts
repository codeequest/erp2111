import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  PRODUCT_CSV_COLUMNS,
  type ImportReport,
  type ImportRowAction,
  type ImportRowResult,
} from '@erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestUser } from '../../common/types/request-user';
import { audit } from '../../common/audit';
import { detectDelimiter, parseCsv, toCsv } from '../../common/csv';
import { CatalogService } from './catalog.service';
import { ListProductsQueryDto } from './dto/product.dto';
import { ProductsService } from './products.service';

export const MAX_IMPORT_ROWS = 5000;

type Column = (typeof PRODUCT_CSV_COLUMNS)[number];

const DECIMAL = /^\d{1,14}(\.\d{1,4})?$/;
const TRUE_WORDS = new Set(['yes', 'y', 'true', '1', 'active', 'oui', 'نعم']);
const FALSE_WORDS = new Set(['no', 'n', 'false', '0', 'inactive', 'non', 'لا']);

/** Values a row will write, already resolved to ids. Only columns present in the file. */
interface RowValues {
  sku: string;
  barcode?: string | null;
  name?: string;
  description?: string | null;
  categoryId?: string | null;
  baseUnitId?: string;
  taxRateId?: string | null;
  salePrice?: string;
  minStock?: string;
  isActive?: boolean;
}

interface ExistingProduct {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  categoryId: string | null;
  baseUnitId: string;
  taxRateId: string | null;
  salePrice: Prisma.Decimal;
  minStock: Prisma.Decimal;
  isActive: boolean;
}

/** Product CSV export and import. */
@Injectable()
export class ProductTransferService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
    private readonly catalog: CatalogService,
  ) {}

  // ── Export ─────────────────────────────────────────────────────────────────

  async exportCsv(query: ListProductsQueryDto, user: RequestUser): Promise<string> {
    const canSeeCost = user.permissions.has('inventory.cost.view');
    const where = await this.products.buildWhere(query);
    const rows = await this.prisma.product.findMany({
      where,
      include: { baseUnit: true, taxRate: true },
      orderBy: [{ [query.sort]: query.order }, { id: 'asc' }],
    });
    const paths = new Map((await this.catalog.listCategories(true)).map((c) => [c.id, c.path]));

    const header: string[] = [...PRODUCT_CSV_COLUMNS];
    if (canSeeCost) header.push('average_cost');
    const lines = rows.map((p) => {
      const line: (string | null)[] = [
        p.sku,
        p.barcode,
        p.name,
        p.description,
        p.categoryId ? (paths.get(p.categoryId) ?? null) : null,
        p.baseUnit.code,
        p.taxRate?.name ?? null,
        p.salePrice.toString(),
        p.minStock.toString(),
        p.isActive ? 'yes' : 'no',
      ];
      if (canSeeCost) line.push(p.averageCost.toString());
      return line;
    });
    return toCsv([header, ...lines]);
  }

  // ── Import ─────────────────────────────────────────────────────────────────

  /**
   * Creates or updates products from a CSV, matched by SKU (case-insensitive).
   * Only the columns present in the file are changed. An empty cell clears an
   * optional field (barcode, description, category, tax rate).
   * With dryRun nothing is written; otherwise the valid rows are written in a
   * single transaction and the invalid ones are skipped.
   */
  async importCsv(text: string, dryRun: boolean, user: RequestUser): Promise<ImportReport> {
    const delimiter = detectDelimiter(text);
    const table = parseCsv(text, delimiter);
    if (table.length < 2) throw new BadRequestException('The file has no product rows');
    if (table.length - 1 > MAX_IMPORT_ROWS) {
      throw new BadRequestException(`At most ${MAX_IMPORT_ROWS} rows can be imported at once`);
    }

    const header = table[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
    const index = new Map<Column, number>();
    header.forEach((h, i) => {
      if ((PRODUCT_CSV_COLUMNS as readonly string[]).includes(h)) index.set(h as Column, i);
    });
    if (!index.has('sku')) {
      throw new BadRequestException(
        `The first line must contain column names, including "sku". Expected: ${PRODUCT_CSV_COLUMNS.join(', ')}`,
      );
    }

    const ctx = await this.loadContext();
    // Excel in comma-decimal locales writes "12,50" in ";" files.
    const num = (v: string) => (delimiter === ';' ? v.replace(/^(\d+),(\d+)$/, '$1.$2') : v);

    const results: ImportRowResult[] = [];
    const planned: { values: RowValues; existing?: ExistingProduct; line: number }[] = [];
    const skusInFile = new Map<string, number>();
    const barcodesInFile = new Map<string, number>();

    table.slice(1).forEach((cells, i) => {
      const line = i + 2;
      const get = (c: Column): string | undefined => {
        const at = index.get(c);
        return at === undefined ? undefined : (cells[at] ?? '').trim();
      };
      const errors: string[] = [];
      const sku = get('sku') ?? '';
      const values: RowValues = { sku };

      if (!sku) errors.push('sku is empty');
      else if (sku.length > 64) errors.push('sku is longer than 64 characters');
      const key = sku.toLowerCase();
      if (sku && skusInFile.has(key)) errors.push(`sku repeats line ${skusInFile.get(key)}`);
      else if (sku) skusInFile.set(key, line);
      const existing = ctx.bySku.get(key);

      const name = get('name');
      if (name !== undefined) {
        if (!name) errors.push('name is empty');
        else if (name.length > 200) errors.push('name is longer than 200 characters');
        else values.name = name;
      }

      const barcode = get('barcode');
      if (barcode !== undefined) {
        values.barcode = barcode || null;
        if (barcode.length > 64) errors.push('barcode is longer than 64 characters');
        else if (barcode) {
          const owner = ctx.barcodeOwner.get(barcode);
          if (owner && owner !== existing?.id)
            errors.push(`barcode is already used by ${ctx.ownerLabel.get(barcode)}`);
          if (barcodesInFile.has(barcode))
            errors.push(`barcode repeats line ${barcodesInFile.get(barcode)}`);
          else barcodesInFile.set(barcode, line);
        }
      }

      const description = get('description');
      if (description !== undefined) {
        if (description.length > 2000) errors.push('description is longer than 2000 characters');
        values.description = description || null;
      }

      const category = get('category');
      if (category !== undefined) {
        if (!category) values.categoryId = null;
        else {
          const id = ctx.categoryByPath.get(normalisePath(category));
          if (id) values.categoryId = id;
          else errors.push(`category "${category}" does not exist (create it in Catalogue setup)`);
        }
      }

      const unit = get('base_unit');
      if (unit !== undefined) {
        const id = ctx.unitByCode.get(unit.toUpperCase());
        if (!unit) errors.push('base_unit is empty');
        else if (!id) errors.push(`unit "${unit}" does not exist`);
        else values.baseUnitId = id;
      }

      const tax = get('tax_rate');
      if (tax !== undefined) {
        if (!tax) values.taxRateId = null;
        else {
          const id = ctx.taxByName.get(tax.toLowerCase());
          if (id) values.taxRateId = id;
          else errors.push(`tax rate "${tax}" does not exist`);
        }
      }

      for (const [col, field] of [
        ['sale_price', 'salePrice'],
        ['min_stock', 'minStock'],
      ] as const) {
        const raw = get(col);
        if (raw === undefined) continue;
        const v = num(raw);
        if (!v) continue; // empty = keep the current value (new product: min_stock 0)
        if (!DECIMAL.test(v)) errors.push(`${col} "${raw}" is not a valid number`);
        else values[field] = v;
      }

      const active = get('active');
      if (active !== undefined && active !== '') {
        const word = active.toLowerCase();
        if (TRUE_WORDS.has(word)) values.isActive = true;
        else if (FALSE_WORDS.has(word)) values.isActive = false;
        else errors.push(`active "${active}" must be yes or no`);
      }

      if (!existing) {
        if (values.name === undefined && !errors.some((e) => e.startsWith('name')))
          errors.push('name is required for a new product');
        if (values.baseUnitId === undefined && !errors.some((e) => e.includes('unit')))
          errors.push('base_unit is required for a new product');
        if (values.salePrice === undefined && !errors.some((e) => e.startsWith('sale_price')))
          errors.push('sale_price is required for a new product');
      } else if (
        values.baseUnitId !== undefined &&
        values.baseUnitId !== existing.baseUnitId &&
        ctx.productsWithMoves.has(existing.id)
      ) {
        errors.push('base_unit cannot change: the product already has stock movements');
      }

      if (errors.length) {
        results.push({ line, sku, action: 'error', errors, changes: [] });
        return;
      }
      const changes = existing ? changedFields(existing, values) : [];
      const action: ImportRowAction = !existing
        ? 'create'
        : changes.length
          ? 'update'
          : 'unchanged';
      results.push({ line, sku, action, errors: [], changes });
      if (action !== 'unchanged') planned.push({ values, existing, line });
    });

    if (!dryRun && planned.length) await this.write(planned, user);

    const totals: Record<ImportRowAction, number> = {
      create: 0,
      update: 0,
      unchanged: 0,
      error: 0,
    };
    for (const r of results) totals[r.action]++;
    return { dryRun, totals, rows: results };
  }

  private async write(
    planned: { values: RowValues; existing?: ExistingProduct }[],
    user: RequestUser,
  ) {
    await this.prisma.$transaction(
      async (tx) => {
        for (const { values, existing } of planned) {
          const { sku, ...rest } = values;
          if (existing) {
            const data = Object.fromEntries(
              Object.entries(rest).filter(([, v]) => v !== undefined),
            ) as Prisma.ProductUncheckedUpdateInput;
            await tx.product.update({ where: { id: existing.id }, data });
            const before: Record<string, string | boolean | null> = {};
            const after: Record<string, string | boolean | null> = {};
            for (const f of changedFields(existing, values)) {
              before[f] = snapshotValue(existing[f as keyof ExistingProduct]);
              after[f] = snapshotValue(values[f as keyof RowValues]);
            }
            await audit(tx, user, 'import', 'Product', existing.id, before, after);
          } else {
            const created = await tx.product.create({
              data: {
                sku,
                name: rest.name!,
                baseUnitId: rest.baseUnitId!,
                salePrice: rest.salePrice!,
                barcode: rest.barcode ?? null,
                description: rest.description ?? null,
                categoryId: rest.categoryId ?? null,
                taxRateId: rest.taxRateId ?? null,
                minStock: rest.minStock ?? '0',
                isActive: rest.isActive ?? true,
              },
            });
            await audit(tx, user, 'import', 'Product', created.id, null, {
              sku,
              name: created.name,
              baseUnitId: created.baseUnitId,
              salePrice: created.salePrice.toString(),
              barcode: created.barcode,
              categoryId: created.categoryId,
              taxRateId: created.taxRateId,
              minStock: created.minStock.toString(),
              isActive: created.isActive,
            });
          }
        }
      },
      { timeout: 120_000 },
    );
  }

  /** Everything the row checks need, loaded once. */
  private async loadContext() {
    const [products, packs, units, taxes, categories, moved] = await Promise.all([
      this.prisma.product.findMany({
        select: {
          id: true,
          sku: true,
          barcode: true,
          name: true,
          description: true,
          categoryId: true,
          baseUnitId: true,
          taxRateId: true,
          salePrice: true,
          minStock: true,
          isActive: true,
        },
      }),
      this.prisma.productUnit.findMany({
        where: { barcode: { not: null } },
        select: {
          barcode: true,
          productId: true,
          unit: { select: { code: true } },
          product: { select: { name: true } },
        },
      }),
      this.prisma.unit.findMany(),
      this.prisma.taxRate.findMany({ where: { isActive: true } }),
      this.catalog.listCategories(false),
      this.prisma.stockMove.findMany({ distinct: ['productId'], select: { productId: true } }),
    ]);

    const barcodeOwner = new Map<string, string>();
    const ownerLabel = new Map<string, string>();
    for (const p of products) {
      if (p.barcode) {
        barcodeOwner.set(p.barcode, p.id);
        ownerLabel.set(p.barcode, `"${p.name}"`);
      }
    }
    for (const pk of packs) {
      // A pack barcode belongs to its product, but cannot become the product's own barcode.
      barcodeOwner.set(pk.barcode!, `pack:${pk.productId}`);
      ownerLabel.set(pk.barcode!, `the ${pk.unit.code} pack of "${pk.product.name}"`);
    }

    return {
      bySku: new Map(products.map((p) => [p.sku.toLowerCase(), p])),
      barcodeOwner,
      ownerLabel,
      unitByCode: new Map(units.map((u) => [u.code.toUpperCase(), u.id])),
      taxByName: new Map(taxes.map((t) => [t.name.toLowerCase(), t.id])),
      categoryByPath: new Map(categories.map((c) => [normalisePath(c.path), c.id])),
      productsWithMoves: new Set(moved.map((m) => m.productId)),
    };
  }
}

/** "Food > Oils", "food/oils" and "Food › Oils" all match the same category. */
export function normalisePath(path: string): string {
  return path
    .split(/\s*[›>/]\s*/)
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean)
    .join('›');
}

function snapshotValue(v: unknown): string | boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean') return v;
  return String(v);
}

/** Names of the fields a row would change on an existing product. */
function changedFields(existing: ExistingProduct, values: RowValues): string[] {
  const out: string[] = [];
  for (const [field, v] of Object.entries(values) as [keyof RowValues, unknown][]) {
    if (field === 'sku' || v === undefined) continue;
    const current = existing[field as keyof ExistingProduct];
    const same =
      current instanceof Prisma.Decimal
        ? current.eq(new Prisma.Decimal(v as string))
        : (current ?? null) === (v ?? null);
    if (!same) out.push(field);
  }
  return out;
}
