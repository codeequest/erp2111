import { Module } from '@nestjs/common';
import { InvoicesController } from './invoices.controller';
import { BillsController } from './bills.controller';
import { PaymentsController } from './payments.controller';
import { InvoicingService } from './invoicing.service';

@Module({
  controllers: [InvoicesController, BillsController, PaymentsController],
  providers: [InvoicingService],
  exports: [InvoicingService],
})
export class InvoicingModule {}
