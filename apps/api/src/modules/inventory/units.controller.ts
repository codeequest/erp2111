import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RequestUser } from '../../common/types/request-user';
import { CreateUnitDto } from './dto/unit.dto';
import { UnitsService } from './units.service';

@ApiTags('Inventory · Categories & units')
@ApiBearerAuth()
@Controller('inventory/units')
export class UnitsController {
  constructor(private readonly units: UnitsService) {}

  @Get()
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'List units of measure' })
  findAll() {
    return this.units.findAll();
  }

  @Post()
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Create a unit (409 if the code already exists)' })
  create(@Body() dto: CreateUnitDto, @CurrentUser() user: RequestUser) {
    return this.units.create(dto, user.id);
  }
}
