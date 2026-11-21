import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { notImplemented } from '../../common/not-implemented';
import { RequestUser } from '../../common/types/request-user';
import { CreateProductDto, ListProductsQuery, UpdateProductDto } from './dto/product.dto';
import { InventoryService } from './inventory.service';

@ApiTags('Inventory · Products')
@Controller('inventory/products')
export class ProductsController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'List / search products (scooters)' })
  findAll(@Query() q: ListProductsQuery, @CurrentUser() user: RequestUser) {
    return this.inventoryService.listProducts(q, user);
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
  @ApiOperation({ summary: 'Import products from CSV' })
  import() {
    return notImplemented('Inventory · Products: Import products from CSV');
  }
}
