import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
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
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { diskStorage, memoryStorage } from 'multer';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RequestUser } from '../../common/types/request-user';
import { CreateProductDto, ListProductsQuery, UpdateProductDto } from './dto/product.dto';
import { InventoryService } from './inventory.service';
import { ProductsImportService } from './products-import.service';
import { ProductsLabelsService } from './products-labels.service';

export const UPLOAD_DIR = join(process.cwd(), 'uploads', 'products');
mkdirSync(UPLOAD_DIR, { recursive: true });

@ApiTags('Inventory · Products')
@Controller('inventory/products')
export class ProductsController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly importService: ProductsImportService,
    private readonly labelsService: ProductsLabelsService,
  ) {}

  @Get()
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'List / search products (scooters)' })
  findAll(@Query() q: ListProductsQuery, @CurrentUser() user: RequestUser) {
    return this.inventoryService.listProducts(q, user);
  }

  @Get('export/labels')
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'Printable PDF of barcode labels (optionally for one category)' })
  async labels(@Query('categoryId') categoryId: string | undefined, @Res() res: Response) {
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="barcode-labels.pdf"',
    });
    res.send(await this.labelsService.pdf({ categoryId: categoryId || undefined }));
  }

  // must stay above ':id' so "export" / "import" are not parsed as a UUID
  @Get('export')
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'Export all products to Excel (same format as the import)' })
  async exportXlsx(@Res() res: Response) {
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="products.xlsx"',
    });
    res.send(await this.importService.export());
  }

  @Get('import/template')
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Download the Excel import template' })
  async template(@Res() res: Response) {
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="products-template.xlsx"',
    });
    res.send(await this.importService.template());
  }

  @Get(':id')
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'Get a product (cost only with inventory.cost.view)' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.inventoryService.getProduct(id, user);
  }

  @Post()
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Create a product' })
  create(@Body() dto: CreateProductDto, @CurrentUser() user: RequestUser) {
    return this.inventoryService.createProduct(dto, user);
  }

  @Patch(':id')
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Update a product' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.inventoryService.updateProduct(id, dto, user);
  }

  @Post(':id/deactivate')
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Deactivate a product' })
  deactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.inventoryService.setProductActive(id, false, user);
  }

  @Post(':id/activate')
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Re-activate a product' })
  activate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.inventoryService.setProductActive(id, true, user);
  }

  @Post('import')
  @RequirePermissions('inventory.product.write')
  @UseInterceptors(
    FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 10_000_000 } }),
  )
  @ApiOperation({ summary: 'Import / update products from an Excel (.xlsx) file, matched by SKU' })
  import(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: RequestUser) {
    return this.importService.import(file, user);
  }

  @Post('image')
  @RequirePermissions('inventory.product.write')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: UPLOAD_DIR,
        filename: (_req, file, cb) =>
          cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`),
      }),
      limits: { fileSize: 5_000_000 },
      fileFilter: (_req, file, cb) =>
        /^image\/(png|jpe?g|webp|gif)$/.test(file.mimetype)
          ? cb(null, true)
          : cb(new BadRequestException('Only png, jpg, webp or gif images'), false),
    }),
  )
  @ApiOperation({ summary: 'Upload a product photo; returns its public imageUrl' })
  uploadImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Image file is required (field "file")');
    return { imageUrl: `/api/v1/uploads/products/${file.filename}` };
  }
}
