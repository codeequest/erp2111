import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../core/audit/audit.service';
import { RequestUser } from '../../common/types/request-user';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGES_PER_PRODUCT = 10;
export const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

/** Public URL of an uploaded file (the web app proxies /api/* to the API). */
export function imageUrl(path: string): string {
  return `/api/v1/uploads/${path}`;
}

/** Absolute upload directory, from UPLOAD_DIR (default: ./uploads next to the API). */
export function uploadRoot(config: ConfigService): string {
  return resolve(config.get<string>('UPLOAD_DIR', 'uploads'));
}

/** Checks the real file signature, not only the declared MIME type. */
function sniffImageType(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return 'image/png';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP')
    return 'image/webp';
  if (buf.length >= 6 && /^GIF8[79]a$/.test(buf.toString('ascii', 0, 6))) return 'image/gif';
  return null;
}

@Injectable()
export class ProductImagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  async upload(productId: string, files: Express.Multer.File[], user: RequestUser) {
    if (!files?.length) throw new BadRequestException('No file received (field name: "files")');

    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { _count: { select: { images: true } } },
    });
    if (!product) throw new NotFoundException('Product not found');
    if (product._count.images + files.length > MAX_IMAGES_PER_PRODUCT) {
      throw new BadRequestException(`A product can have at most ${MAX_IMAGES_PER_PRODUCT} images`);
    }

    const checked = files.map((f) => {
      const type = sniffImageType(f.buffer);
      if (!type) throw new BadRequestException(`${f.originalname}: only JPEG, PNG, WebP or GIF images`);
      return { file: f, type };
    });

    const root = uploadRoot(this.config);
    const written: string[] = [];
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        let hasMain = (await tx.productImage.count({ where: { productId, isMain: true } })) > 0;
        let order = product._count.images;
        const rows = [];
        for (const { file, type } of checked) {
          const rel = `products/${productId}/${randomUUID()}${IMAGE_TYPES[type]}`;
          const abs = join(root, rel);
          await mkdir(dirname(abs), { recursive: true });
          await writeFile(abs, file.buffer);
          written.push(abs);
          rows.push(
            await tx.productImage.create({
              data: {
                productId,
                path: rel,
                fileName: file.originalname.slice(0, 200),
                mimeType: type,
                size: file.size,
                isMain: !hasMain,
                sortOrder: order++,
              },
            }),
          );
          hasMain = true;
        }
        await this.audit.record(
          {
            userId: user.id,
            action: 'add-images',
            entity: 'Product',
            entityId: productId,
            after: rows.map((r) => ({ id: r.id, fileName: r.fileName })),
          },
          tx,
        );
        return rows;
      });
      return created.map((r) => ({ id: r.id, url: imageUrl(r.path), isMain: r.isMain }));
    } catch (e) {
      // Don't leave orphan files when the database part fails.
      await Promise.all(written.map((p) => unlink(p).catch(() => undefined)));
      throw e;
    }
  }

  async setMain(productId: string, imageId: string, user: RequestUser) {
    const image = await this.find(productId, imageId);
    await this.prisma.$transaction(async (tx) => {
      await tx.productImage.updateMany({ where: { productId }, data: { isMain: false } });
      await tx.productImage.update({ where: { id: image.id }, data: { isMain: true } });
      await this.audit.record(
        { userId: user.id, action: 'set-main-image', entity: 'Product', entityId: productId, after: { imageId } },
        tx,
      );
    });
    return { id: imageId, isMain: true };
  }

  async remove(productId: string, imageId: string, user: RequestUser) {
    const image = await this.find(productId, imageId);
    await this.prisma.$transaction(async (tx) => {
      await tx.productImage.delete({ where: { id: image.id } });
      if (image.isMain) {
        const next = await tx.productImage.findFirst({
          where: { productId },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        });
        if (next) await tx.productImage.update({ where: { id: next.id }, data: { isMain: true } });
      }
      await this.audit.record(
        {
          userId: user.id,
          action: 'remove-image',
          entity: 'Product',
          entityId: productId,
          before: { id: image.id, fileName: image.fileName },
        },
        tx,
      );
    });
    await unlink(join(uploadRoot(this.config), image.path)).catch(() => undefined);
  }

  private async find(productId: string, imageId: string) {
    const image = await this.prisma.productImage.findFirst({ where: { id: imageId, productId } });
    if (!image) throw new NotFoundException('Image not found');
    return image;
  }
}
