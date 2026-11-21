import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { PRODUCT_PHOTO_MAX_BYTES, ProductDetail } from '@erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../core/audit/audit.service';
import { ProductsService, Viewer } from './products.service';

/** The part of a multer file we use (avoids depending on @types/multer). */
export interface UploadedPhoto {
  buffer: Buffer;
  size: number;
}

/** Detect the real image type from its first bytes — never trust the file name. */
function detectImage(buf: Buffer): 'jpg' | 'png' | 'webp' | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (
    buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'png';
  }
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

/** File names we generate: 32 hex chars + extension. Anything else is refused. */
export const PHOTO_FILE_PATTERN = /^[a-f0-9]{32}\.(jpg|png|webp)$/;

@Injectable()
export class ProductPhotosService implements OnModuleInit {
  readonly dir: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly products: ProductsService,
    config: ConfigService,
  ) {
    this.dir = join(resolve(config.get<string>('UPLOAD_DIR', 'uploads')), 'products');
  }

  async onModuleInit() {
    await mkdir(this.dir, { recursive: true });
  }

  async upload(
    id: string,
    file: UploadedPhoto | undefined,
    viewer: Viewer,
  ): Promise<ProductDetail> {
    if (!file) throw new BadRequestException('No file received');
    if (file.size > PRODUCT_PHOTO_MAX_BYTES)
      throw new BadRequestException('Photo too large (2 MB maximum)');
    const ext = detectImage(file.buffer);
    if (!ext) throw new BadRequestException('Unsupported image (JPG, PNG or WebP only)');

    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');

    // Random name: the photo URL is public, it must not be guessable.
    const name = `${randomBytes(16).toString('hex')}.${ext}`;
    await writeFile(join(this.dir, name), file.buffer);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.product.update({ where: { id }, data: { photoFile: name } });
        await this.audit.log(
          viewer,
          {
            action: 'update',
            entity: 'Product',
            entityId: id,
            before: { photo: product.photoFile },
            after: { photo: name },
          },
          tx,
        );
      });
    } catch (err) {
      await this.remove(name);
      throw err;
    }
    if (product.photoFile) await this.remove(product.photoFile);
    return this.products.findOne(id, viewer);
  }

  async delete(id: string, viewer: Viewer): Promise<ProductDetail> {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');
    if (product.photoFile) {
      await this.prisma.$transaction(async (tx) => {
        await tx.product.update({ where: { id }, data: { photoFile: null } });
        await this.audit.log(
          viewer,
          {
            action: 'update',
            entity: 'Product',
            entityId: id,
            before: { photo: product.photoFile },
            after: { photo: null },
          },
          tx,
        );
      });
      await this.remove(product.photoFile);
    }
    return this.products.findOne(id, viewer);
  }

  /** Absolute path of a stored photo, or null if the name is not one of ours. */
  pathOf(file: string): string | null {
    return PHOTO_FILE_PATTERN.test(file) ? join(this.dir, file) : null;
  }

  private async remove(file: string) {
    const path = this.pathOf(file);
    if (path) await unlink(path).catch(() => undefined);
  }
}
