import { Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Paginated, StockLevelsResponse, StockMoveRow } from '@erp/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { notImplemented } from '../../common/not-implemented';
import { RequestUser } from '../../common/types/request-user';
import { StockLevelsQueryDto, StockMovesQueryDto } from './dto/stock.dto';
import { StockService } from './stock.service';

/**
 * Levels and moves are built. Adjustments, transfers and opening balances still
 * answer 501 Not Implemented.
 */
@ApiTags('Inventory · Stock')
@Controller('inventory/stock')
export class StockController {
  constructor(private readonly stock: StockService) {}

  @Get('levels')
  @RequirePermissions('inventory.stock.read')
  @ApiOperation({ summary: 'On-hand quantity per product and warehouse' })
  getLevels(
    @Query() query: StockLevelsQueryDto,
    @CurrentUser() user: RequestUser,
  ): Promise<StockLevelsResponse> {
    return this.stock.levels(query, user);
  }

  @Get('moves')
  @RequirePermissions('inventory.stock.read')
  @ApiOperation({ summary: 'Stock ledger (filter by product, warehouse, date, type)' })
  getMoves(
    @Query() query: StockMovesQueryDto,
    @CurrentUser() user: RequestUser,
  ): Promise<Paginated<StockMoveRow>> {
    return this.stock.moves(query, user);
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
