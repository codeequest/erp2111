import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/types/request-user';
import { CreateUnitDto } from './dto/product.dto';
import { InventoryService } from './inventory.service';

@ApiTags('Inventory · Categories & units')
@Controller('inventory/units')
export class UnitsController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'List units of measure' })
  findAll() {
    return this.inventoryService.listUnits();
  }

  @Post()
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Create a unit' })
  create(@Body() dto: CreateUnitDto, @CurrentUser() user: RequestUser) {
    return this.inventoryService.createUnit(dto, user);
  }
}
