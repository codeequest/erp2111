import { Controller, Get, Post, Patch, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { notImplemented } from '../../common/not-implemented';
import type { RequestUser } from '../../common/types/request-user';
import { SearchProductsDto } from './dto/search-products.dto';
import { InventoryService } from './inventory.service';

/**
 * Search (GET /) and detail (GET /:id) are built.
 * SKELETON — the other endpoints answer 501 Not Implemented.
 * Routes and permissions are final; replace notImplemented(...) with calls to
 * InventoryService and add DTOs (class-validator) for request bodies.
 */
@ApiTags('Inventory · Products')
@Controller('inventory/products')
export class ProductsController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'List / search products (text, category, stock status, price, sort, pages)' })
  findAll(@Query() query: SearchProductsDto, @CurrentUser() user: RequestUser) {
    return this.inventoryService.searchProducts(query, user.permissions.has('inventory.cost.view'));
  }

  @Get(':id')
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'Get a product (cost only with inventory.cost.view)' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.inventoryService.getProduct(id, user.permissions.has('inventory.cost.view'));
  }

  @Post()
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Create a product' })
  create() {
    return notImplemented('Inventory · Products: Create a product');
  }

  @Patch(':id')
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Update a product' })
  update(@Param('id', ParseUUIDPipe) id: string) {
    return notImplemented('Inventory · Products: Update a product');
  }

  @Post(':id/deactivate')
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Deactivate a product' })
  deactivate(@Param('id', ParseUUIDPipe) id: string) {
    return notImplemented('Inventory · Products: Deactivate a product');
  }

  @Post('import')
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Import products from CSV' })
  import() {
    return notImplemented('Inventory · Products: Import products from CSV');
  }
}
