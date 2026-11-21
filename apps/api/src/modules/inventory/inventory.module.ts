import { Module } from '@nestjs/common';
import { AuditModule } from '../../core/audit/audit.module';
import { ProductsController } from './products.controller';
import { CategoriesController } from './categories.controller';
import { UnitsController } from './units.controller';
import { WarehousesController } from './warehouses.controller';
import { StockController } from './stock.controller';
import { PriceListsController } from './price-lists.controller';
import { InventoryService } from './inventory.service';
import { ProductsService } from './products.service';
import { ProductImagesService } from './product-images.service';

@Module({
  imports: [AuditModule],
  controllers: [
    ProductsController,
    CategoriesController,
    UnitsController,
    WarehousesController,
    StockController,
    PriceListsController,
  ],
  providers: [InventoryService, ProductsService, ProductImagesService],
  exports: [InventoryService, ProductsService],
})
export class InventoryModule {}
