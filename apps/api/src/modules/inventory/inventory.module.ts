import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { CategoriesController } from './categories.controller';
import { UnitsController } from './units.controller';
import { WarehousesController } from './warehouses.controller';
import { StockController } from './stock.controller';
import { InventoryService } from './inventory.service';
import { ProductsService } from './products.service';
import { CatalogService } from './catalog.service';
import { ProductBulkService } from './product-bulk.service';
import { ProductHistoryService } from './product-history.service';
import { ProductTransferService } from './product-transfer.service';
import { ProductImagesController } from './product-images.controller';
import { PriceListsController } from './price-lists.controller';
import { PriceListsService } from './price-lists.service';

@Module({
  controllers: [
    ProductsController,
    ProductImagesController,
    PriceListsController,
    CategoriesController,
    UnitsController,
    WarehousesController,
    StockController,
  ],
  providers: [
    InventoryService,
    ProductsService,
    CatalogService,
    ProductBulkService,
    ProductHistoryService,
    ProductTransferService,
    PriceListsService,
  ],
  exports: [InventoryService, ProductsService, CatalogService],
})
export class InventoryModule {}
