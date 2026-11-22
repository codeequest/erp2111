import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Public } from '../../common/decorators/public.decorator';
import { IMAGE_FILE_PATTERN, productImageDir } from './product-bulk.service';

/**
 * Serves product photos. Public so that <img> tags work without a token:
 * file names are random UUIDs and a photo reveals nothing sensitive.
 */
@ApiExcludeController()
@Controller('inventory/product-images')
export class ProductImagesController {
  @Public()
  @Get(':file')
  serve(@Param('file') file: string, @Res() res: Response) {
    const path = join(productImageDir(), file);
    if (!IMAGE_FILE_PATTERN.test(file) || !existsSync(path)) {
      throw new NotFoundException('Image not found');
    }
    // A new upload always gets a new name, so the file never changes.
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(path);
  }
}
