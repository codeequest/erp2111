import { Body, Controller, Get, Patch, Post, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/types/request-user';
import { notImplemented } from '../../common/not-implemented';
import { SettingsService } from './settings.service';
import { UpdateSequenceDto } from './dto/sequence.dto';

/**
 * Numbering (sequences) is implemented. Company details and tax rates are still
 * SKELETONS answering 501: replace notImplemented(...) when you build them.
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
  @ApiOperation({ summary: 'List numbering sequences (product codes + this year’s documents)' })
  getSequences() {
    return this.settingsService.listSequences();
  }

  @Patch('sequences/:id')
  @RequirePermissions('admin.settings.manage')
  @ApiOperation({
    summary: 'Update a numbering sequence (prefix, digits, next number — documents only forward)',
  })
  updateSequences(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSequenceDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.settingsService.updateSequence(id, dto, user);
  }
}
