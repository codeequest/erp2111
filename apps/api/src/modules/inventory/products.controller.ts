import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/types/request-user';
import { notImplemented } from '../../common/not-implemented';
import { CreateProductDto, ProductListQueryDto, UpdateProductDto } from './dto/product.dto';
import { ProductsService } from './products.service';

@ApiTags('Inventory · Products')
@ApiBearerAuth()
@Controller('inventory/products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'List / search products (paginated, with catalogue stats)' })
  findAll(@Query() query: ProductListQueryDto, @CurrentUser() user: RequestUser) {
    return this.products.list(query, user);
  }

  @Get('form-options')
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'Categories, units, tax rates and currency for the product form' })
  formOptions() {
    return this.products.formOptions();
  }

  @Get(':id')
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'Get a product (cost only with inventory.cost.view)' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.products.findOne(id, user);
  }

  @Post()
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Create a product' })
  create(@Body() dto: CreateProductDto, @CurrentUser() user: RequestUser) {
    return this.products.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Update a product' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.products.update(id, dto, user);
  }

  @Post(':id/deactivate')
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Archive a product (soft delete)' })
  deactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.products.setActive(id, false, user);
  }

  @Post(':id/activate')
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Restore an archived product' })
  activate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.products.setActive(id, true, user);
  }

  @Post('import')
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Import products from CSV' })
  import() {
    return notImplemented('Inventory · Products: Import products from CSV');
  }
}
