import { Controller, Get, Post, Patch, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { notImplemented } from '../../common/not-implemented';
import { InventoryService } from './inventory.service';

/**
 * SKELETON — every endpoint answers 501 Not Implemented.
 * Routes and permissions are final; replace notImplemented(...) with calls to
 * InventoryService and add DTOs (class-validator) for request bodies.
 */
@ApiTags('Inventory · Products')
@Controller('inventory/products')
export class ProductsController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'List / search products' })
  findAll() {
    return notImplemented('Inventory · Products: List / search products');
  }

  @Get(':id')
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'Get a product (cost only with inventory.cost.view)' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return notImplemented(
      'Inventory · Products: Get a product (cost only with inventory.cost.view)',
    );
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
