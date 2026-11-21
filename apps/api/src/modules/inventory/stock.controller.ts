import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/types/request-user';
import { ListMovesQueryDto, OpeningBalancesDto } from './dto/stock.dto';
import { StockService } from './stock.service';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { notImplemented } from '../../common/not-implemented';
import { InventoryService } from './inventory.service';

/**
 * Opening balances are implemented; the other endpoints still answer 501.
 * Routes and permissions are final; replace notImplemented(...) with calls to
 * InventoryService and add DTOs (class-validator) for request bodies.
 */
@ApiTags('Inventory · Stock')
@Controller('inventory/stock')
export class StockController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly stockService: StockService,
  ) {}

  @Get('levels')
  @RequirePermissions('inventory.stock.read')
  @ApiOperation({ summary: 'On-hand quantity per product and warehouse' })
  getLevels() {
    return notImplemented('Inventory · Stock: On-hand quantity per product and warehouse');
  }

  @Get('moves')
  @RequirePermissions('inventory.stock.read')
  @ApiOperation({ summary: 'Stock ledger (filter by product, warehouse, date, type)' })
  getMoves(@Query() query: ListMovesQueryDto, @CurrentUser() user: RequestUser) {
    return this.stockService.listMoves(query, user);
  }

  @Get('expiring-lots')
  @RequirePermissions('inventory.stock.read')
  @ApiOperation({ summary: 'Lots with stock expiring within N days (default 30) or expired' })
  expiringLots(@Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number) {
    return this.stockService.expiringLots(Math.min(Math.max(days, 0), 3650));
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
  @HttpCode(200)
  @RequirePermissions('inventory.stock.adjust')
  @ApiOperation({ summary: 'Import opening stock and cost (go-live)' })
  openingBalances(@Body() dto: OpeningBalancesDto, @CurrentUser() user: RequestUser) {
    return this.stockService.openingBalances(dto, user);
  }
}
