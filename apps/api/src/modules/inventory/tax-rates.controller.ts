import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { InventoryService } from './inventory.service';

/**
 * Read-only lookup so product forms can offer a tax-rate dropdown.
 * Managing tax rates stays in Settings (admin.settings.manage); this route only
 * needs inventory.product.read, so non-admin product editors can use it.
 */
@ApiTags('Inventory · Categories & units')
@Controller('inventory/tax-rates')
export class TaxRatesLookupController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'List active tax rates (lookup for product forms)' })
  findAll() {
    return this.inventoryService.listActiveTaxRates();
  }
}
