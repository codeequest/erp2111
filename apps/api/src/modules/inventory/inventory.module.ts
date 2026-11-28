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
import { StockEngine } from './stock/stock-engine.service';
import { OpeningBalanceService } from './stock/opening-balance.service';
import { WarehousesService } from './warehouses.service';
import { AdjustmentsController, TransfersController } from './stock-documents.controller';
import { AdjustmentsService } from './stock/adjustments.service';
import { TransfersService } from './stock/transfers.service';
import { StockReportsService } from './stock/stock-reports.service';
import { StockCountsController } from './stock-counts.controller';
import { StockCountsService } from './stock/stock-counts.service';
import { StockFlowsService } from './stock/stock-flows.service';

@Module({
  controllers: [
    ProductsController,
    ProductImagesController,
    PriceListsController,
    CategoriesController,
    UnitsController,
    WarehousesController,
    StockController,
    AdjustmentsController,
    TransfersController,
    StockCountsController,
  ],
  providers: [
    InventoryService,
    ProductsService,
    CatalogService,
    ProductBulkService,
    ProductHistoryService,
    ProductTransferService,
    PriceListsService,
    StockEngine,
    OpeningBalanceService,
    WarehousesService,
    AdjustmentsService,
    TransfersService,
    StockReportsService,
    StockCountsService,
    StockFlowsService,
  ],
  // Purchasing and Sales post stock ONLY through StockFlowsService (which uses StockEngine).
  exports: [InventoryService, ProductsService, CatalogService, StockEngine, StockFlowsService],
})
export class InventoryModule {}
