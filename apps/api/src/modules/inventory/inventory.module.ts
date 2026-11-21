import { Module } from '@nestjs/common';
import { SettingsModule } from '../../core/settings/settings.module';
import { ProductsController } from './products.controller';
import { CategoriesController } from './categories.controller';
import { UnitsController } from './units.controller';
import { WarehousesController } from './warehouses.controller';
import { StockController } from './stock.controller';
import { InventoryService } from './inventory.service';
import { ProductsService } from './products.service';
import { ProductsImportService } from './products-import.service';
import { ProductPhotosService } from './product-photos.service';
import { CategoriesService } from './categories.service';
import { UnitsService } from './units.service';

/**
 * Products catalog (products, categories, units) is built.
 * Warehouses and stock are still skeletons (InventoryService, 501).
 */
@Module({
  imports: [SettingsModule],
  controllers: [
    ProductsController,
    CategoriesController,
    UnitsController,
    WarehousesController,
    StockController,
  ],
  providers: [
    InventoryService,
    ProductsService,
    ProductsImportService,
    ProductPhotosService,
    CategoriesService,
    UnitsService,
  ],
  exports: [InventoryService, ProductsService, CategoriesService, UnitsService],
})
export class InventoryModule {}
