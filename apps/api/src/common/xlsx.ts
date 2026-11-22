import ExcelJS, { type CellValue } from 'exceljs';

/**
 * Minimal Excel (.xlsx) helpers, the counterpart of csv.ts: a sheet is read
 * and written as a plain table (first row = header).
 */

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** .xlsx files are ZIP archives: they start with "PK\x03\x04". */
export function isXlsx(buffer: Buffer): boolean {
  return (
    buffer.length > 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  );
}

/** Text of a cell, whatever its type (number, rich text, formula, hyperlink…). */
export function cellText(value: CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  // toPrecision(15) removes binary noise such as 0.30000000000000004 without rounding real digits.
  if (typeof value === 'number') return String(Number(value.toPrecision(15)));
  if (typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
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

/**
 * Reads the first sheet (or the one named `preferredSheet`) as a table of
 * trimmed strings. Throws when the buffer is not a readable workbook.
 */
export async function readXlsxTable(buffer: Buffer, preferredSheet?: string): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = (preferredSheet && wb.getWorksheet(preferredSheet)) || wb.worksheets[0];
  if (!ws) return [];

  const width = ws.columnCount;
  const table: string[][] = [];
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const cells = Array.from({ length: width }, (_, i) => cellText(row.getCell(i + 1).value));
    table.push(cells);
  }
  // Drop trailing empty rows (Excel often keeps formatted but empty rows).
  while (table.length && table[table.length - 1].every((c) => c === '')) table.pop();
  return table;
}

export interface XlsxSheet {
  name: string;
  /** First row = header (bold, frozen, filterable). */
  rows: (string | number | null | undefined)[][];
  /** Column widths in characters, by index. */
  widths?: number[];
  /** Excel number format per column index, e.g. "#,##0.00##". */
  numFmt?: Record<number, string>;
}

/** Builds a workbook; the first sheet gets a styled header row. */
export async function writeXlsx(sheets: XlsxSheet[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ERP';
  wb.created = new Date();

  sheets.forEach((sheet, index) => {
    const ws = wb.addWorksheet(sheet.name, {
      views: index === 0 ? [{ state: 'frozen', ySplit: 1 }] : [],
    });
    for (const row of sheet.rows) ws.addRow(row.map((v) => (v === undefined ? null : v)));
    sheet.widths?.forEach((w, i) => (ws.getColumn(i + 1).width = w));
    for (const [col, fmt] of Object.entries(sheet.numFmt ?? {})) {
      ws.getColumn(Number(col) + 1).numFmt = fmt;
    }
    if (index === 0 && sheet.rows.length) {
      const header = ws.getRow(1);
      header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
      ws.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: sheet.rows[0].length },
      };
    }
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}
