import { Module } from '@nestjs/common';
import { SuppliersController } from './suppliers.controller';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { GoodsReceiptsController } from './goods-receipts.controller';
import { PurchasingService } from './purchasing.service';

@Module({
  controllers: [SuppliersController, PurchaseOrdersController, GoodsReceiptsController],
  providers: [PurchasingService],
  exports: [PurchasingService],
})
export class PurchasingModule {}
