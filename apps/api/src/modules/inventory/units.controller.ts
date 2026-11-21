import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RequestUser } from '../../common/types/request-user';
import { CreateUnitDto } from './dto/product.dto';
import { InventoryService } from './inventory.service';

@ApiTags('Inventory · Categories & units')
@Controller('inventory')
export class UnitsController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('units')
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'List units of measure' })
  findAll() {
    return this.inventoryService.listUnits();
  }

  @Post('units')
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Create a unit' })
  create(@Body() dto: CreateUnitDto, @CurrentUser() user: RequestUser) {
    return this.inventoryService.createUnit(dto, user);
  }

  /** Read-only list for the product form; managing tax rates stays in Settings. */
  @Get('tax-rates')
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'List active tax rates (for the product form)' })
  taxRates() {
    return this.inventoryService.listTaxRates();
  }
}
