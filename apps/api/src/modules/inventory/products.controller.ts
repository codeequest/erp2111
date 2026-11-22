import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type {
  BulkResult,
  DeactivationCheck,
  ImportPreview,
  ImportResult,
  Paginated,
  ProductDetail,
  ProductHistoryEntry,
  ProductListItem,
  ProductStockDto,
} from '@erp/shared';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../common/types/request-user';
import {
  BulkProductActionDto,
  CreateProductDto,
  ImportProductsDto,
  ProductQueryDto,
  UpdateProductDto,
} from './products/dto/product.dto';
import { ProductsService, type UploadedImage } from './products/products.service';
import { MAX_IMPORT_BYTES, ProductImportService } from './products/product-import.service';

const fileBody = {
  schema: {
    type: 'object',
    properties: {
      file: { type: 'string', format: 'binary' },
      mode: { type: 'string', enum: ['create', 'update', 'upsert'] },
    },
  },
};

function sendCsv(res: Response, name: string, csv: string): StreamableFile {
  const date = new Date().toISOString().slice(0, 10);
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${name}_${date}.csv"`,
  });
  return new StreamableFile(Buffer.from(csv, 'utf-8'));
}

@ApiTags('Inventory · Products')
@Controller('inventory/products')
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly importer: ProductImportService,
  ) {}

  @Get()
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'List / search products (paginated, filters, sort)' })
  findAll(
    @Query() query: ProductQueryDto,
    @CurrentUser() user: RequestUser,
  ): Promise<Paginated<ProductListItem>> {
    return this.products.findAll(query, user);
  }

  @Get('export')
  @RequirePermissions('inventory.product.read')
  @ApiOperation({
    summary:
      'Export the filtered products as CSV (re-importable; cost only with inventory.cost.view)',
  })
  @ApiProduces('text/csv')
  async export(
    @Query() query: ProductQueryDto,
    @CurrentUser() user: RequestUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return sendCsv(res, 'products', await this.products.exportCsv(query, user));
  }

  @Get('import/template')
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Download the CSV import template' })
  @ApiProduces('text/csv')
  template(
    @CurrentUser() user: RequestUser,
    @Res({ passthrough: true }) res: Response,
  ): StreamableFile {
    return sendCsv(res, 'products_import_template', this.importer.template(user));
  }

  @Post('import/preview')
  @HttpCode(200)
  @RequirePermissions('inventory.product.write')
  @ApiOperation({
    summary: 'Check a CSV file without saving anything: row-by-row errors and what would happen',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody(fileBody)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_BYTES + 1 } }))
  importPreview(
    @UploadedFile() file: UploadedImage | undefined,
    @Body() dto: ImportProductsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ImportPreview> {
    return this.importer.preview(file?.buffer, dto.mode ?? 'create', user);
  }

  @Post('import')
  @RequirePermissions('inventory.product.write')
  @ApiOperation({
    summary: 'Import products from CSV — all or nothing: any error and nothing is saved',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody(fileBody)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_BYTES + 1 } }))
  import(
    @UploadedFile() file: UploadedImage | undefined,
    @Body() dto: ImportProductsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ImportResult> {
    return this.importer.run(file?.buffer, dto.mode ?? 'create', user);
  }

  @Post('bulk')
  @HttpCode(200)
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Activate, deactivate or change the category of many products' })
  bulk(@Body() dto: BulkProductActionDto, @CurrentUser() user: RequestUser): Promise<BulkResult> {
    return this.products.bulk(dto, user);
  }

  @Get(':id')
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'Get a product (cost only with inventory.cost.view)' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ProductDetail> {
    return this.products.findOne(id, user);
  }

  @Get(':id/stock')
  @RequirePermissions('inventory.product.read', 'inventory.stock.read')
  @ApiOperation({ summary: 'Stock per warehouse and the last 20 movements of a product' })
  stock(@Param('id', ParseUUIDPipe) id: string): Promise<ProductStockDto> {
    return this.products.getStock(id);
  }

  @Get(':id/history')
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'Who created / changed the product and when (field names only)' })
  history(@Param('id', ParseUUIDPipe) id: string): Promise<ProductHistoryEntry[]> {
    return this.products.getHistory(id);
  }

  @Post()
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Create a product' })
  create(@Body() dto: CreateProductDto, @CurrentUser() user: RequestUser): Promise<ProductDetail> {
    return this.products.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Update a product (send expectedUpdatedAt to detect concurrent edits)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ProductDetail> {
    return this.products.update(id, dto, user);
  }

  @Get(':id/deactivation-check')
  @RequirePermissions('inventory.product.read')
  @ApiOperation({
    summary: 'Stock on hand and open orders — shown as a warning before deactivating',
  })
  deactivationCheck(@Param('id', ParseUUIDPipe) id: string): Promise<DeactivationCheck> {
    return this.products.deactivationCheck(id);
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Deactivate a product (products are never deleted; history is kept)' })
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ProductDetail> {
    return this.products.setActive(id, false, user);
  }

  @Post(':id/activate')
  @HttpCode(200)
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Re-activate a product' })
  activate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ProductDetail> {
    return this.products.setActive(id, true, user);
  }

  @Get(':id/image')
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'Product picture' })
  async image(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const img = await this.products.getImage(id);
    res.set({ 'Content-Type': img.mimeType, 'Cache-Control': 'private, no-cache' });
    return new StreamableFile(img.data);
  }

  @Post(':id/image')
  @HttpCode(204)
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Upload / replace the picture (PNG, JPEG, WebP, GIF — max 2 MB)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 + 1 } }))
  async uploadImage(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: UploadedImage | undefined,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.products.setImage(id, file, user);
  }

  @Delete(':id/image')
  @HttpCode(204)
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Remove the picture' })
  async removeImage(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.products.removeImage(id, user);
  }
}
