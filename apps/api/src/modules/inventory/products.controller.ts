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
  Put,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { notImplemented } from '../../common/not-implemented';
import { RequestUser } from '../../common/types/request-user';
import {
  CreateProductDto,
  GenerateVariantsDto,
  ListProductsQueryDto,
  ProductStatsQueryDto,
  SetPricesDto,
  UpdateProductDto,
} from './dto/product.dto';
import { ProductsService } from './products.service';
import {
  MAX_IMAGE_BYTES,
  MAX_IMAGES_PER_PRODUCT,
  ProductImagesService,
} from './product-images.service';

@ApiTags('Inventory · Products')
@Controller('inventory/products')
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly images: ProductImagesService,
  ) {}

  @Get()
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'List / search products' })
  findAll(@Query() query: ListProductsQueryDto, @CurrentUser() user: RequestUser) {
    return this.products.findAll(query, user);
  }

  // Declared before ':id' so "form-options" is not read as an id.
  @Get('form-options')
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'Categories, units, tax rates, price lists and warehouses for forms' })
  formOptions() {
    return this.products.formOptions();
  }

  @Get(':id')
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'Get a product (cost only with inventory.cost.view)' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.products.findOne(id, user);
  }

  @Get(':id/stats')
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'Product KPIs: stock, units sold, revenue, margin, coverage' })
  stats(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ProductStatsQueryDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.products.stats(id, Math.min(query.days ?? 30, 365), user);
  }

  @Post()
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Create a product (with variants when hasVariants is true)' })
  create(@Body() dto: CreateProductDto, @CurrentUser() user: RequestUser) {
    return this.products.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Update a product (a parent passes shared fields to its variants)' })
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
  @ApiOperation({ summary: 'Deactivate a product (and its variants)' })
  deactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.products.setActive(id, false, user);
  }

  @Post(':id/activate')
  @HttpCode(200)
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Re-activate a product (and its variants)' })
  activate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.products.setActive(id, true, user);
  }

  @Post(':id/variants')
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Add option values and create the missing variants' })
  generateVariants(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GenerateVariantsDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.products.generateVariants(id, dto, user);
  }

  @Put(':id/prices')
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Set the price-list prices of a product (null removes a price)' })
  setPrices(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetPricesDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.products.setPrices(id, dto, user);
  }

  @Post(':id/images')
  @RequirePermissions('inventory.product.write')
  @UseInterceptors(
    FilesInterceptor('files', MAX_IMAGES_PER_PRODUCT, { limits: { fileSize: MAX_IMAGE_BYTES } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { files: { type: 'array', items: { type: 'string', format: 'binary' } } },
    },
  })
  @ApiOperation({ summary: 'Upload images (JPEG, PNG, WebP, GIF — 5 MB each, 10 per product)' })
  uploadImages(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: RequestUser,
  ) {
    return this.images.upload(id, files, user);
  }

  @Post(':id/images/:imageId/main')
  @HttpCode(200)
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Make an image the main picture' })
  setMainImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.images.setMain(id, imageId, user);
  }

  @Delete(':id/images/:imageId')
  @HttpCode(204)
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Delete an image' })
  removeImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.images.remove(id, imageId, user);
  }

  @Post('import')
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Import products from CSV' })
  import() {
    return notImplemented('Inventory · Products: Import products from CSV');
  }
}
