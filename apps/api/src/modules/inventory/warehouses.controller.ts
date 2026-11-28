import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RequestUser } from '../../common/types/request-user';
import {
  CreateWarehouseDto,
  ListWarehousesQueryDto,
  UpdateWarehouseDto,
} from './dto/warehouse.dto';
import { WarehousesService } from './warehouses.service';

@ApiTags('Inventory · Warehouses')
@ApiBearerAuth()
@Controller('inventory/warehouses')
export class WarehousesController {
  constructor(private readonly warehouses: WarehousesService) {}

  @Get()
  @RequirePermissions('inventory.stock.read')
  @ApiOperation({ summary: 'List warehouses with how many products each one holds' })
  findAll(@Query() query: ListWarehousesQueryDto) {
    return this.warehouses.list(query.includeInactive);
  }

  @Post()
  @RequirePermissions('inventory.warehouse.manage')
  @ApiOperation({ summary: 'Create a warehouse' })
  create(@Body() dto: CreateWarehouseDto, @CurrentUser() user: RequestUser) {
    return this.warehouses.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions('inventory.warehouse.manage')
  @ApiOperation({
    summary: 'Rename, change the address, or (de)activate a warehouse (the code cannot change)',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWarehouseDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.warehouses.update(id, dto, user);
  }
}
