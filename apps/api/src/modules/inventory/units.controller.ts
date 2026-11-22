import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RequestUser } from '../../common/types/request-user';
import { CatalogService } from './catalog.service';
import { CreateUnitDto, UpdateUnitDto } from './dto/catalog.dto';

@ApiTags('Inventory · Categories & units')
@Controller('inventory/units')
export class UnitsController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'List units of measure with how many products use each' })
  findAll() {
    return this.catalog.listUnits();
  }

  @Post()
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Create a unit' })
  create(@Body() dto: CreateUnitDto, @CurrentUser() user: RequestUser) {
    return this.catalog.createUnit(dto, user);
  }

  @Patch(':id')
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Rename a unit (the code cannot change)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUnitDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.catalog.updateUnit(id, dto, user);
  }
}
