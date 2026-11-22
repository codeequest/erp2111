import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { CategoriesController } from './categories.controller';
import { UnitsController } from './units.controller';
import { WarehousesController } from './warehouses.controller';
import { StockController } from './stock.controller';
import { InventoryService } from './inventory.service';
import { ProductsService } from './products.service';
import { CatalogService } from './catalog.service';

@Module({
  controllers: [
    ProductsController,
    CategoriesController,
    UnitsController,
    WarehousesController,
    StockController,
  ],
  providers: [InventoryService, ProductsService, CatalogService],
  exports: [InventoryService, ProductsService, CatalogService],
})
export class InventoryModule {}
