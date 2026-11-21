/**
 * CSV helpers for the product import. Pure functions — no database access —
 * so the parsing rules are unit-tested in product-csv.spec.ts.
 */

/** Parses CSV text (RFC 4180 quoting). The delimiter (`,` or `;`) is detected from the header. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, ''); // Excel BOM
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const delimiter =
    (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

export interface ProductCsvRow {
  /** 1-based line number in the file (header = line 1) */
  line: number;
  sku: string;
  name: string;
  barcode: string | null;
  category: string | null;
  unit: string | null;
  salePrice: number | null;
  purchasePrice: number | null;
  minStock: number | null;
  description: string | null;
}

export interface CsvRowError {
  line: number;
  message: string;
}

const HEADER_ALIASES: Record<string, keyof Omit<ProductCsvRow, 'line'>> = {
  sku: 'sku',
  code: 'sku',
  reference: 'sku',
  ref: 'sku',
  name: 'name',
  nom: 'name',
  designation: 'name',
  barcode: 'barcode',
  ean: 'barcode',
  code_barre: 'barcode',
  category: 'category',
  categorie: 'category',
  unit: 'unit',
  unite: 'unit',
  sale_price: 'salePrice',
  price: 'salePrice',
  prix: 'salePrice',
  prix_vente: 'salePrice',
  purchase_price: 'purchasePrice',
  cost: 'purchasePrice',
  prix_achat: 'purchasePrice',
  min_stock: 'minStock',
  stock_min: 'minStock',
  description: 'description',
};

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\s-]+/g, '_');
}

/** Accepts "1.50", "1,50" and "1 234,50". Returns NaN for anything else. */
export function parseDecimal(value: string): number {
  let v = value.trim().replace(/[\s ]/g, '');
  if (v.includes(',') && !v.includes('.')) v = v.replace(',', '.');
  else v = v.replace(/,/g, '');
  return /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : NaN;
}

/** Maps CSV rows to products and validates each field. Duplicated SKUs in the file are errors. */
export function mapProductRows(rows: string[][]): { rows: ProductCsvRow[]; errors: CsvRowError[] } {
  const errors: CsvRowError[] = [];
  if (rows.length === 0) return { rows: [], errors: [{ line: 1, message: 'The file is empty' }] };

  const columns = rows[0].map((h) => HEADER_ALIASES[normalizeHeader(h)]);
  if (!columns.includes('sku') || !columns.includes('name')) {
    return {
      rows: [],
      errors: [
        { line: 1, message: 'The header must contain at least the columns "sku" and "name"' },
      ],
    };
  }

  const result: ProductCsvRow[] = [];
  const seen = new Map<string, number>();

  rows.slice(1).forEach((cells, idx) => {
    const line = idx + 2;
    const get = (key: keyof Omit<ProductCsvRow, 'line'>) => {
      const i = columns.indexOf(key);
      const v = i >= 0 ? (cells[i] ?? '').trim() : '';
      return v === '' ? null : v;
    };
    const num = (key: 'salePrice' | 'purchasePrice' | 'minStock', label: string): number | null => {
      const raw = get(key);
      if (raw === null) return null;
      const n = parseDecimal(raw);
      if (Number.isNaN(n) || n < 0) {
        errors.push({ line, message: `${label} "${raw}" is not a valid positive number` });
        return null;
      }
      return n;
    };

    const sku = get('sku');
    const name = get('name');
    if (!sku) errors.push({ line, message: 'sku is required' });
    else if (!/^[A-Za-z0-9._\-/]{1,64}$/.test(sku))
      errors.push({ line, message: `sku "${sku}" may only contain letters, digits and . _ - /` });
    if (!name) errors.push({ line, message: 'name is required' });

    if (sku) {
      const key = sku.toUpperCase();
      const first = seen.get(key);
      if (first) errors.push({ line, message: `sku "${sku}" already appears on line ${first}` });
      else seen.set(key, line);
    }

    const row: ProductCsvRow = {
      line,
      sku: sku ?? '',
      name: name ?? '',
      barcode: get('barcode'),
      category: get('category'),
      unit: get('unit')?.toUpperCase() ?? null,
      salePrice: num('salePrice', 'sale_price'),
      purchasePrice: num('purchasePrice', 'purchase_price'),
      minStock: num('minStock', 'min_stock'),
      description: get('description'),
    };
    result.push(row);
  });

  if (result.length === 0) errors.push({ line: 2, message: 'The file has no data rows' });
  return { rows: result, errors };
}
