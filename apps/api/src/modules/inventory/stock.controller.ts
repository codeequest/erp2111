import { Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { notImplemented } from '../../common/not-implemented';
import { InventoryService } from './inventory.service';

/**
 * SKELETON — every endpoint answers 501 Not Implemented.
 * Routes and permissions are final; replace notImplemented(...) with calls to
 * InventoryService and add DTOs (class-validator) for request bodies.
 */
@ApiTags('Inventory · Stock')
@Controller('inventory/stock')
export class StockController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('levels')
  @RequirePermissions('inventory.stock.read')
  @ApiOperation({ summary: 'On-hand quantity per product and warehouse' })
  getLevels() {
    return notImplemented('Inventory · Stock: On-hand quantity per product and warehouse');
  }

  @Get('moves')
  @RequirePermissions('inventory.stock.read')
  @ApiOperation({ summary: 'Stock ledger (filter by product, warehouse, date, type)' })
  getMoves() {
    return notImplemented(
      'Inventory · Stock: Stock ledger (filter by product, warehouse, date, type)',
    );
  }

  @Post('adjustments')
  @RequirePermissions('inventory.stock.adjust')
  @ApiOperation({ summary: 'Post a stock adjustment (reason required)' })
  adjustments() {
    return notImplemented('Inventory · Stock: Post a stock adjustment (reason required)');
  }

  @Post('transfers')
  @RequirePermissions('inventory.stock.transfer')
  @ApiOperation({ summary: 'Transfer stock between two warehouses' })
  transfers() {
    return notImplemented('Inventory · Stock: Transfer stock between two warehouses');
  }

  @Post('opening-balances')
  @RequirePermissions('inventory.stock.adjust')
  @ApiOperation({ summary: 'Import opening stock and cost (go-live)' })
  openingBalances() {
    return notImplemented('Inventory · Stock: Import opening stock and cost (go-live)');
  }
}
