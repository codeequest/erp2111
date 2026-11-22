/**
 * Minimal RFC 4180 CSV support, enough for spreadsheet round-trips:
 *  - quoted fields with "" escapes, commas and line breaks inside quotes
 *  - CRLF or LF line endings, optional UTF-8 BOM
 *  - comma or semicolon delimiter (Excel uses ";" in many locales), detected from the header
 */

export function detectDelimiter(text: string): ',' | ';' {
  const firstLine = stripBom(text).split(/\r?\n/, 1)[0] ?? '';
  const count = (ch: string) => firstLine.split(ch).length - 1;
  return count(';') > count(',') ? ';' : ',';
}

export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const src = stripBom(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === '') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop blank lines (a lone empty field), common at the end of files.
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''));
}

/** Serialises rows; starts with a BOM so Excel opens the file as UTF-8. */
export function toCsv(rows: (string | number | boolean | null | undefined)[][]): string {
  const escape = (v: string | number | boolean | null | undefined) => {
    const s = v == null ? '' : String(v);
    // Leading = + - @ would run as a formula in Excel: prefix with a quote.
    const safe = /^[=+\-@]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return '﻿' + rows.map((r) => r.map(escape).join(',')).join('\r\n') + '\r\n';
}

function stripBom(text: string) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
