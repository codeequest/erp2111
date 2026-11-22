import type { CellValue } from 'exceljs';

/**
 * Pure helpers for the products Excel import (no DB access, easy to unit-test).
 *
 * Expected sheet: first row = headers, one product per row. Headers are matched
 * case-insensitively; unknown columns (Avg. cost, On hand, Status…) are ignored,
 * so a file produced by the export can be re-imported as-is.
 */

export const IMPORT_COLUMNS = {
  sku: ['sku'],
  name: ['name'],
  barcode: ['barcode'],
  description: ['description'],
  category: ['category'],
  unit: ['unit', 'base unit'],
  taxRate: ['tax rate', 'tax'],
  salePrice: ['sale price', 'price'],
  minStock: ['min stock', 'min. stock', 'minimum stock'],
} as const;

export type ImportColumn = keyof typeof IMPORT_COLUMNS;

/**
 * One parsed row. A field is `undefined` when its column is absent from the
 * sheet (= leave unchanged on update) and `null` when the cell is empty.
 */
export interface ParsedProductRow {
  /** Spreadsheet row number (1-based, header is row 1). */
  row: number;
  sku: string;
  name?: string | null;
  barcode?: string | null;
  description?: string | null;
  category?: string | null;
  unit?: string | null;
  taxRate?: string | null;
  salePrice?: number | null;
  minStock?: number | null;
}

export interface RowError {
  row: number;
  message: string;
}

export const MAX_IMPORT_ROWS = 5000;
const MAX_AMOUNT = 99_999_999_999_999; // fits Decimal(18, 4)
const MAX_LENGTH: Partial<Record<ImportColumn, number>> = {
  sku: 64,
  barcode: 64,
  name: 200,
  description: 2000,
  category: 200,
  unit: 64,
  taxRate: 200,
};

/** Text of an exceljs cell, whatever its type (rich text, formula, hyperlink…). */
export function cellText(value: CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if ('richText' in value)
      return value.richText
        .map((r) => r.text)
        .join('')
        .trim();
    if ('result' in value) return cellText(value.result as CellValue);
    if ('text' in value) return cellText(value.text as CellValue);
    if ('error' in value) return '';
  }
  return String(value).trim();
}

/** Maps each known column to its 1-based index in the header row. */
export function mapHeaders(headers: string[]): Partial<Record<ImportColumn, number>> {
  const map: Partial<Record<ImportColumn, number>> = {};
  headers.forEach((raw, i) => {
    const h = raw.trim().toLowerCase().replace(/\s+/g, ' ');
    for (const [col, aliases] of Object.entries(IMPORT_COLUMNS) as [
      ImportColumn,
      readonly string[],
    ][]) {
      if (map[col] === undefined && aliases.includes(h)) map[col] = i + 1;
    }
  });
  return map;
}

/** Accepts 12.5, "12.5", "12,5", "1 234,50". Returns NaN when not a number. */
export function parseAmount(text: string): number {
  const cleaned = text.replace(/[\s ]/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return NaN;
  return Number(cleaned);
}

/**
 * Validates the raw rows (header excluded). Returns the parsed rows and the
 * errors found; the caller imports nothing when there is any error.
 */
export function parseRows(
  headers: string[],
  rows: { row: number; cells: string[] }[],
): { rows: ParsedProductRow[]; errors: RowError[] } {
  const errors: RowError[] = [];
  const cols = mapHeaders(headers);
  if (!cols.sku) {
    return { rows: [], errors: [{ row: 1, message: 'Missing required "SKU" column' }] };
  }

  const nonEmpty = rows.filter((r) => r.cells.some((c) => c !== ''));
  if (nonEmpty.length === 0) {
    return { rows: [], errors: [{ row: 1, message: 'The file contains no product' }] };
  }
  if (nonEmpty.length > MAX_IMPORT_ROWS) {
    return {
      rows: [],
      errors: [{ row: 1, message: `Too many rows (max ${MAX_IMPORT_ROWS})` }],
    };
  }

  const parsed: ParsedProductRow[] = [];
  const seenSku = new Map<string, number>();
  const seenBarcode = new Map<string, number>();

  for (const { row, cells } of nonEmpty) {
    const get = (col: ImportColumn): string | null | undefined => {
      const idx = cols[col];
      if (idx === undefined) return undefined;
      const v = cells[idx - 1] ?? '';
      return v === '' ? null : v;
    };
    const rowErrors: string[] = [];

    const text = (col: ImportColumn, label: string) => {
      const v = get(col);
      const max = MAX_LENGTH[col];
      if (v && max && v.length > max) rowErrors.push(`${label} is longer than ${max} characters`);
      return v;
    };
    const amount = (col: ImportColumn, label: string) => {
      const v = get(col);
      if (v === undefined || v === null) return v;
      const n = parseAmount(v);
      if (Number.isNaN(n)) rowErrors.push(`${label} "${v}" is not a number`);
      else if (n < 0) rowErrors.push(`${label} cannot be negative`);
      else if (n > MAX_AMOUNT) rowErrors.push(`${label} is too large`);
      else if (!/^\d+(\.\d{1,4})?$/.test(String(n))) {
        rowErrors.push(`${label} has more than 4 decimals`);
      }
      return n;
    };

    const sku = text('sku', 'SKU');
    if (!sku) rowErrors.push('SKU is required');

    const item: ParsedProductRow = {
      row,
      sku: sku ?? '',
      name: text('name', 'Name'),
      barcode: text('barcode', 'Barcode'),
      description: text('description', 'Description'),
      category: text('category', 'Category'),
      unit: text('unit', 'Unit'),
      taxRate: text('taxRate', 'Tax rate'),
      salePrice: amount('salePrice', 'Sale price'),
      minStock: amount('minStock', 'Min stock'),
    };

    if (sku) {
      const key = sku;
      const first = seenSku.get(key);
      if (first) rowErrors.push(`SKU "${sku}" is already used on row ${first}`);
      else seenSku.set(key, row);
    }
    if (item.barcode) {
      const first = seenBarcode.get(item.barcode);
      if (first) rowErrors.push(`Barcode "${item.barcode}" is already used on row ${first}`);
      else seenBarcode.set(item.barcode, row);
    }

    if (rowErrors.length) errors.push(...rowErrors.map((message) => ({ row, message })));
    else parsed.push(item);
  }

  return { rows: parsed, errors };
}
