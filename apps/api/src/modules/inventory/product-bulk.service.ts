import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BulkProductResult, ProductDetail } from '@erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestUser } from '../../common/types/request-user';
import { audit } from '../../common/audit';
import { BulkProductDto } from './dto/phase3.dto';
import { ProductsService } from './products.service';

/** The parts of an uploaded file we use (multer's file object). */
export interface UploadedFileData {
  buffer: Buffer;
  size: number;
  mimetype: string;
  originalname: string;
}

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** Where product images are stored. Override with UPLOAD_DIR. */
export function productImageDir() {
  return join(process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads'), 'products');
}

/** Stored image names are random: <uuid>.<ext>. Anything else is rejected. */
export const IMAGE_FILE_PATTERN = /^[0-9a-f-]{36}\.(jpg|png|webp)$/;

/**
 * Detects the real image type from the first bytes instead of trusting the
 * browser-supplied mimetype or file name. Exported for tests.
 */
export function sniffImageType(buf: Buffer): 'jpg' | 'png' | 'webp' | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (
    buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return 'png';
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  )
    return 'webp';
  return null;
}

/** Bulk actions on many products, and product images. */
@Injectable()
export class ProductBulkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
  ) {}

  // ── Bulk actions ───────────────────────────────────────────────────────────

  async bulk(dto: BulkProductDto, user: RequestUser): Promise<BulkProductResult> {
    const ids = [...new Set(dto.ids)];
    const rows = await this.prisma.product.findMany({ where: { id: { in: ids } } });
    if (rows.length !== ids.length) throw new NotFoundException('Some products no longer exist');

    let categoryId: string | null = null;
    let factor: Prisma.Decimal | null = null;
    switch (dto.action) {
      case 'setCategory':
        if (dto.categoryId === undefined) throw new BadRequestException('categoryId is required');
        categoryId = dto.categoryId;
        if (categoryId && !(await this.prisma.category.count({ where: { id: categoryId } }))) {
          throw new BadRequestException('Category not found');
        }
        break;
      case 'adjustPrice':
        if (!dto.percent) throw new BadRequestException('percent is required');
        factor = new Prisma.Decimal(dto.percent).div(100).add(1);
        if (factor.lte(0.1) || factor.gt(11)) {
          throw new BadRequestException('percent must be between -90 and 1000');
        }
        break;
    }

    let updated = 0;
    await this.prisma.$transaction(
      async (tx) => {
        for (const p of rows) {
          let data: Prisma.ProductUpdateInput | null = null;
          let before: Prisma.InputJsonObject = {};
          let after: Prisma.InputJsonObject = {};

          if (dto.action === 'activate' || dto.action === 'deactivate') {
            const isActive = dto.action === 'activate';
            if (p.isActive !== isActive) {
              data = { isActive };
              before = { isActive: p.isActive };
              after = { isActive };
            }
          } else if (dto.action === 'setCategory') {
            if (p.categoryId !== categoryId) {
              data = {
                category: categoryId ? { connect: { id: categoryId } } : { disconnect: true },
              };
              before = { categoryId: p.categoryId };
              after = { categoryId };
            }
          } else if (factor) {
            const price = p.salePrice.mul(factor).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
            if (!price.eq(p.salePrice)) {
              data = { salePrice: price };
              before = { salePrice: p.salePrice.toString() };
              after = { salePrice: price.toString() };
            }
          }

          if (data) {
            await tx.product.update({ where: { id: p.id }, data });
            await audit(tx, user, `bulk ${dto.action}`, 'Product', p.id, before, after);
            updated++;
          }
        }
      },
      { timeout: 60_000 },
    );
    return { updated, skipped: rows.length - updated };
  }

  // ── Images ─────────────────────────────────────────────────────────────────

  async setImage(
    id: string,
    file: UploadedFileData | undefined,
    user: RequestUser,
  ): Promise<ProductDetail> {
    if (!file) throw new BadRequestException('Attach an image in the "file" field');
    if (file.size > MAX_IMAGE_BYTES)
      throw new BadRequestException('The image must be 2 MB or smaller');
    const ext = sniffImageType(file.buffer);
    if (!ext) throw new BadRequestException('Only JPEG, PNG or WebP images are accepted');

    const product = await this.products.getOrThrow(id);
    const dir = productImageDir();
    await mkdir(dir, { recursive: true });
    const name = `${randomUUID()}.${ext}`;
    await writeFile(join(dir, name), file.buffer);

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.product.update({ where: { id }, data: { imageFile: name } });
        await audit(
          tx,
          user,
          'update',
          'Product',
          id,
          { image: product.imageFile ? 'photo' : null },
          { image: 'new photo' },
        );
      });
    } catch (e) {
      await unlink(join(dir, name)).catch(() => undefined);
      throw e;
    }
    if (product.imageFile) await unlink(join(dir, product.imageFile)).catch(() => undefined);
    return this.products.findOne(id, user);
  }

  async removeImage(id: string, user: RequestUser): Promise<ProductDetail> {
    const product = await this.products.getOrThrow(id);
    if (product.imageFile) {
      await this.prisma.$transaction(async (tx) => {
        await tx.product.update({ where: { id }, data: { imageFile: null } });
        await audit(tx, user, 'update', 'Product', id, { image: 'photo' }, { image: null });
      });
      await unlink(join(productImageDir(), product.imageFile)).catch(() => undefined);
    }
    return this.products.findOne(id, user);
  }
}
