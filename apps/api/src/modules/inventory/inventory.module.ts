import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { CategoriesController } from './categories.controller';
import { UnitsController } from './units.controller';
import { WarehousesController } from './warehouses.controller';
import { StockController } from './stock.controller';
import { InventoryService } from './inventory.service';
import { ProductsService } from './products.service';
import { CatalogService } from './catalog.service';
import { StockService } from './stock.service';
import { AdjustmentsService } from './adjustments.service';

@Module({
  controllers: [
    ProductsController,
    CategoriesController,
    UnitsController,
    WarehousesController,
    StockController,
  ],
  providers: [InventoryService, ProductsService, CatalogService, StockService, AdjustmentsService],
  exports: [InventoryService, ProductsService, CatalogService, StockService, AdjustmentsService],
})
export class InventoryModule {}
