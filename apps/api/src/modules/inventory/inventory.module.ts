import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { CategoriesController } from './categories.controller';
import { UnitsController } from './units.controller';
import { WarehousesController } from './warehouses.controller';
import { StockController } from './stock.controller';
import { InventoryService } from './inventory.service';
import { StockService } from './stock.service';
import { PriceListService } from './price-list.service';
import { PriceListsController } from './price-lists.controller';

@Module({
  controllers: [
    PriceListsController,
    ProductsController,
    CategoriesController,
    UnitsController,
    WarehousesController,
    StockController,
  ],
  providers: [InventoryService, StockService, PriceListService],
  exports: [InventoryService, StockService, PriceListService],
})
export class InventoryModule {}
