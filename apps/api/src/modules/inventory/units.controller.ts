import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { UnitDto } from '@erp/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RequestUser } from '../../common/types/request-user';
import { CatalogService } from './catalog.service';
import { CreateUnitDto } from './dto/catalog.dto';

@ApiTags('Inventory · Categories & units')
@Controller('inventory/units')
export class UnitsController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'List units of measure' })
  findAll(): Promise<UnitDto[]> {
    return this.catalog.listUnits();
  }

  @Post()
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Create a unit' })
  create(@Body() dto: CreateUnitDto, @CurrentUser() user: RequestUser): Promise<UnitDto> {
    return this.catalog.createUnit(dto, user);
  }
}
