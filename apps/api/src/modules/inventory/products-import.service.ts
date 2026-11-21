import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ImportProductsResult, PRODUCT_CSV_COLUMNS } from '@erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../core/audit/audit.service';
import { SettingsService } from '../../core/settings/settings.service';
import { buildPaths } from './categories.service';
import { ProductsService, Viewer } from './products.service';
import { parseCsv } from './csv';
import { parseDecimal } from './decimal';

type Column = (typeof PRODUCT_CSV_COLUMNS)[number];

/** Header names accepted for each column (English, French, with or without accents). */
const HEADER_ALIASES: Record<Column, string[]> = {
  sku: ['sku', 'reference', 'ref', 'code'],
  name: ['name', 'nom', 'designation', 'libelle'],
  barcode: ['barcode', 'code_barre', 'code_barres', 'codebarre', 'ean'],
  category: ['category', 'categorie', 'famille'],
  unit: ['unit', 'unite', 'uom'],
  sale_price: ['sale_price', 'prix_vente', 'prix_vente_ht', 'prix', 'price'],
  purchase_price: ['purchase_price', 'prix_achat', 'prix_achat_ht', 'cout', 'cost'],
  vat_rate: ['vat_rate', 'vat', 'tva', 'taux_tva'],
  description: ['description', 'desc'],
  active: ['active', 'actif', 'is_active'],
};

const MAX_ERRORS = 100;
const MAX_ROWS = 20_000;
const BARCODE = /^[0-9A-Za-z-]{1,40}$/;
const SKU = /^[A-Z0-9._/-]{1,40}$/;

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\s-]+/g, '_')
    .replace(/[()%]/g, '')
    .replace(/_+$/, '');
}

function parseActive(v: string): boolean | null | undefined {
  const s = v.trim().toLowerCase();
  if (s === '') return undefined;
  if (['1', 'true', 'yes', 'oui', 'o', 'y', 'actif', 'active'].includes(s)) return true;
  if (['0', 'false', 'no', 'non', 'n', 'inactif', 'inactive'].includes(s)) return false;
  return null;
}

