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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { notImplemented } from '../../common/not-implemented';
import { RequestUser } from '../../common/types/request-user';
import { CreateProductDto, ListProductsQueryDto, UpdateProductDto } from './dto/product.dto';
import { InventoryService, MAX_IMAGE_BYTES, UploadedImage } from './inventory.service';

@ApiTags('Inventory · Products')
@Controller('inventory/products')
export class ProductsController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'List / search products (with stock status and low-stock counts)' })
  findAll(@Query() query: ListProductsQueryDto, @CurrentUser() user: RequestUser) {
    return this.inventoryService.listProducts(query, user);
  }

  // Declared before ':id' so "options" is not parsed as an id.
  @Get('options')
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'Categories, units, VAT rates and warehouses for the product form' })
  options(@CurrentUser() user: RequestUser) {
    return this.inventoryService.productFormOptions(user);
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
  @HttpCode(200)
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Deactivate a product' })
  deactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.inventoryService.setProductActive(id, false, user);
  }

  @Post(':id/activate')
  @HttpCode(200)
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Re-activate a product' })
  activate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.inventoryService.setProductActive(id, true, user);
  }

  @Post(':id/image')
  @HttpCode(200)
  @RequirePermissions('inventory.product.write')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @ApiOperation({ summary: 'Upload the product image (JPEG, PNG, WebP or GIF, max 2 MB)' })
  uploadImage(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: UploadedImage | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.inventoryService.saveProductImage(id, file, user);
  }

  @Delete(':id/image')
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Remove the product image' })
  removeImage(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.inventoryService.removeProductImage(id, user);
  }

  /** Public so <img> tags can load it; file names are unguessable (uuid + timestamp). */
  @Public()
  @Get(':id/image/:file')
  @ApiOperation({ summary: 'Product image file' })
  async image(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('file') file: string,
    @Res() res: Response,
  ) {
    const path = await this.inventoryService.productImagePath(id, file);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(path);
  }

  @Post('import')
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Import products from CSV' })
  import() {
    return notImplemented('Inventory · Products: Import products from CSV');
  }
}
