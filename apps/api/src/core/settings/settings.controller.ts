import { Controller, Get, Patch, Post, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { notImplemented } from '../../common/not-implemented';
import { SettingsService } from './settings.service';

/**
 * SKELETON except GET /settings/public and GET /settings/tax-rates (used by the
 * Products module). The rest answers 501 until the Administration module is merged.
 * Routes and permissions are final; replace notImplemented(...) with calls to
 * SettingsService and add DTOs (class-validator) for request bodies.
 */
@ApiTags('Admin · Settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  /** No permission needed: every logged-in user needs the currency to read amounts. */
  @Get('public')
  @ApiOperation({ summary: 'Company name, logo and currency (any logged-in user)' })
  getPublic() {
    return this.settingsService.getPublic();
  }

  @Get('company')
  @RequirePermissions('admin.settings.manage')
  @ApiOperation({ summary: 'Get company settings' })
  getCompany() {
    return notImplemented('Admin · Settings: Get company settings');
  }

  @Patch('company')
  @RequirePermissions('admin.settings.manage')
  @ApiOperation({ summary: 'Update company settings' })
  updateCompany() {
    return notImplemented('Admin · Settings: Update company settings');
  }

  /** Any logged-in user: product forms need the list of VAT rates. */
  @Get('tax-rates')
  @ApiOperation({ summary: 'List tax rates (any logged-in user)' })
  getTaxRates() {
    return this.settingsService.listTaxRates();
  }

  @Post('tax-rates')
  @RequirePermissions('admin.settings.manage')
  @ApiOperation({ summary: 'Create a tax rate' })
  taxRates() {
    return notImplemented('Admin · Settings: Create a tax rate');
  }

  @Patch('tax-rates/:id')
  @RequirePermissions('admin.settings.manage')
  @ApiOperation({ summary: 'Update a tax rate' })
  updateTaxRates(@Param('id', ParseUUIDPipe) id: string) {
    return notImplemented('Admin · Settings: Update a tax rate');
  }

  @Get('sequences')
  @RequirePermissions('admin.settings.manage')
  @ApiOperation({ summary: 'List document numbering sequences' })
  getSequences() {
    return notImplemented('Admin · Settings: List document numbering sequences');
  }

  @Patch('sequences/:id')
  @RequirePermissions('admin.settings.manage')
  @ApiOperation({ summary: 'Update a numbering sequence prefix / padding' })
  updateSequences(@Param('id', ParseUUIDPipe) id: string) {
    return notImplemented('Admin · Settings: Update a numbering sequence prefix / padding');
  }
}
