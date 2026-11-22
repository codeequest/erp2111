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
  Put,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RequestUser } from '../../common/types/request-user';
import { SetPackUnitsDto } from './dto/catalog.dto';
import {
  CreateProductDto,
  ExportProductsQueryDto,
  ListProductsQueryDto,
  UpdateProductDto,
} from './dto/product.dto';
import { XLSX_MIME, isXlsx } from '../../common/xlsx';
import { ProductsService } from './products.service';
import { BulkProductDto, ImportQueryDto } from './dto/phase3.dto';
import { MAX_IMAGE_BYTES, ProductBulkService, UploadedFileData } from './product-bulk.service';
import { ProductHistoryService } from './product-history.service';
import { ProductTransferService } from './product-transfer.service';
import { PriceListsService } from './price-lists.service';
import { LabelsQueryDto } from './dto/price-list.dto';

const CSV_LIMIT_BYTES = 10 * 1024 * 1024;

const FILE_BODY = {
  schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
};

@ApiTags('Inventory · Products')
@ApiBearerAuth()
@Controller('inventory/products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly bulkService: ProductBulkService,
    private readonly historyService: ProductHistoryService,
    private readonly transferService: ProductTransferService,
    private readonly priceListsService: PriceListsService,
  ) {}

  @Get()
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'List / search products (paged)' })
  findAll(@Query() query: ListProductsQueryDto, @CurrentUser() user: RequestUser) {
    return this.productsService.findAll(query, user);
  }

  // Declared before ':id' so "lookups" is not parsed as an id.
  @Get('lookups')
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'Categories, units and tax rates for the product form' })
  lookups() {
    return this.productsService.lookups();
  }

  @Get('export')
  @RequirePermissions('inventory.product.read')
  @ApiOperation({
    summary: 'Download the products matching the list filters as CSV or Excel (format=xlsx)',
  })
  async export(@Query() query: ExportProductsQueryDto, @CurrentUser() user: RequestUser) {
    const date = new Date().toISOString().slice(0, 10);
    if (query.format === 'xlsx') {
      const file = await this.transferService.exportXlsx(query, user);
      return new StreamableFile(file, {
        type: XLSX_MIME,
        disposition: `attachment; filename="products-${date}.xlsx"`,
      });
    }
    const csv = await this.transferService.exportCsv(query, user);
    return new StreamableFile(Buffer.from(csv, 'utf8'), {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="products-${date}.csv"`,
    });
  }

  @Get('import-template')
  @RequirePermissions('inventory.product.write')
  @Header('Content-Type', XLSX_MIME)
  @Header('Content-Disposition', 'attachment; filename="products-template.xlsx"')
  @ApiOperation({ summary: 'Excel template for the product import (columns + one example row)' })
  async importTemplate() {
    return new StreamableFile(await this.transferService.importTemplateXlsx());
  }

  @Post('bulk')
  @HttpCode(200)
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Change category, adjust price or (de)activate many products' })
  bulk(@Body() dto: BulkProductDto, @CurrentUser() user: RequestUser) {
    return this.bulkService.bulk(dto, user);
  }

  @Get('labels')
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'Data for printing shelf labels (optionally with a price list)' })
  labels(@Query() query: LabelsQueryDto) {
    return this.priceListsService.labels(query);
  }

  @Get('barcode/:code')
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'Find the product (or pack size) a barcode belongs to' })
  findByBarcode(@Param('code') code: string, @CurrentUser() user: RequestUser) {
    return this.productsService.findByBarcode(code, user);
  }

  @Get(':id')
  @RequirePermissions('inventory.product.read')
  @ApiOperation({
    summary: 'Get a product with stock per warehouse (cost only with inventory.cost.view)',
  })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.productsService.findOne(id, user);
  }

  @Post()
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Create a product' })
  create(@Body() dto: CreateProductDto, @CurrentUser() user: RequestUser) {
    return this.productsService.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Update a product' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.productsService.update(id, dto, user);
  }

  @Get(':id/prices')
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'Prices of the product in every active price list' })
  prices(@Param('id', ParseUUIDPipe) id: string) {
    return this.priceListsService.pricesForProduct(id);
  }

  @Get(':id/history')
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'Change history of a product (latest 100 changes)' })
  history(@Param('id', ParseUUIDPipe) id: string) {
    return this.historyService.history(id);
  }

  @Post(':id/image')
  @HttpCode(200)
  @RequirePermissions('inventory.product.write')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES + 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody(FILE_BODY)
  @ApiOperation({ summary: 'Upload or replace the product photo (JPEG, PNG or WebP, max 2 MB)' })
  setImage(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: UploadedFileData | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.bulkService.setImage(id, file, user);
  }

  @Delete(':id/image')
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Remove the product photo' })
  removeImage(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.bulkService.removeImage(id, user);
  }

  @Put(':id/units')
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Replace the pack sizes of a product (e.g. 1 CTN = 24 PCS)' })
  setPackUnits(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetPackUnitsDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.productsService.setPackUnits(id, dto, user);
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Deactivate a product (products are never deleted)' })
  deactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.productsService.setActive(id, false, user);
  }

  @Post(':id/activate')
  @HttpCode(200)
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Re-activate a product' })
  activate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.productsService.setActive(id, true, user);
  }

  @Post('import')
  @HttpCode(200)
  @RequirePermissions('inventory.product.write')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: CSV_LIMIT_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody(FILE_BODY)
  @ApiOperation({
    summary:
      'Import products from CSV or Excel (.xlsx), matched by SKU. dryRun=true (default) only previews.',
  })
  import(
    @Query() query: ImportQueryDto,
    @UploadedFile() file: UploadedFileData | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    if (!file) throw new BadRequestException('Attach a CSV or Excel file in the "file" field');
    const name = file.originalname.toLowerCase();
    if (name.endsWith('.xls')) {
      throw new BadRequestException('Old .xls files are not supported: save the file as .xlsx');
    }
    if (name.endsWith('.xlsx') || isXlsx(file.buffer)) {
      return this.transferService.importXlsx(file.buffer, query.dryRun, user);
    }
    return this.transferService.importCsv(file.buffer.toString('utf8'), query.dryRun, user);
  }
}
