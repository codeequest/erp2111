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
    const categories = await this.prisma.category.findMany({ orderBy: { name: 'asc' } });
    const wb = new ExcelJS.Workbook();

    // --- sheet 1: the data to fill in ---
    const ws = wb.addWorksheet('Products', { views: [{ state: 'frozen', ySplit: 1 }] });
    const head = ws.addRow(TEMPLATE_COLUMNS);
    head.height = 22;
    head.eachCell((c, i) => {
      const required = i <= 2; // sku + name
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: required ? 'FFC2410C' : 'FF047857' } };
      c.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    const examples = [
      ['EX-SCOOTER-125', 'Exemple Scooter 125', 'Marque', 'Modele', 125, 'no', 'Rouge', 2025, 'NEW', 2000, '', 2, '', categories[0]?.name ?? 'Scooters', 'PCS', '', 'Laissez un prix vide : il est calculé avec le taux de change (1 USD = 3,1 TND)'],
      ['EX-ELECTRIC', 'Exemple Électrique', 'Marque', 'Modele', '', 'yes', 'Gris', 2026, 'NEW', '', 15500, 1, '', categories[0]?.name ?? 'Scooters', 'PCS', '', 'Prix en TND seulement'],
      ['EX-USED-50', 'Exemple Occasion 50cc', 'Marque', 'Modele', 50, 'no', 'Blanc', 2021, 'USED', 700, 2170, 0, '', categories[0]?.name ?? 'Scooters', 'PCS', '', ''],
    ];
    examples.forEach((r) => ws.addRow(r));
    ws.columns.forEach((c, i) => (c.width = [18, 28, 14, 14, 12, 12, 14, 12, 12, 14, 14, 10, 16, 22, 8, 32, 50][i] ?? 16));
    const idx = (k: string) => TEMPLATE_COLUMNS.indexOf(k) + 1;
    const list = (k: string, values: string, prompt: string) => {
      for (let r = 2; r <= 500; r++)
        ws.getCell(r, idx(k)).dataValidation = {
          type: 'list', allowBlank: true, formulae: [values], showErrorMessage: true,
          errorTitle: 'Valeur invalide', error: prompt,
        };
    };
    list('isElectric', '"yes,no"', 'Choisissez yes ou no');
    list('condition', '"NEW,USED"', 'Choisissez NEW ou USED');
    list('unit', '"PCS"', 'Unité inconnue');

    // --- sheet 2: how to fill it ---
    const help = wb.addWorksheet('Instructions');
    help.columns = [{ width: 18 }, { width: 14 }, { width: 90 }];
    help.addRow(['Colonne', 'Obligatoire', 'Explication']).font = { bold: true };
    const doc: [string, string, string][] = [
      ['sku', 'non*', 'Référence unique. Si elle existe déjà le produit est MIS À JOUR, sinon il est créé. *Si vide, elle est générée.'],
      ['name', 'OUI', 'Nom du produit (peut aussi s\'appeler "Scooter").'],
      ['brand / model', 'non', 'Marque et modèle.'],
      ['engineCc', 'non', 'Cylindrée en cm³ (125, "125 cc"…). Laissez vide pour un électrique.'],
      ['isElectric', 'non', 'yes ou no.'],
      ['color / modelYear', 'non', 'Couleur et année du modèle.'],
      ['condition', 'non', 'NEW (neuf) ou USED (occasion).'],
      ['priceUsd / priceTnd', 'non', 'Prix en dollars et en dinars. Si un seul est rempli, l\'autre est calculé (1 USD = 3,1 TND). Formats acceptés : 2000, "62 475,000 TND", "20 153,23 $US".'],
      ['minStock', 'non', 'Seuil d\'alerte de stock bas.'],
      ['barcode', 'non', 'Code-barres (unique).'],
      ['category', 'non', 'Nom de la catégorie. Une catégorie inexistante est créée automatiquement.'],
      ['unit', 'non', 'Unité de mesure (PCS par défaut).'],
      ['imageUrl', 'non', 'Chemin d\'une image déjà dans l\'application (ex. /scooters/honda-pcx-125.jpg). Pour une nouvelle photo, utilisez le formulaire du produit.'],
      ['description', 'non', 'Texte libre.'],
    ];
    doc.forEach((r) => help.addRow(r));
    help.addRow([]);
    help.addRow(['', '', 'Supprimez les 3 lignes d\'exemple avant d\'importer, puis envoyez le fichier avec le bouton « Import Excel ».']).font = { bold: true };
    help.addRow(['', '', 'Catégories existantes : ' + (categories.map((c) => c.name).join(' · ') || '—')]);
    help.eachRow((r) => (r.alignment = { wrapText: true, vertical: 'top' }));

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  /** All products, in the exact same columns as the import template (export → edit → re-import). */
  async export(): Promise<Buffer> {
    const products = await this.prisma.product.findMany({
      include: { category: true, baseUnit: true },
      orderBy: [{ brand: 'asc' }, { name: 'asc' }],
    });
    // One plain sheet, all products (active and inactive), nothing but data.
    // The first 17 columns match the import template, so the file can be re-imported.
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Products');
    ws.addRow([...TEMPLATE_COLUMNS, 'isActive', 'createdAt']).font = { bold: true };
    for (const p of products) {
      ws.addRow([
        p.sku, p.name, p.brand ?? '', p.model ?? '', p.engineCc ?? '', p.isElectric ? 'yes' : 'no',
        p.color ?? '', p.modelYear ?? '', p.condition, Number(p.salePrice), Number(p.salePriceTnd),
        Number(p.minStock), p.barcode ?? '', p.category?.name ?? '', p.baseUnit.code,
        p.imageUrl ?? '', p.description ?? '', p.isActive ? 'yes' : 'no', p.createdAt,
      ]);
    }
    ws.columns.forEach((c, i) => (c.width = [20, 28, 14, 14, 10, 10, 16, 10, 10, 12, 12, 10, 14, 24, 8, 34, 60, 10, 20][i] ?? 14));
    ws.getColumn(19).numFmt = 'yyyy-mm-dd hh:mm';
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 19 } };
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
