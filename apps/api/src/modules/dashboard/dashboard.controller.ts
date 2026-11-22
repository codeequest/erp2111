import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { notImplemented } from '../../common/not-implemented';
import { DashboardService } from './dashboard.service';
import { ProductsService } from '../inventory/products.service';

/**
 * SKELETON — every endpoint answers 501 Not Implemented.
 * Routes and permissions are final; replace notImplemented(...) with calls to
 * DashboardService and add DTOs (class-validator) for request bodies.
 */
@ApiTags('Dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly productsService: ProductsService,
  ) {}

  @Get('summary')
  @RequirePermissions('dashboard.summary.view')
  @ApiOperation({
    summary: 'Key figures: sales today / month, low stock count, receivables, payables',
  })
  getSummary() {
    return notImplemented(
      'Dashboard: Key figures: sales today / month, low stock count, receivables, payables',
    );
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
  getLowStock() {
    return this.productsService.lowStockSummary();
  }
}
