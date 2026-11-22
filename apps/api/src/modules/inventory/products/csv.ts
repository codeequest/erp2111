/**
 * Minimal, dependency-free CSV reader / writer for product import and export.
 *  - RFC 4180 quoting ("a ""quoted"" value", line breaks inside quotes)
 *  - delimiter auto-detected from the header: comma, semicolon (French Excel) or tab
 *  - UTF-8 (with or without BOM), falling back to Windows-1252 for files saved by old Excel
 */

export type Delimiter = ',' | ';' | '\t';

/** Decodes an uploaded file. UTF-8 first; Windows-1252 if the bytes are not valid UTF-8. */
export function decodeCsv(buffer: Buffer): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    text = new TextDecoder('windows-1252').decode(buffer);
  }
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function detectDelimiter(text: string): Delimiter {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const counts: Record<Delimiter, number> = { ',': 0, ';': 0, '\t': 0 };
  let inQuotes = false;
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch in counts) counts[ch as Delimiter]++;
  }
  return (Object.entries(counts) as [Delimiter, number][]).sort((a, b) => b[1] - a[1])[0][0];
}

/** Parses CSV text into rows of cells. Completely empty lines are dropped. */
export function parseCsv(text: string, delimiter: Delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  const endRow = () => {
    row.push(cell);
    if (row.some((c) => c.trim() !== '')) rows.push(row);
    row = [];
    cell = '';
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
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
    } else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRow();
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length > 0) endRow();
  return rows;
}

function escapeCell(value: string, delimiter: Delimiter): string {
  return /["\r\n]/.test(value) || value.includes(delimiter) || /^\s|\s$/.test(value)
    ? `"${value.replace(/"/g, '""')}"`
    : value;
}

/**
 * Builds a CSV file. Starts with a UTF-8 BOM so Excel shows accents and Arabic correctly.
 * Cells starting with = + - @ are prefixed with ' to prevent formula injection in Excel.
 */
export function toCsv(
  header: readonly string[],
  rows: (string | null | undefined)[][],
  delimiter: Delimiter = ',',
): string {
  const safe = (v: string | null | undefined) => {
    const s = v ?? '';
    return /^[=+\-@]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
  };
  const lines = [header, ...rows].map((r) =>
    r.map((v) => escapeCell(safe(v), delimiter)).join(delimiter),
  );
  return '﻿' + lines.join('\r\n') + '\r\n';
}
