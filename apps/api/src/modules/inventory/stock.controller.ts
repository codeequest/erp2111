import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  Paginated,
  StockAdjustmentListItem,
  StockAdjustmentResult,
  StockLevelsResponse,
  StockMoveRow,
} from '@erp/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { notImplemented } from '../../common/not-implemented';
import { RequestUser } from '../../common/types/request-user';
import { AdjustmentsService } from './adjustments.service';
import {
  AdjustmentsQueryDto,
  CreateAdjustmentDto,
  StockLevelsQueryDto,
  StockMovesQueryDto,
} from './dto/stock.dto';
import { StockService } from './stock.service';

/**
 * Levels, moves and adjustments are built. Transfers and opening balances still
 * answer 501 Not Implemented.
 */
@ApiTags('Inventory · Stock')
@Controller('inventory/stock')
export class StockController {
  constructor(
    private readonly stock: StockService,
    private readonly adjustmentsService: AdjustmentsService,
  ) {}

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

  @Get('adjustments')
  @RequirePermissions('inventory.stock.read')
  @ApiOperation({ summary: 'Posted stock adjustments, newest first, with their lines' })
  listAdjustments(
    @Query() query: AdjustmentsQueryDto,
    @CurrentUser() user: RequestUser,
  ): Promise<Paginated<StockAdjustmentListItem>> {
    return this.adjustmentsService.list(query, user);
  }

  @Post('adjustments')
  @RequirePermissions('inventory.stock.adjust')
  @ApiOperation({ summary: 'Post a stock adjustment (reason required)' })
  adjustments(
    @Body() dto: CreateAdjustmentDto,
    @CurrentUser() user: RequestUser,
  ): Promise<StockAdjustmentResult> {
    return this.adjustmentsService.create(dto, user);
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
