import { Controller, Get, Post, Patch, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { notImplemented } from '../../common/not-implemented';
import { InventoryService } from './inventory.service';
import { StockService } from './stock.service';

/**
 * Listing is implemented; create / update still answer 501.
 * Routes and permissions are final; replace notImplemented(...) with calls to
 * InventoryService and add DTOs (class-validator) for request bodies.
 */
@ApiTags('Inventory · Warehouses')
@Controller('inventory/warehouses')
export class WarehousesController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly stockService: StockService,
  ) {}

  @Get()
  @RequirePermissions('inventory.stock.read')
  @ApiOperation({ summary: 'List warehouses' })
  findAll() {
    return this.stockService.listWarehouses();
  }

  @Post()
  @RequirePermissions('inventory.warehouse.manage')
  @ApiOperation({ summary: 'Create a warehouse' })
  create() {
    return notImplemented('Inventory · Warehouses: Create a warehouse');
  }

  @Patch(':id')
  @RequirePermissions('inventory.warehouse.manage')
  @ApiOperation({ summary: 'Update a warehouse' })
  update(@Param('id', ParseUUIDPipe) id: string) {
    return notImplemented('Inventory · Warehouses: Update a warehouse');
  }
}
