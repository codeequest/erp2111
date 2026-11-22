import { Body, Controller, Get, Patch, Post, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { notImplemented } from '../../common/not-implemented';
import { SettingsService } from './settings.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/types/request-user';
import { CreateTaxRateDto, UpdateTaxRateDto } from './dto/tax-rate.dto';

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
  @ApiOperation({ summary: 'Update a tax rate' })
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
