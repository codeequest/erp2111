import { BadRequestException, Injectable } from '@nestjs/common';
import { ProductCondition } from '@prisma/client';
import ExcelJS from 'exceljs';
import { RequestUser } from '../../common/types/request-user';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { completePrices } from './inventory.service';

/** Column key → accepted header names (lower-cased, accents/spaces ignored). */
const HEADERS: Record<string, string[]> = {
  sku: ['sku', 'reference', 'ref', 'code'],
  name: ['name', 'nom', 'designation', 'scooter', 'produit', 'product', 'modele complet'],
  brand: ['brand', 'marque'],
  model: ['model', 'modele'],
  engineCc: ['enginecc', 'cc', 'cylindree', 'engine', 'moteur'],
  isElectric: ['iselectric', 'electric', 'electrique'],
  color: ['color', 'couleur'],
  modelYear: ['modelyear', 'year', 'annee'],
  condition: ['condition', 'etat'],
  salePrice: ['priceusd', 'saleprice', 'prixusd', 'usd', 'prixdollar'],
  salePriceTnd: ['pricetnd', 'prixtnd', 'tnd', 'dt', 'prixdinar', 'dinar'],
  minStock: ['minstock', 'stockmin'],
  barcode: ['barcode', 'codebarre', 'ean'],
  description: ['description'],
  imageUrl: ['imageurl', 'image', 'photo'],
  category: ['category', 'categorie'],
  unit: ['unit', 'unite'],
};

const norm = (v: unknown) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

export const TEMPLATE_COLUMNS = [
  'sku', 'name', 'brand', 'model', 'engineCc', 'isElectric', 'color', 'modelYear', 'condition',
  'priceUsd', 'priceTnd', 'minStock', 'barcode', 'category', 'unit', 'imageUrl', 'description',
];

export interface ImportResult {
  created: number;
  updated: number;
  errors: { row: number; message: string }[];
}

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return '';
  if (typeof v === 'object') {
    if ('result' in v) return String(v.result ?? '');
    if ('text' in v) return String(v.text ?? '');
    if ('richText' in v) return v.richText.map((r) => r.text).join('');
    if (v instanceof Date) return v.toISOString();
  }
  return String(v).trim();
}

