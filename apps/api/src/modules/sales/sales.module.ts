import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller';
import { SalesOrdersController } from './sales-orders.controller';
import { DeliveriesController } from './deliveries.controller';
import { ReturnsController } from './returns.controller';
import { SalesService } from './sales.service';

@Module({
  controllers: [
    CustomersController,
    SalesOrdersController,
    DeliveriesController,
    ReturnsController,
  ],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
