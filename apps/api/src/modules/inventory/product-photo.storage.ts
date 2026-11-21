import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { detectImageType } from './product.rules';

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/**
 * Stores product photos on the server disk, in UPLOAD_DIR/products
 * (default: apps/api/uploads/products, git-ignored).
 * Files are named <productId>-<random>.<ext>; the name is never taken from the user.
 * Swap this class for S3 / object storage later without touching the rest.
 */
@Injectable()
export class ProductPhotoStorage {
  private readonly logger = new Logger(ProductPhotoStorage.name);
  private readonly dir: string;

  constructor(config: ConfigService) {
    this.dir = join(resolve(config.get<string>('UPLOAD_DIR', 'uploads')), 'products');
  }

  /** Validates the bytes are a JPEG / PNG / WebP image, writes it, returns the file name. */
  async save(productId: string, data: Buffer): Promise<string> {
    if (data.length === 0) throw new BadRequestException('The photo file is empty');
    if (data.length > MAX_PHOTO_BYTES)
      throw new BadRequestException('The photo must be 5 MB or less');
    const type = detectImageType(data);
    if (!type) throw new BadRequestException('The photo must be a JPEG, PNG or WebP image');

    await mkdir(this.dir, { recursive: true });
    const fileName = `${productId}-${randomUUID().slice(0, 8)}.${type.ext}`;
    await writeFile(this.pathOf(fileName), data);
    return fileName;
  }

  async open(fileName: string) {
    const path = this.pathOf(fileName);
    const info = await stat(path).catch(() => null);
    if (!info) throw new NotFoundException('Photo file is missing on the server');
    const ext = fileName.split('.').pop() ?? '';
    return {
      stream: createReadStream(path),
      mime: MIME_BY_EXT[ext] ?? 'application/octet-stream',
      size: info.size,
    };
  }

  /** Best effort: a missing file is not an error. */
  async remove(fileName: string): Promise<void> {
    await unlink(this.pathOf(fileName)).catch((e: NodeJS.ErrnoException) => {
      if (e.code !== 'ENOENT') this.logger.warn(`Could not delete photo ${fileName}: ${e.message}`);
    });
  }

  /** basename() guards against path traversal even if a bad value reached the database. */
  private pathOf(fileName: string): string {
    return join(this.dir, basename(fileName));
  }
}
