import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RequestUser } from '../../common/types/request-user';
import {
  AdjustmentDto,
  ListStockDocumentsQueryDto,
  TransferDto,
} from './dto/stock-document.dto';
import { AdjustmentsService } from './stock/adjustments.service';
import { TransfersService } from './stock/transfers.service';

@ApiTags('Inventory · Adjustments')
@ApiBearerAuth()
@Controller('inventory/adjustments')
export class AdjustmentsController {
  constructor(private readonly adjustments: AdjustmentsService) {}

  @Get()
  @RequirePermissions('inventory.stock.read')
  @ApiOperation({ summary: 'List stock adjustments (newest first)' })
  list(@Query() query: ListStockDocumentsQueryDto) {
    return this.adjustments.list(query);
  }

  @Get(':id')
  @RequirePermissions('inventory.stock.read')
  @ApiOperation({ summary: 'One adjustment with its lines' })
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.adjustments.get(id, user);
  }

  @Post()
  @RequirePermissions('inventory.stock.adjust')
  @ApiOperation({ summary: 'Create a draft adjustment (stock does not move yet)' })
  create(@Body() dto: AdjustmentDto, @CurrentUser() user: RequestUser) {
    return this.adjustments.create(dto, user);
  }

  @Put(':id')
  @RequirePermissions('inventory.stock.adjust')
  @ApiOperation({ summary: 'Replace a draft adjustment' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdjustmentDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.adjustments.update(id, dto, user);
  }

  @Post(':id/post')
  @HttpCode(200)
  @RequirePermissions('inventory.stock.adjust')
  @ApiOperation({ summary: 'Validate a draft: stock moves now (refused if it would go negative)' })
  post(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.adjustments.post(id, user);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermissions('inventory.stock.adjust')
  @ApiOperation({ summary: 'Cancel a draft (a validated adjustment cannot be cancelled)' })
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.adjustments.cancel(id, user);
  }
}

@ApiTags('Inventory · Transfers')
@ApiBearerAuth()
@Controller('inventory/transfers')
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Get()
  @RequirePermissions('inventory.stock.read')
  @ApiOperation({ summary: 'List transfers (newest first)' })
  list(@Query() query: ListStockDocumentsQueryDto) {
    return this.transfers.list(query);
  }

  @Get(':id')
  @RequirePermissions('inventory.stock.read')
  @ApiOperation({ summary: 'One transfer with its lines' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.transfers.get(id);
  }

  @Post()
  @RequirePermissions('inventory.stock.transfer')
  @ApiOperation({ summary: 'Create a draft transfer (stock does not move yet)' })
  create(@Body() dto: TransferDto, @CurrentUser() user: RequestUser) {
    return this.transfers.create(dto, user);
  }

  @Put(':id')
  @RequirePermissions('inventory.stock.transfer')
  @ApiOperation({ summary: 'Replace a draft transfer' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransferDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.transfers.update(id, dto, user);
  }

  @Post(':id/post')
  @HttpCode(200)
  @RequirePermissions('inventory.stock.transfer')
  @ApiOperation({ summary: 'Validate a draft: stock moves now (refused if the source lacks stock)' })
  post(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.transfers.post(id, user);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermissions('inventory.stock.transfer')
  @ApiOperation({ summary: 'Cancel a draft (a validated transfer cannot be cancelled)' })
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.transfers.cancel(id, user);
  }
}
