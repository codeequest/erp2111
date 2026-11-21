import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ProductCodeService } from './product-code.service';

/**
 * Read-only preview for the product form ("This product will get the code ART-00013").
 * Changing the numbering is a company setting: PATCH /settings/sequences/:id.
 */
@ApiTags('Inventory · Products')
@Controller('inventory/product-code')
export class ProductCodeController {
  constructor(private readonly codes: ProductCodeService) {}

  @Get()
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'Preview the next automatic product code' })
  get() {
    return this.codes.get();
  }
}
