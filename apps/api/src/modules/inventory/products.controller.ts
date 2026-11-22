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
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Paginated, ProductDetail, ProductFormOptions, ProductListItem } from '@erp/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { notImplemented } from '../../common/not-implemented';
import { RequestUser } from '../../common/types/request-user';
import { CatalogService } from './catalog.service';
import { CreateProductDto, ListProductsQueryDto, UpdateProductDto } from './dto/product.dto';
import { ProductsService } from './products.service';

@ApiTags('Inventory · Products')
@Controller('inventory/products')
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly catalog: CatalogService,
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
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Import products from CSV (not built yet)' })
  import() {
    return notImplemented('Inventory · Products: Import products from CSV');
  }
}
