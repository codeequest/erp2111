import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller';
import { SalesOrdersController } from './sales-orders.controller';
import { DeliveriesController } from './deliveries.controller';
import { ReturnsController } from './returns.controller';
import { SalesService } from './sales.service';
import { SalesStatsController } from './sales-stats.controller';
import { SalesStatsService } from './sales-stats.service';

@Module({
  controllers: [
    CustomersController,
    SalesOrdersController,
    DeliveriesController,
    ReturnsController,
    SalesStatsController,
  ],
  providers: [SalesService, SalesStatsService],
  exports: [SalesService],
})
export class SalesModule {}
