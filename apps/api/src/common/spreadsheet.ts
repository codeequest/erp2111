import { BadRequestException, StreamableFile } from '@nestjs/common';
import { CellValue, Workbook } from 'exceljs';
import { detectDelimiter, parseCsv } from './csv';

/**
 * Excel (.xlsx) files for every import and export. CSV files are still
 * accepted on import, so older files keep working.
 */

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export interface UploadedSheetFile {
  buffer: Buffer;
  originalname?: string;
}

/** Reads the first sheet of an .xlsx file (or a .csv file) as rows of text cells. */
export async function readTable(file: UploadedSheetFile): Promise<string[][]> {
  const name = (file.originalname ?? '').toLowerCase();
  const isZip = file.buffer.length > 3 && file.buffer[0] === 0x50 && file.buffer[1] === 0x4b; // "PK"
  if (name.endsWith('.xls') && !isZip) {
    throw new BadRequestException('Old Excel 97-2003 files (.xls) are not supported: save the file as .xlsx');
  }
  if (!isZip) {
    const text = file.buffer.toString('utf8');
    const delimiter = detectDelimiter(text);
    const rows = parseCsv(text, delimiter).filter((r) => r.some((c) => c.trim() !== ''));
    // Excel in comma-decimal locales (French, Arabic…) saves "12,50" in ";" files.
    return delimiter === ';' ? rows.map((r) => r.map((c) => c.replace(/^(-?\d+),(\d+)$/, '$1.$2'))) : rows;
  }

  const wb = new Workbook();
  try {
    await wb.xlsx.load(file.buffer as unknown as ArrayBuffer);
  } catch {
    throw new BadRequestException('The file is not a valid Excel (.xlsx) file');
  }
  const ws = wb.worksheets.find((w) => w.state === 'visible') ?? wb.worksheets[0];
  if (!ws) throw new BadRequestException('The Excel file has no sheet');

  const rows: string[][] = [];
  const width = ws.columnCount;
  ws.eachRow({ includeEmpty: true }, (row) => {
    const cells: string[] = [];
    for (let c = 1; c <= width; c++) cells.push(cellText(row.getCell(c).value));
    rows.push(cells);
  });
  // Drop fully empty rows, common at the end of sheets.
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function cellText(v: CellValue): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(10)));
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if ('result' in v) return cellText(v.result as CellValue); // formula: use its value
    if ('text' in v) return String(v.text); // hyperlink
    if ('error' in v) return '';
  }
  return String(v);
}

/** Controller response that downloads an .xlsx file. */
export function xlsxFile(buffer: Buffer, filename: string): StreamableFile {
  return new StreamableFile(buffer, {
    type: XLSX_MIME,
    disposition: `attachment; filename="${filename.replace(/[^\w.-]/g, '_')}"`,
    length: buffer.length,
  });
}

export interface SheetColumn {
  header: string;
  /** Width in characters */
  width?: number;
  /** Write numeric text as numbers (so Excel can sum them) */
  numeric?: boolean;
}

/** Builds an .xlsx file with one sheet: bold, frozen header row and filters. */
export async function toXlsx(
  sheetName: string,
  columns: SheetColumn[],
  rows: (string | number | null | undefined)[][],
): Promise<Buffer> {
  const wb = new Workbook();
  wb.creator = 'ERP';
  const ws = wb.addWorksheet(sheetName.slice(0, 31), { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = columns.map((c) => ({ header: c.header, width: c.width ?? Math.max(12, c.header.length + 2) }));
  ws.getRow(1).font = { bold: true };
  for (const r of rows) {
    ws.addRow(
      r.map((v, i) => {
        if (v === null || v === undefined || v === '') return null;
        if (columns[i]?.numeric) {
          const n = typeof v === 'number' ? v : Number(v);
          if (Number.isFinite(n)) return n;
        }
        // Cells are written as text values, never as formulas.
        return typeof v === 'number' ? v : String(v);
      }),
    );
  }
  if (rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}
