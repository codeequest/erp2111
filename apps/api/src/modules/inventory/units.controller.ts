import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { TaxRateDto, UnitDto } from '@erp/shared';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../common/types/request-user';
import { CatalogService } from './catalog.service';
import { CreateUnitDto } from './products/dto/product.dto';

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
    return this.catalog.createUnit(dto, user.id);
  }
}

/** Read-only list of active tax rates for the product form (managing them stays in Settings). */
@ApiTags('Inventory · Categories & units')
@Controller('inventory/tax-rates')
export class TaxRatesLookupController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'Active tax rates (for choosing a product tax)' })
  findAll(): Promise<TaxRateDto[]> {
    return this.catalog.listTaxRates();
  }
}
