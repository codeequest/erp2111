import { Controller, Get, Patch, Post, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { notImplemented } from '../../common/not-implemented';
import { SettingsService } from './settings.service';

/**
 * SKELETON — every endpoint answers 501 Not Implemented.
 * Routes and permissions are final; replace notImplemented(...) with calls to
 * SettingsService and add DTOs (class-validator) for request bodies.
 */
@ApiTags('Admin · Settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

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

  @Get('tax-rates')
  @RequirePermissions('admin.settings.manage')
  @ApiOperation({ summary: 'List tax rates' })
  getTaxRates() {
    return notImplemented('Admin · Settings: List tax rates');
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