@Injectable()
export class ProductsImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async template(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Products');
    ws.addRow(TEMPLATE_COLUMNS).font = { bold: true };
    ws.addRow([
      'SYM-JET14', 'SYM Jet 14', 'SYM', 'Jet 14', 125, 'no', 'Noir', 2025, 'NEW',
      2000, '', 2, '', 'Scooters', 'PCS', '/scooters/sym-jet-14.jpg', 'Exemple — laissez un prix vide pour le calculer avec le taux de change',
    ]);
    ws.columns.forEach((c) => (c.width = 16));
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  /** All products, in the exact same columns as the import template (export → edit → re-import). */
  async export(): Promise<Buffer> {
    const products = await this.prisma.product.findMany({
      include: { category: true, baseUnit: true },
      orderBy: [{ brand: 'asc' }, { name: 'asc' }],
    });
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Products');
    ws.addRow(TEMPLATE_COLUMNS).font = { bold: true };
    for (const p of products) {
      ws.addRow([
        p.sku, p.name, p.brand ?? '', p.model ?? '', p.engineCc ?? '', p.isElectric ? 'yes' : 'no',
        p.color ?? '', p.modelYear ?? '', p.condition, Number(p.salePrice), Number(p.salePriceTnd),
        Number(p.minStock), p.barcode ?? '', p.category?.name ?? '', p.baseUnit.code,
        p.imageUrl ?? '', p.description ?? '',
      ]);
    }
    ws.columns.forEach((c) => (c.width = 16));
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  async import(file: Express.Multer.File | undefined, user: RequestUser): Promise<ImportResult> {
    if (!file) throw new BadRequestException('Excel file is required (field "file")');
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(file.buffer as unknown as ExcelJS.Buffer);
    } catch {
      throw new BadRequestException('Not a valid .xlsx file');
    }
    const ws = wb.worksheets[0];
    if (!ws) throw new BadRequestException('The workbook is empty');

    // map header → column index
    const cols: Record<string, number> = {};
    ws.getRow(1).eachCell((cell, i) => {
      const h = norm(cellText(cell.value));
      for (const [key, names] of Object.entries(HEADERS)) {
        if (names.includes(h) || norm(key) === h) cols[key] = i;
      }
    });
    if (!cols.name)
      throw new BadRequestException('Header row must contain a "name" (or "Scooter") column');

    const [units, categories] = await Promise.all([
      this.prisma.unit.findMany(),
      this.prisma.category.findMany(),
    ]);
    const defaultUnit = units.find((u) => u.code === 'PCS') ?? units[0];
    if (!defaultUnit) throw new BadRequestException('No unit of measure defined');

    const result: ImportResult = { created: 0, updated: 0, errors: [] };

    const usedSkus = new Set<string>();
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const get = (k: string) => (cols[k] ? cellText(row.getCell(cols[k]).value) : '');
      if (!get('sku') && !get('name')) continue; // blank line
      // no sku column/value: build one from brand + name
      let sku = get('sku');
      if (!sku) {
        sku = (get('brand') + ' ' + get('name')).toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
        if (usedSkus.has(sku)) sku += `-${r}`;
      }
      usedSkus.add(sku);
      try {
        if (!get('name')) throw new Error('name is required');
        // accepts "62 475,000 TND", "20 153,23 $US", "350 cc", "2025" ...
        const num = (k: string) => {
          const raw = get(k);
          if (!raw || /^[-—–]+$/.test(raw)) return undefined;
          const t = raw.replace(/[\s\u00a0]/g, '').replace(',', '.').replace(/[^0-9.]/g, '');
          const n = Number(t);
          if (!t || Number.isNaN(n)) throw new Error(`Invalid number in "${k}": ${raw}`);
          return n;
        };
        const unitCode = get('unit').toUpperCase();
        const unit = unitCode ? units.find((u) => u.code === unitCode) : defaultUnit;
        if (!unit) throw new Error(`Unknown unit "${unitCode}"`);
        const catName = get('category');
        let category = catName
          ? categories.find((c) => c.name.toLowerCase() === catName.toLowerCase())
          : undefined;
        if (catName && !category) {
          category = await this.prisma.category.create({
            data: { name: catName, parentId: categories.find((c) => c.name === 'Scooters')?.id },
          });
          categories.push(category);
        }
        const condRaw = norm(get('condition'));
        const condition: ProductCondition | undefined = !condRaw
          ? undefined
          : ['used', 'occasion', 'occ'].includes(condRaw)
            ? 'USED'
            : 'NEW';
        const electric =
          ['yes', 'oui', 'true', '1', 'x'].includes(norm(get('isElectric'))) ||
          /electri/i.test(norm(get('engineCc')) + norm(get('category')));
        const year = num('modelYear');
        const cc = /electri/i.test(norm(get('engineCc'))) ? undefined : num('engineCc');

        const prices = completePrices({ salePrice: num('salePrice'), salePriceTnd: num('salePriceTnd') });
        const data = {
          name: get('name'),
          brand: get('brand') || undefined,
          model: get('model') || undefined,
          engineCc: electric ? undefined : cc,
          isElectric: electric,
          color: get('color') || undefined,
          modelYear: year,
          condition,
          categoryId: category?.id,
          salePrice: prices.salePrice,
          salePriceTnd: prices.salePriceTnd,
          minStock: num('minStock'),
          barcode: get('barcode') || undefined,
          description: get('description') || undefined,
          imageUrl: get('imageUrl') || undefined,
        };

        const existing = await this.prisma.product.findUnique({ where: { sku } });
        const saved = existing
          ? await this.prisma.product.update({ where: { sku }, data })
          : await this.prisma.product.create({ data: { ...data, sku, baseUnitId: unit.id } });
        if (existing) result.updated++;
        else result.created++;
        await this.audit.log({
          userId: user.id,
          action: existing ? 'import-update' : 'import-create',
          entity: 'Product',
          entityId: saved.id,
          after: saved,
        });
      } catch (e) {
        result.errors.push({ row: r, message: e instanceof Error ? e.message : 'Invalid row' });
      }
    }
    return result;
  }
}
