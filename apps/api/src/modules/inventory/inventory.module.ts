import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { CategoriesController } from './categories.controller';
import { UnitsController } from './units.controller';
import { WarehousesController } from './warehouses.controller';
import { StockController } from './stock.controller';
import { AuditModule } from '../../core/audit/audit.module';
import { InventoryService } from './inventory.service';
import { ProductsImportService } from './products-import.service';
import { ProductsLabelsService } from './products-labels.service';

@Module({
  imports: [AuditModule],
  controllers: [
    ProductsController,
    CategoriesController,
    UnitsController,
    WarehousesController,
    StockController,
  ],
  providers: [InventoryService, ProductsImportService, ProductsLabelsService],
  exports: [InventoryService],
})
export class InventoryModule {}
