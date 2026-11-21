import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { notImplemented } from '../../common/not-implemented';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/types/request-user';
import { DashboardService } from './dashboard.service';

/**
 * summary and low-stock are implemented (inventory figures only); top-products answers 501.
 * Routes and permissions are final; replace notImplemented(...) with calls to
 * DashboardService and add DTOs (class-validator) for request bodies.
 */
@ApiTags('Dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @RequirePermissions('dashboard.summary.view')
  @ApiOperation({
    summary: 'Key figures: sales today / month, low stock count, receivables, payables',
  })
  getSummary(@CurrentUser() user: RequestUser) {
    return this.dashboardService.summary(user);
  }

  @Get('top-products')
  @RequirePermissions('dashboard.summary.view')
  @ApiOperation({ summary: 'Best-selling products for a period' })
  getTopProducts() {
    return notImplemented('Dashboard: Best-selling products for a period');
  }

  @Get('low-stock')
  @RequirePermissions('dashboard.summary.view')
  @ApiOperation({ summary: 'Products below their minimum stock' })
  getLowStock(@CurrentUser() user: RequestUser) {
    return this.dashboardService.lowStock(user);
  }
}
