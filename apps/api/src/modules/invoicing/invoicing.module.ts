import { Module } from '@nestjs/common';
import { InvoicesController } from './invoices.controller';
import { BillsController } from './bills.controller';
import { PaymentsController } from './payments.controller';
import { InvoicingService } from './invoicing.service';
import { BillsService } from './bills.service';
import { PaymentsService } from './payments.service';

@Module({
  controllers: [InvoicesController, BillsController, PaymentsController],
  providers: [InvoicingService, BillsService, PaymentsService],
  exports: [InvoicingService, BillsService, PaymentsService],
})
export class InvoicingModule {}
