import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { PRODUCT_PHOTO_MAX_BYTES } from '@erp/shared';
import { Public } from '../../common/decorators/public.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/types/request-user';
import { ProductsService, Viewer } from './products.service';
import { ProductsImportService } from './products-import.service';
import { ProductPhotosService, UploadedPhoto } from './product-photos.service';
import { ImportProductsDto, ProductsQueryDto, SaveProductDto } from './catalog.dto';

function viewer(user: RequestUser, ip: string): Viewer {
  return { id: user.id, ip, canSeeCost: user.permissions.has('inventory.cost.view') };
}

@ApiTags('Products')
@ApiBearerAuth()
@Controller('products')
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly importer: ProductsImportService,
    private readonly photos: ProductPhotosService,
  ) {}

  @Get()
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'List / search products (name, reference, barcode)' })
  findAll(@Query() query: ProductsQueryDto, @CurrentUser() me: RequestUser, @Ip() ip: string) {
    return this.products.findAll(query, viewer(me, ip));
  }

  @Get('stats')
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'Catalog key figures (for the dashboard)' })
  stats() {
    return this.products.stats();
  }

  @Get('next-sku')
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Next automatic reference (shown as a hint in the form)' })
  async nextSku() {
    return { sku: await this.products.nextSku() };
  }

  @Get('export')
  @RequirePermissions('inventory.product.read')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="products.csv"')
  @ApiOperation({ summary: 'Export products as CSV (same filters as the list)' })
  export(@Query() query: ProductsQueryDto, @CurrentUser() me: RequestUser, @Ip() ip: string) {
    return this.products.exportCsv(query, viewer(me, ip));
  }

  @Post('import')
  @HttpCode(200)
  @RequirePermissions('inventory.product.write')
  @ApiOperation({
    summary: 'Import products from CSV (create or update by reference); dryRun only checks',
  })
  import(@Body() dto: ImportProductsDto, @CurrentUser() me: RequestUser, @Ip() ip: string) {
    return this.importer.import(dto.csv, dto.dryRun ?? false, viewer(me, ip));
  }

  @Get('labels')
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'Data for barcode labels: ?ids=uuid,uuid (products + packagings sold)' })
  labels(@Query('ids') ids = '') {
    const list = ids
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (list.length === 0 || list.length > 500 || !list.every((id) => uuid.test(id))) {
      throw new BadRequestException('ids: 1 to 500 product ids separated by commas');
    }
    return this.products.labels(list);
  }

  /**
   * Public on purpose: <img> tags cannot send the access token. File names are
   * random (128 bits) and only images are stored, so nothing can be guessed.
   */
  @Public()
  @Get('photos/:file')
  @ApiOperation({ summary: 'Product photo file' })
  photo(@Param('file') file: string, @Res() res: Response) {
    const path = this.photos.pathOf(file);
    if (!path) {
      res.status(404).end();
      return;
    }
    res.sendFile(path, { maxAge: '365d', immutable: true }, (err) => {
      if (err && !res.headersSent) res.status(404).end();
    });
  }

  @Post(':id/photo')
  @HttpCode(200)
  @RequirePermissions('inventory.product.write')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: PRODUCT_PHOTO_MAX_BYTES, files: 1 } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @ApiOperation({ summary: 'Upload / replace the product photo (JPG, PNG or WebP, 2 MB max)' })
  uploadPhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: UploadedPhoto | undefined,
    @CurrentUser() me: RequestUser,
    @Ip() ip: string,
  ) {
    return this.photos.upload(id, file, viewer(me, ip));
  }

  @Delete(':id/photo')
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Remove the product photo' })
  deletePhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() me: RequestUser,
    @Ip() ip: string,
  ) {
    return this.photos.delete(id, viewer(me, ip));
  }

  @Get(':id')
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'Get a product (purchase price only with inventory.cost.view)' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() me: RequestUser,
    @Ip() ip: string,
  ) {
    return this.products.findOne(id, viewer(me, ip));
  }

  @Post()
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Create a product' })
  create(@Body() dto: SaveProductDto, @CurrentUser() me: RequestUser, @Ip() ip: string) {
    return this.products.create(dto, viewer(me, ip));
  }

  @Patch(':id')
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Update a product (packagings are replaced when sent)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveProductDto,
    @CurrentUser() me: RequestUser,
    @Ip() ip: string,
  ) {
    return this.products.update(id, dto, viewer(me, ip));
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Deactivate a product (products are never deleted)' })
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() me: RequestUser,
    @Ip() ip: string,
  ) {
    return this.products.setActive(id, false, viewer(me, ip));
  }

  @Post(':id/activate')
  @HttpCode(200)
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Re-activate a product' })
  activate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() me: RequestUser,
    @Ip() ip: string,
  ) {
    return this.products.setActive(id, true, viewer(me, ip));
  }
}
