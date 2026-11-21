import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RequestUser } from '../../common/types/request-user';
import { SalesStatsService } from './sales-stats.service';
import { Granularity } from './stats-periods';

@ApiTags('Sales · Statistics')
@Controller('sales/statistics')
export class SalesStatsController {
  constructor(private readonly stats: SalesStatsService) {}

  @Get()
  @RequirePermissions('sales.stats.view')
  @ApiOperation({
    summary:
      'Sales by month, quarter or year (posted invoices minus credit notes, excl. VAT). Margin only with inventory.cost.view.',
  })
  @ApiQuery({ name: 'granularity', enum: ['month', 'quarter', 'year'], required: false })
  @ApiQuery({ name: 'year', required: false, example: 2026 })
  get(
    @Query('granularity') granularity: string = 'month',
    @Query('year') year: string | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    if (!['month', 'quarter', 'year'].includes(granularity)) {
      throw new BadRequestException('granularity must be month, quarter or year');
    }
    const y = year ? Number(year) : new Date().getFullYear();
    if (!Number.isInteger(y) || y < 2000 || y > 2100) {
      throw new BadRequestException('year must be between 2000 and 2100');
    }
    return this.stats.statistics(granularity as Granularity, y, user);
  }
}
