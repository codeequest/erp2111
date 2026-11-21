import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { notImplemented } from '../../common/not-implemented';
import { RequestUser } from '../../common/types/request-user';
import { CreateTaxRateDto, UpdateTaxRateDto } from './dto/tax-rate.dto';
import { SettingsService } from './settings.service';

/**
 * Tax rates are implemented; company details and numbering still answer 501.
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
  @ApiOperation({ summary: 'List tax rates (with the company default)' })
  getTaxRates() {
    return this.settingsService.listTaxRates();
  }

  @Post('tax-rates')
  @RequirePermissions('admin.settings.manage')
  @ApiOperation({ summary: 'Create a tax rate' })
  createTaxRate(@Body() dto: CreateTaxRateDto, @CurrentUser() user: RequestUser) {
    return this.settingsService.createTaxRate(dto, user);
  }

  @Patch('tax-rates/:id')
  @RequirePermissions('admin.settings.manage')
  @ApiOperation({ summary: 'Update a tax rate (name, rate, active, default)' })
  updateTaxRate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaxRateDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.settingsService.updateTaxRate(id, dto, user);
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
