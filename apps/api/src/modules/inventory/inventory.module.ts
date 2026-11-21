import { Module } from '@nestjs/common';
import { AuditModule } from '../../core/audit/audit.module';
import { ProductsController } from './products.controller';
import { CategoriesController } from './categories.controller';
import { UnitsController } from './units.controller';
import { TaxRatesLookupController } from './tax-rates.controller';
import { WarehousesController } from './warehouses.controller';
import { StockController } from './stock.controller';
import { InventoryService } from './inventory.service';
import { ProductsService } from './products.service';
import { ProductCodeController } from './product-code.controller';
import { ProductCodeService } from './product-code.service';
import { ProductPhotoStorage } from './product-photo.storage';

@Module({
  imports: [AuditModule],
  controllers: [
    ProductsController,
    ProductCodeController,
    CategoriesController,
    UnitsController,
    TaxRatesLookupController,
    WarehousesController,
    StockController,
  ],
  providers: [InventoryService, ProductsService, ProductCodeService, ProductPhotoStorage],
  exports: [InventoryService, ProductsService, ProductCodeService],
})
export class InventoryModule {}
