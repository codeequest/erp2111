import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RequestUser } from '../../common/types/request-user';
import {
  CreateAdjustmentDto,
  CreateOpeningDto,
  CreateTransferDto,
  StockLevelsQueryDto,
  StockMovesQueryDto,
} from './dto/stock.dto';
import { StockService } from './stock.service';

@ApiTags('Inventory · Stock')
@ApiBearerAuth()
@Controller('inventory/stock')
export class StockController {
  constructor(private readonly stock: StockService) {}

  @Get('levels')
  @RequirePermissions('inventory.stock.read')
  @ApiOperation({ summary: 'On-hand quantity per product and warehouse (value with cost.view)' })
  getLevels(@Query() query: StockLevelsQueryDto, @CurrentUser() user: RequestUser) {
    return this.stock.levels(query, user.permissions);
  }

  @Get('moves')
  @RequirePermissions('inventory.stock.read')
  @ApiOperation({ summary: 'Stock ledger (filter by product, warehouse, date, type, reference)' })
  getMoves(@Query() query: StockMovesQueryDto, @CurrentUser() user: RequestUser) {
    return this.stock.moves(query, user.permissions);
  }

  @Post('adjustments')
  @RequirePermissions('inventory.stock.adjust')
  @ApiOperation({
    summary: 'Post a stock adjustment: a count or a +/- correction (reason required)',
  })
  adjustments(@Body() dto: CreateAdjustmentDto, @CurrentUser() user: RequestUser) {
    return this.stock.adjust(dto, user.id);
  }

  @Post('transfers')
  @RequirePermissions('inventory.stock.transfer')
  @ApiOperation({ summary: 'Transfer stock between two warehouses' })
  transfers(@Body() dto: CreateTransferDto, @CurrentUser() user: RequestUser) {
    return this.stock.transfer(dto, user.id);
  }

  @Post('opening-balances')
  @RequirePermissions('inventory.stock.adjust')
  @ApiOperation({
    summary: 'Opening stock and cost (go-live). Also needs inventory.cost.view',
  })
  openingBalances(@Body() dto: CreateOpeningDto, @CurrentUser() user: RequestUser) {
    return this.stock.opening(dto, user.id, user.permissions);
  }
}
