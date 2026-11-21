import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { CategoriesController } from './categories.controller';
import { UnitsController } from './units.controller';
import { WarehousesController } from './warehouses.controller';
import { StockController } from './stock.controller';
import { AuditModule } from '../../core/audit/audit.module';
import { InventoryService } from './inventory.service';

@Module({
  imports: [AuditModule],
  controllers: [
    ProductsController,
    CategoriesController,
    UnitsController,
    WarehousesController,
    StockController,
  ],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
