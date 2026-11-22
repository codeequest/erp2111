import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type {
  Paginated,
  ProductDetail,
  ProductFormOptions,
  ProductImportResult,
  ProductListItem,
} from '@erp/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RequestUser } from '../../common/types/request-user';
import { CatalogService } from './catalog.service';
import {
  CreateProductDto,
  ExportProductsQueryDto,
  ListProductsQueryDto,
  UpdateProductDto,
} from './dto/product.dto';
import { ProductsExcelService } from './products-excel.service';
import { ProductsService } from './products.service';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

@ApiTags('Inventory · Products')
@Controller('inventory/products')
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly catalog: CatalogService,
    private readonly excel: ProductsExcelService,
  ) {}

  @Get()
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'List / search products' })
  findAll(
    @Query() query: ListProductsQueryDto,
    @CurrentUser() user: RequestUser,
  ): Promise<Paginated<ProductListItem>> {
    return this.products.findAll(query, user);
  }

  // Declared before ':id' so "form-options" is not parsed as an id.
  @Get('form-options')
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'Units, active categories and active tax rates for the product form' })
  formOptions(): Promise<ProductFormOptions> {
    return this.catalog.formOptions();
  }

  // Declared before ':id' so "export" is not parsed as an id.
  @Get('export')
  @RequirePermissions('inventory.product.read')
  @ApiOperation({
    summary:
      'Export the products matching the list filters to Excel (cost only with inventory.cost.view)',
  })
  @ApiProduces(XLSX_MIME)
  async export(
    @Query() query: ExportProductsQueryDto,
    @CurrentUser() user: RequestUser,
  ): Promise<StreamableFile> {
    const file = await this.excel.export(query, user);
    const date = new Date().toISOString().slice(0, 10);
    return new StreamableFile(file, {
      type: XLSX_MIME,
      disposition: `attachment; filename="products-${date}.xlsx"`,
      length: file.length,
    });
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

  @Post()
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Create a product' })
  create(@Body() dto: CreateProductDto, @CurrentUser() user: RequestUser): Promise<ProductDetail> {
    return this.products.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Update a product' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ProductDetail> {
    return this.products.update(id, dto, user);
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Deactivate a product (products are never deleted)' })
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

  @Post('import')
  @HttpCode(200)
  @RequirePermissions('inventory.product.write')
  @ApiOperation({
    summary: 'Import products from Excel: creates new SKUs, updates existing ones (all-or-nothing)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_BYTES, files: 1 } }))
  import(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: RequestUser,
  ): Promise<ProductImportResult> {
    if (!file) throw new BadRequestException('Attach an Excel (.xlsx) file in the "file" field');
    if (!file.originalname.toLowerCase().endsWith('.xlsx')) {
      throw new BadRequestException('Only Excel .xlsx files are supported');
    }
    return this.excel.import(file.buffer, user);
  }
}
