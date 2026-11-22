import { Module } from '@nestjs/common';
import { AuditModule } from '../../core/audit/audit.module';
import { ProductsController } from './products.controller';
import { CategoriesController } from './categories.controller';
import { TaxRatesLookupController, UnitsController } from './units.controller';
import { WarehousesController } from './warehouses.controller';
import { StockController } from './stock.controller';
import { InventoryService } from './inventory.service';
import { CatalogService } from './catalog.service';
import { ProductsService } from './products/products.service';
import { ProductImportService } from './products/product-import.service';

@Module({
  imports: [AuditModule],
  controllers: [
    ProductsController,
    CategoriesController,
    UnitsController,
    TaxRatesLookupController,
    WarehousesController,
    StockController,
  ],
  providers: [InventoryService, CatalogService, ProductsService, ProductImportService],
  exports: [InventoryService, CatalogService, ProductsService],
})
export class InventoryModule {}
