import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/types/request-user';
import { notImplemented } from '../../common/not-implemented';
import { ProductsService } from './products.service';
import { CreateProductDto, ListProductsQueryDto, UpdateProductDto } from './dto/product.dto';
import { MAX_PHOTO_BYTES } from './product-photo.storage';

/** The part of a multer file we use (avoids depending on @types/multer). */
interface UploadedImage {
  buffer: Buffer;
  size: number;
}

@ApiTags('Inventory · Products')
@Controller('inventory/products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'List / search products (paged; cost only with inventory.cost.view)' })
  findAll(@Query() query: ListProductsQueryDto, @CurrentUser() user: RequestUser) {
    return this.products.findAll(query, user);
  }

  @Get(':id')
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'Get a product (cost only with inventory.cost.view)' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.products.findOne(id, user);
  }

  @Post()
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Create a product (empty sku = next automatic code)' })
  create(@Body() dto: CreateProductDto, @CurrentUser() user: RequestUser) {
    return this.products.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions('inventory.product.write')
  @ApiOperation({
    summary: 'Update a product (base unit and tracking locked once stock has moved)',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.products.update(id, dto, user);
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Deactivate a product (soft-delete, kept in history)' })
  deactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.products.setActive(id, false, user);
  }

  @Post(':id/activate')
  @HttpCode(200)
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Reactivate a product' })
  activate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.products.setActive(id, true, user);
  }

  // ─────────────── Photo ───────────────

  @Get(':id/photo')
  @RequirePermissions('inventory.product.read')
  @Header('Cache-Control', 'private, max-age=31536000, immutable')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({ summary: 'Download the product photo' })
  async getPhoto(@Param('id', ParseUUIDPipe) id: string) {
    const photo = await this.products.getPhoto(id);
    return new StreamableFile(photo.stream, { type: photo.mime, length: photo.size });
  }

  @Post(':id/photo')
  @HttpCode(200)
  @RequirePermissions('inventory.product.write')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_PHOTO_BYTES, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiOperation({ summary: 'Upload / replace the product photo (JPEG, PNG or WebP, max 5 MB)' })
  uploadPhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: UploadedImage | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    if (!file) throw new BadRequestException('Send the image in a form field named "file"');
    return this.products.setPhoto(id, file.buffer, user);
  }

  @Delete(':id/photo')
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Remove the product photo' })
  removePhoto(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.products.removePhoto(id, user);
  }

  @Post('import')
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Import products from CSV' })
  import() {
    // Next iteration: validate every row first, then import all-or-nothing in one transaction.
    return notImplemented('Inventory · Products: Import products from CSV');
  }
}
