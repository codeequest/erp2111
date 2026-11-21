import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/types/request-user';
import { CategoriesService } from './categories.service';
import { CreateUnitDto } from './dto/category.dto';

@ApiTags('Inventory · Categories & units')
@ApiBearerAuth()
@Controller('inventory/units')
export class UnitsController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'List units of measure' })
  findAll() {
    return this.categories.listUnits();
  }

  @Post()
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Create a unit' })
  create(@Body() dto: CreateUnitDto, @CurrentUser() user: RequestUser) {
    return this.categories.createUnit(dto, user);
  }
}