/** "Boissons > Jus", "Boissons › Jus" or "Boissons / Jus" → ["Boissons", "Jus"] */
function splitPath(v: string): string[] {
  return v
    .split(/\s*[›>/]\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

interface ParsedRow {
  line: number;
  sku: string | null;
  name: string;
  barcode: string | null | undefined;
  categoryPath: string[] | null | undefined;
  unitId: string;
  salePrice: Prisma.Decimal;
  purchasePrice: Prisma.Decimal | undefined;
  taxRateId: string | null | undefined;
  description: string | null | undefined;
  isActive: boolean | undefined;
  existingId: string | null;
}

@Injectable()
export class ProductsImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly products: ProductsService,
  ) {}

  async import(csv: string, dryRun: boolean, viewer: Viewer): Promise<ImportProductsResult> {
    const table = parseCsv(csv);
    if (table.length < 2)
      throw new BadRequestException(
        'The file is empty (a header line and at least one product are needed)',
      );
    if (table.length - 1 > MAX_ROWS)
      throw new BadRequestException(`Too many lines (maximum ${MAX_ROWS})`);

    // Map header → column index.
    const header = table[0].map(normalizeHeader);
    const index = {} as Record<Column, number>;
    for (const col of PRODUCT_CSV_COLUMNS) {
      index[col] = header.findIndex((h) => HEADER_ALIASES[col].includes(h));
    }
    const missing = (['name', 'unit', 'sale_price'] as Column[]).filter((c) => index[c] < 0);
    if (missing.length) {
      throw new BadRequestException(`Missing column(s): ${missing.join(', ')}`);
    }
    const has = (c: Column) => index[c] >= 0;
    const cell = (row: string[], c: Column) => (has(c) ? (row[index[c]] ?? '').trim() : '');

    // Reference data, loaded once.
    const [
      units,
      taxRates,
      categories,
      existing,
      productBarcodes,
      packagingBarcodes,
      defaultTaxRateId,
    ] = await Promise.all([
      this.prisma.unit.findMany(),
      this.prisma.taxRate.findMany({ where: { isActive: true } }),
      this.prisma.category.findMany(),
      this.prisma.product.findMany({ select: { id: true, sku: true } }),
      this.prisma.product.findMany({
        where: { barcode: { not: null } },
        select: { id: true, barcode: true },
      }),
      this.prisma.productUnit.findMany({
        where: { barcode: { not: null } },
        select: { productId: true, barcode: true },
      }),
      this.settings.defaultTaxRateId(),
    ]);
    const unitByCode = new Map(units.map((u) => [u.code.toUpperCase(), u.id]));
    const productBySku = new Map(existing.map((p) => [p.sku, p.id]));
    const barcodeOwner = new Map<string, string>();
    for (const p of productBarcodes) barcodeOwner.set(p.barcode!, p.id);
    for (const p of packagingBarcodes) barcodeOwner.set(p.barcode!, p.productId);
    const categoryIdByPath = new Map<string, string>();
    for (const [id, path] of buildPaths(categories)) categoryIdByPath.set(path.toLowerCase(), id);

    const errors: ImportProductsResult['errors'] = [];
    const rows: ParsedRow[] = [];
    const skusInFile = new Map<string, number>();
    const barcodesInFile = new Map<string, number>();
    const newCategories = new Set<string>();

    for (let i = 1; i < table.length && errors.length < MAX_ERRORS; i++) {
      const raw = table[i];
      const line = i + 1;
      const fail = (message: string) => errors.push({ line, message });

      const skuRaw = cell(raw, 'sku').toUpperCase();
      const sku = skuRaw || null;
      if (sku && !SKU.test(sku)) {
        fail(`Invalid reference "${skuRaw}" (letters, digits and . _ / - only)`);
        continue;
      }
      if (sku) {
        if (skusInFile.has(sku)) {
          fail(`Reference ${sku} appears twice (also line ${skusInFile.get(sku)})`);
          continue;
        }
        skusInFile.set(sku, line);
      }
      const existingId = sku ? (productBySku.get(sku) ?? null) : null;

      const name = cell(raw, 'name');
      if (name.length < 2) fail('Name is missing or too short');

      const unitCode = cell(raw, 'unit').toUpperCase();
      const unitId = unitByCode.get(unitCode);
      if (!unitId)
        fail(
          unitCode ? `Unknown unit "${unitCode}" — create it in Units first` : 'Unit is missing',
        );

      const salePrice = parseDecimal(cell(raw, 'sale_price'));
      if (!salePrice) fail(`Invalid sale price "${cell(raw, 'sale_price')}"`);

      let purchasePrice: Prisma.Decimal | undefined;
      if (has('purchase_price') && viewer.canSeeCost && cell(raw, 'purchase_price') !== '') {
        const p = parseDecimal(cell(raw, 'purchase_price'));
        if (!p) fail(`Invalid purchase price "${cell(raw, 'purchase_price')}"`);
        else purchasePrice = p;
      }

      let taxRateId: string | null | undefined;
      if (has('vat_rate') && cell(raw, 'vat_rate') !== '') {
        const v = parseDecimal(cell(raw, 'vat_rate').replace('%', ''));
        const rate = v && taxRates.find((t) => t.rate.equals(v));
        if (!rate) fail(`Unknown VAT rate "${cell(raw, 'vat_rate')}"`);
        else taxRateId = rate.id;
      } else if (!existingId) {
        taxRateId = defaultTaxRateId;
      }

      let barcode: string | null | undefined;
      if (has('barcode')) {
        barcode = cell(raw, 'barcode') || null;
        if (barcode) {
          if (!BARCODE.test(barcode)) fail(`Invalid barcode "${barcode}"`);
          else if (barcodesInFile.has(barcode))
            fail(`Barcode ${barcode} appears twice (also line ${barcodesInFile.get(barcode)})`);
          else {
            barcodesInFile.set(barcode, line);
            const owner = barcodeOwner.get(barcode);
            if (owner && owner !== existingId)
              fail(`Barcode ${barcode} is already used by another product`);
          }
        }
      }

      let categoryPath: string[] | null | undefined;
      if (has('category')) {
        const parts = splitPath(cell(raw, 'category'));
        categoryPath = parts.length ? parts : null;
        if (categoryPath) {
          if (categoryPath.some((p) => p.length > 80)) fail('Category name too long');
          // Every missing level will be created.
          for (let d = 1; d <= categoryPath.length; d++) {
            const path = categoryPath.slice(0, d).join(' › ');
            if (!categoryIdByPath.has(path.toLowerCase())) newCategories.add(path);
          }
        }
      }

      const active = has('active') ? parseActive(cell(raw, 'active')) : undefined;
      if (active === null)
        fail(`Invalid value "${cell(raw, 'active')}" in column active (use 1 or 0)`);

      if (errors.length && errors[errors.length - 1].line === line) continue;
      rows.push({
        line,
        sku,
        name,
        barcode,
        categoryPath,
        unitId: unitId!,
        salePrice: salePrice!,
        purchasePrice,
        taxRateId,
        description: has('description') ? cell(raw, 'description') || null : undefined,
        isActive: active ?? undefined,
        existingId,
      });
    }

    const result: ImportProductsResult = {
      dryRun,
      rows: table.length - 1,
      created: rows.filter((r) => !r.existingId).length,
      updated: rows.filter((r) => r.existingId).length,
      newCategories: [...newCategories].sort(),
      errors,
    };
    if (errors.length > 0 || dryRun) return result;

    await this.prisma.$transaction(
      async (tx) => {
        // 1. Missing categories, parents first.
        for (const path of result.newCategories) {
          const parts = path.split(' › ');
          const parentId =
            parts.length > 1
              ? categoryIdByPath.get(parts.slice(0, -1).join(' › ').toLowerCase())!
              : null;
          const c = await tx.category.create({ data: { name: parts[parts.length - 1], parentId } });
          categoryIdByPath.set(path.toLowerCase(), c.id);
        }

        // 2. Products. New products without reference get PRD-xxxxx.
        for (const r of rows) {
          const categoryId =
            r.categoryPath === undefined
              ? undefined
              : r.categoryPath === null
                ? null
                : categoryIdByPath.get(r.categoryPath.join(' › ').toLowerCase())!;
          const data = {
            name: r.name,
            baseUnitId: r.unitId,
            salePrice: r.salePrice,
            ...(r.purchasePrice !== undefined && { purchasePrice: r.purchasePrice }),
            ...(r.barcode !== undefined && { barcode: r.barcode }),
            ...(categoryId !== undefined && { categoryId }),
            ...(r.taxRateId !== undefined && { taxRateId: r.taxRateId }),
            ...(r.description !== undefined && { description: r.description }),
            ...(r.isActive !== undefined && { isActive: r.isActive }),
          };
          if (r.existingId) {
            await tx.product.update({ where: { id: r.existingId }, data });
          } else {
            // nextSku sees the rows created earlier in this transaction; skip
            // references that a later line of the file uses explicitly.
            let sku = r.sku;
            for (let offset = 0; !sku || (!r.sku && skusInFile.has(sku)); offset++) {
              sku = await this.products.nextSku(tx, offset);
            }
            await tx.product.create({ data: { ...data, sku } });
          }
        }

        await this.audit.log(
          viewer,
          {
            action: 'import',
            entity: 'Product',
            after: {
              created: result.created,
              updated: result.updated,
              newCategories: result.newCategories,
            },
          },
          tx,
        );
      },
      { timeout: 120_000 },
    );
    return result;
  }
}
