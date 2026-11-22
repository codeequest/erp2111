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

@Module({
  controllers: [
    ProductsController,
    ProductImagesController,
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
  ],
  exports: [InventoryService, ProductsService, CatalogService],
})
export class InventoryModule {}
