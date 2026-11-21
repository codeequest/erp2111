import { Controller, DefaultValuePipe, Get, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { notImplemented } from '../../common/not-implemented';
import { ProductsService } from './products.service';

/**
 * low-stock is implemented; the other endpoints are still skeletons (501).
 */
@ApiTags('Inventory · Stock')
@Controller('inventory/stock')
export class StockController {
  constructor(private readonly products: ProductsService) {}

  @Get('low-stock')
  @RequirePermissions('inventory.stock.read')
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiOperation({ summary: 'Products under their minimum stock (total over all warehouses)' })
  lowStock(@Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number) {
    return this.products.lowStock(Math.min(Math.max(limit, 1), 100));
  }

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
