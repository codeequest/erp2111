import { Module } from '@nestjs/common';
import { SuppliersController } from './suppliers.controller';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { GoodsReceiptsController } from './goods-receipts.controller';
import { SuppliersService } from './suppliers.service';
import { PurchaseOrdersService } from './purchase-orders.service';
import { GoodsReceiptsService } from './goods-receipts.service';
import { PurchasingExportService } from './purchasing-export.service';

@Module({
  controllers: [SuppliersController, PurchaseOrdersController, GoodsReceiptsController],
  providers: [
    SuppliersService,
    PurchaseOrdersService,
    GoodsReceiptsService,
    PurchasingExportService,
  ],
  exports: [SuppliersService, PurchaseOrdersService, GoodsReceiptsService],
})
export class PurchasingModule {}
