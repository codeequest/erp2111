import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import bwipjs from 'bwip-js';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../../prisma/prisma.service';

const MM = 72 / 25.4; // PDF points per millimetre

/** Value encoded in the barcode: the product barcode, or its SKU when it has none. */
const codeOf = (p: { barcode: string | null; sku: string }) => p.barcode || p.sku;

/** 13 digits → EAN-13, 12 digits → UPC-A, anything else → Code 128. */
function symbology(code: string): string {
  if (/^\d{13}$/.test(code)) return 'ean13';
  if (/^\d{12}$/.test(code)) return 'upca';
  return 'code128';
}

async function barcodePng(code: string): Promise<Buffer | null> {
  try {
    return await bwipjs.toBuffer({
      bcid: symbology(code),
      text: code,
      scale: 3,
      height: 12,
      includetext: true,
      textxalign: 'center',
      textsize: 9,
    });
  } catch {
    // e.g. an EAN-13 with a wrong check digit: fall back to Code 128
    try {
      return await bwipjs.toBuffer({ bcid: 'code128', text: code, scale: 3, height: 12, includetext: true });
    } catch {
      return null;
    }
  }
}

@Injectable()
export class ProductsLabelsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * A4 sheet of 3 × 8 labels (63.5 × 33.9 mm, the common "L7160" format): name, SKU,
   * prices in USD and TND, and the barcode. Ready to print on adhesive paper.
   */
  async pdf(filter: { categoryId?: string; active?: boolean } = {}): Promise<Buffer> {
    const where: Prisma.ProductWhereInput = { isActive: filter.active ?? true };
    if (filter.categoryId) {
      const all = await this.prisma.category.findMany({ select: { id: true, parentId: true } });
      const ids = new Set([filter.categoryId]);
      for (let grew = true; grew; ) {
        grew = false;
        for (const c of all)
          if (c.parentId && ids.has(c.parentId) && !ids.has(c.id)) ids.add(c.id), (grew = true);
      }
      where.categoryId = { in: [...ids] };
    }
    const products = await this.prisma.product.findMany({
      where,
      orderBy: [{ brand: 'asc' }, { name: 'asc' }],
    });

    const COLS = 3;
    const ROWS = 8;
    const W = 63.5 * MM;
    const H = 33.9 * MM;
    const MARGIN_X = 7.2 * MM;
    const MARGIN_Y = 13 * MM;
    const GAP_X = 2.5 * MM;

    const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: 'Barcode labels' } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

    if (products.length === 0) {
      doc.fontSize(12).text('No products to print.', MARGIN_X, MARGIN_Y);
    }

    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      const slot = i % (COLS * ROWS);
      if (i > 0 && slot === 0) doc.addPage();
      const x = MARGIN_X + (slot % COLS) * (W + GAP_X);
      const y = MARGIN_Y + Math.floor(slot / COLS) * H;

      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#000');
      doc.text(p.name, x + 4, y + 4, { width: W - 8, height: 11, ellipsis: true, lineBreak: false });
      doc.font('Helvetica').fontSize(7).fillColor('#444');
      doc.text(p.sku, x + 4, y + 15, { width: W - 8, lineBreak: false, ellipsis: true });

      const png = await barcodePng(codeOf(p));
      if (png) doc.image(png, x + 8, y + 23, { fit: [W - 16, H - 42], align: 'center' });

      const usd = Number(p.salePrice);
      const tnd = Number(p.salePriceTnd);
      const price = [tnd ? `${tnd.toLocaleString('fr-FR')} TND` : '', usd ? `$${usd.toLocaleString('en-US')}` : '']
        .filter(Boolean)
        .join('  |  ');
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#000');
      doc.text(price, x + 4, y + H - 13, { width: W - 8, align: 'right', lineBreak: false });
    }

    doc.end();
    return done;
  }
}
