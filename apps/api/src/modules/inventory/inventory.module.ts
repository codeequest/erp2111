import { Module } from '@nestjs/common';
import { AuditModule } from '../../core/audit/audit.module';
import { ProductsController } from './products.controller';
import { CategoriesController } from './categories.controller';
import { UnitsController } from './units.controller';
import { WarehousesController } from './warehouses.controller';
import { StockController } from './stock.controller';
import { InventoryService } from './inventory.service';
import { UnitsService } from './units.service';
import { CategoriesService } from './categories.service';
import { WarehousesService } from './warehouses.service';
import { ProductsService } from './products.service';
import { StockService } from './stock.service';
import { StockLedgerService } from './stock-ledger.service';

@Module({
  imports: [AuditModule],
  controllers: [
    ProductsController,
    CategoriesController,
    UnitsController,
    WarehousesController,
    StockController,
  ],
  providers: [
    InventoryService,
    UnitsService,
    CategoriesService,
    WarehousesService,
    ProductsService,
    StockService,
    StockLedgerService,
  ],
  // StockLedgerService: Purchasing (receipts) and Sales (deliveries, returns) post stock through it.
  exports: [InventoryService, StockLedgerService],
})
export class InventoryModule {}
