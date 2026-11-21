import type { Paginated } from '@erp/shared';
import { api } from './api';

/**
 * Client-side export of list screens to Excel (.xlsx) or CSV.
 *
 * Data comes from the same API the screen uses, so permissions apply
 * (e.g. cost columns are only there for users with inventory.cost.view).
 *  - Excel: real number cells with formats, bold frozen header, auto filter.
 *  - CSV:   UTF-8 with BOM, comma separated, dot decimals (machine-readable).
 */
export type ExportFormat = 'xlsx' | 'csv';

export interface ExportColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
  /** number = decimal string or number from the API, exported as a number cell. */
  type?: 'text' | 'number' | 'date';
  /** Excel number format, e.g. '#,##0.00'. */
  numFmt?: string;
  width?: number;
}

/** Hard stop so a mistaken export cannot freeze the browser. */
const MAX_ROWS = 50_000;

/** Loads every page of a paginated endpoint. `path` must not contain page / pageSize. */
export async function fetchAllPages<T, P extends Paginated<T> = Paginated<T>>(
  path: string,
  pageSize: number,
): Promise<{ items: T[]; first: P | null }> {
  const sep = path.includes('?') ? '&' : '?';
  const items: T[] = [];
  let first: P | null = null;
  for (let page = 1; ; page++) {
    const res = await api<P>(`${path}${sep}page=${page}&pageSize=${pageSize}`);
    first ??= res;
    items.push(...res.items);
    if (items.length >= res.total || res.items.length === 0) break;
    if (items.length >= MAX_ROWS)
      throw new Error(`Too many rows to export (over ${MAX_ROWS}). Narrow the filters.`);
  }
  return { items, first };
}

/** Builds the file and makes the browser download it. */
export async function exportRows<T>(opts: {
  format: ExportFormat;
  /** Without extension; a date stamp is appended. */
  fileName: string;
  sheetName: string;
  columns: ExportColumn<T>[];
  rows: T[];
}): Promise<void> {
  const stamp = new Date().toISOString().slice(0, 10);
  const name = `${opts.fileName}-${stamp}.${opts.format}`;
  const blob =
    opts.format === 'csv'
      ? toCsv(opts.columns, opts.rows)
      : await toXlsx(opts.sheetName, opts.columns, opts.rows);
  download(blob, name);
}

// ── CSV ─────────────────────────────────────────────────────────────────────

export function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  // Quote when needed; double the quotes inside. Also neutralise spreadsheet
  // formulas (=, +, -, @ at the start of TEXT) to prevent CSV injection.
  const safe =
    typeof v === 'string' && /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsvText<T>(columns: ExportColumn<T>[], rows: T[]): string {
  const lines = [columns.map((c) => csvCell(c.header)).join(',')];
  for (const row of rows) lines.push(columns.map((c) => csvCell(c.value(row))).join(','));
  return lines.join('\r\n');
}

function toCsv<T>(columns: ExportColumn<T>[], rows: T[]): Blob {
  // BOM so Excel opens accented characters correctly.
  return new Blob(['﻿' + toCsvText(columns, rows)], { type: 'text/csv;charset=utf-8' });
}

// ── Excel ───────────────────────────────────────────────────────────────────

async function toXlsx<T>(sheetName: string, columns: ExportColumn<T>[], rows: T[]): Promise<Blob> {
  // Loaded on demand: the library is only downloaded when someone exports.
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ERP';
  wb.created = new Date();
  const ws = wb.addWorksheet(sheetName.slice(0, 31), { views: [{ state: 'frozen', ySplit: 1 }] });

  ws.columns = columns.map((c) => ({
    header: c.header,
    width: c.width ?? Math.max(10, Math.min(40, c.header.length + 4)),
    style: c.numFmt ? { numFmt: c.numFmt } : {},
  }));
  for (const row of rows) {
    ws.addRow(
      columns.map((c) => {
        const v = c.value(row);
        if (v === null || v === undefined || v === '') return null;
        if (c.type === 'number') return typeof v === 'number' ? v : Number(v);
        if (c.type === 'date') {
          // Excel dates have no time zone: store the viewer's local time, as on screen.
          const d = new Date(String(v));
          return new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
        }
        return String(v);
      }),
    );
  }

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
  header.alignment = { vertical: 'middle' };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Common Excel formats. */
export const FMT = {
  qty: '#,##0.####',
  money: '#,##0.00',
  cost: '#,##0.00##',
  date: 'yyyy-mm-dd hh:mm',
};
