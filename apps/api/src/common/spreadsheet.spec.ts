import { Workbook } from 'exceljs';
import { readTable, toXlsx } from './spreadsheet';

describe('spreadsheet (Excel import / export)', () => {
  it('writes an .xlsx file and reads it back', async () => {
    const buffer = await toXlsx(
      'Products',
      [{ header: 'sku' }, { header: 'name' }, { header: 'qty', numeric: true }],
      [
        ['001', 'Thé vert شاي', '12.5'],
        ['=HYPERLINK("x")', null, '3'],
      ],
    );
    expect(buffer.subarray(0, 2).toString()).toBe('PK'); // a real .xlsx (zip) file

    const wb = new Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    expect(ws.name).toBe('Products');
    expect(ws.getCell('C2').value).toBe(12.5); // numeric column → a number Excel can sum
    expect(ws.getCell('A2').value).toBe('001'); // SKU keeps its leading zeros
    expect(ws.getCell('A3').value).toBe('=HYPERLINK("x")'); // text, never a formula

    expect(await readTable({ buffer, originalname: 'p.xlsx' })).toEqual([
      ['sku', 'name', 'qty'],
      ['001', 'Thé vert شاي', '12.5'],
      ['=HYPERLINK("x")', '', '3'],
    ]);
  });

  it('reads numbers, formulas and dates typed in Excel', async () => {
    const wb = new Workbook();
    const ws = wb.addWorksheet('S');
    ws.addRow(['sku', 'qty', 'total', 'date']);
    ws.addRow(['A', 0.1 + 0.2, { formula: 'B2*2', result: 0.6 }, new Date(Date.UTC(2026, 10, 28))]);
    ws.addRow([]);
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    expect(await readTable({ buffer, originalname: 'x.xlsx' })).toEqual([
      ['sku', 'qty', 'total', 'date'],
      ['A', '0.3', '0.6', '2026-11-28'],
    ]);
  });

  it('still accepts CSV files, with decimal commas in ";" files', async () => {
    const csv = Buffer.from('﻿sku;qty\nA;12,5\n\nB;3\n');
    expect(await readTable({ buffer: csv, originalname: 'old.csv' })).toEqual([
      ['sku', 'qty'],
      ['A', '12.5'],
      ['B', '3'],
    ]);
  });

  it('refuses old .xls files and broken .xlsx files with a clear message', async () => {
    await expect(readTable({ buffer: Buffer.from([0xd0, 0xcf, 0x11, 0xe0]), originalname: 'old.xls' })).rejects.toThrow(
      /save the file as \.xlsx/,
    );
    await expect(readTable({ buffer: Buffer.from('PK\u0003\u0004broken'), originalname: 'b.xlsx' })).rejects.toThrow(
      /not a valid Excel/,
    );
  });
});
