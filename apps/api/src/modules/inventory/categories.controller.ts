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
@ApiTags('Inventory · Categories & units')
@Controller('inventory/categories')
export class CategoriesController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'List categories (tree)' })
  findAll() {
    return this.inventoryService.listCategories();
  }

  @Post()
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Create a category' })
  create() {
    return notImplemented('Inventory · Categories & units: Create a category');
  }

  @Patch(':id')
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Update a category' })
  update(@Param('id', ParseUUIDPipe) id: string) {
    return notImplemented('Inventory · Categories & units: Update a category');
  }
}
