import { Prisma } from '@prisma/client';
import { CsvRowError, parseCsv, parseDecimal } from './product-csv';

export interface OpeningCsvRow {
  line: number;
  sku: string;
  /** Warehouse code, upper-cased; null = default warehouse */
  warehouse: string | null;
  quantity: number;
  unitCost: number;
  /** Required for lot-tracked products */
  lotNumber: string | null;
  /** YYYY-MM-DD */
  expiryDate: string | null;
}

const ALIASES: Record<string, keyof Omit<OpeningCsvRow, 'line'>> = {
  sku: 'sku',
  reference: 'sku',
  ref: 'sku',
  code: 'sku',
  warehouse: 'warehouse',
  entrepot: 'warehouse',
  depot: 'warehouse',
  quantity: 'quantity',
  qty: 'quantity',
  quantite: 'quantity',
  stock: 'quantity',
  unit_cost: 'unitCost',
  cost: 'unitCost',
  cout: 'unitCost',
  cout_unitaire: 'unitCost',
  prix_achat: 'unitCost',
  lot: 'lotNumber',
  lot_number: 'lotNumber',
  batch: 'lotNumber',
  numero_lot: 'lotNumber',
  no_lot: 'lotNumber',
  expiry: 'expiryDate',
  expiry_date: 'expiryDate',
  expiration: 'expiryDate',
  date_peremption: 'expiryDate',
  peremption: 'expiryDate',
  dlc: 'expiryDate',
};

/** Accepts 2027-06-30, 30/06/2027 and 30-06-2027. Returns YYYY-MM-DD, or null if invalid. */
export function parseDate(value: string): string | null {
  const v = value.trim();
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
  if (match) [y, m, d] = [+match[1], +match[2], +match[3]];
  else if ((match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v)))
    [d, m, y] = [+match[1], +match[2], +match[3]];
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

const norm = (h: string) =>
  h
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\s-]+/g, '_');

/** Parses the opening-stock CSV: sku, warehouse, quantity, unit_cost, lot_number, expiry_date. */
export function mapOpeningCsv(text: string): { rows: OpeningCsvRow[]; errors: CsvRowError[] } {
  const table = parseCsv(text);
  const errors: CsvRowError[] = [];
  if (table.length === 0) return { rows: [], errors: [{ line: 1, message: 'The file is empty' }] };

  const cols = table[0].map((h) => ALIASES[norm(h)]);
  const missing = (['sku', 'quantity', 'unitCost'] as const).filter((c) => !cols.includes(c));
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [
        {
          line: 1,
          message:
            'The header must contain the columns sku, quantity and unit_cost (warehouse, lot_number and expiry_date are optional)',
        },
      ],
    };
  }

  const rows: OpeningCsvRow[] = [];
  table.slice(1).forEach((cells, idx) => {
    const line = idx + 2;
    const get = (k: keyof Omit<OpeningCsvRow, 'line'>) => {
      const i = cols.indexOf(k);
      return i >= 0 ? (cells[i] ?? '').trim() : '';
    };
    const sku = get('sku');
    const quantity = parseDecimal(get('quantity'));
    const unitCost = parseDecimal(get('unitCost'));
    if (!sku) errors.push({ line, message: 'sku is required' });
    if (Number.isNaN(quantity) || quantity <= 0)
      errors.push({ line, message: `quantity "${get('quantity')}" must be a number > 0` });
    if (Number.isNaN(unitCost) || unitCost < 0)
      errors.push({ line, message: `unit_cost "${get('unitCost')}" must be a number ≥ 0` });
    const rawExpiry = get('expiryDate');
    const expiryDate = rawExpiry ? parseDate(rawExpiry) : null;
    if (rawExpiry && !expiryDate) {
      errors.push({
        line,
        message: `expiry_date "${rawExpiry}" is not a valid date (YYYY-MM-DD or DD/MM/YYYY)`,
      });
    }
    const lotNumber = get('lotNumber') || null;
    if (lotNumber && lotNumber.length > 50)
      errors.push({ line, message: 'lot_number is too long' });
    rows.push({
      line,
      sku,
      warehouse: get('warehouse') ? get('warehouse').toUpperCase() : null,
      quantity,
      unitCost,
      lotNumber,
      expiryDate,
    });
  });
  if (rows.length === 0) errors.push({ line: 2, message: 'The file has no data rows' });
  return { rows, errors };
}

/**
 * Weighted average cost after receiving `qty` at `cost`.
 * If there was no (or negative) stock before, the new cost is simply `cost`.
 */
export function weightedAverageCost(
  oldQty: Prisma.Decimal,
  oldAvg: Prisma.Decimal,
  qty: Prisma.Decimal,
  cost: Prisma.Decimal,
): Prisma.Decimal {
  if (oldQty.lte(0)) return cost.toDecimalPlaces(4);
  const total = oldQty.plus(qty);
  return oldQty.times(oldAvg).plus(qty.times(cost)).dividedBy(total).toDecimalPlaces(4);
}
