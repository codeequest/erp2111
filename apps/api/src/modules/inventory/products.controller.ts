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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { notImplemented } from '../../common/not-implemented';
import { RequestUser } from '../../common/types/request-user';
import { CreateProductDto, ListProductsQueryDto, UpdateProductDto } from './dto/product.dto';
import { ProductsService } from './products.service';

@ApiTags('Inventory · Products')
@ApiBearerAuth()
@Controller('inventory/products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

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
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Import products from CSV' })
  import() {
    return notImplemented('Inventory · Products: Import products from CSV');
  }
}
