/**
 * Minimal CSV reader / writer (RFC 4180 quoting).
 * French Excel saves CSV with ";" — the separator is detected from the header.
 */

export function detectSeparator(headerLine: string): ';' | ',' {
  const semi = (headerLine.match(/;/g) ?? []).length;
  const comma = (headerLine.match(/,/g) ?? []).length;
  return semi >= comma ? ';' : ',';
}

/** Returns rows of cells. Handles quotes, escaped quotes ("") and new lines inside quotes. */
export function parseCsv(text: string): string[][] {
  // Strip the UTF-8 BOM Excel adds.
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const sep = detectSeparator(firstLine);

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  // Drop fully empty lines.
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function escapeCell(value: string, sep: string): string {
  return /["\r\n]/.test(value) || value.includes(sep) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** CSV for Excel: ";" separator and a BOM so accents display correctly. */
export function toCsv(rows: (string | number | null | undefined)[][], sep = ';'): string {
  const body = rows
    .map((r) =>
      r.map((c) => escapeCell(c === null || c === undefined ? '' : String(c), sep)).join(sep),
    )
    .join('\r\n');
  return '﻿' + body + '\r\n';
}
