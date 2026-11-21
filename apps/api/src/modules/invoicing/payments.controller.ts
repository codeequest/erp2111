import { Controller, Get, Post, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { notImplemented } from '../../common/not-implemented';
import { InvoicingService } from './invoicing.service';

/**
 * SKELETON — every endpoint answers 501 Not Implemented.
 * Routes and permissions are final; replace notImplemented(...) with calls to
 * InvoicingService and add DTOs (class-validator) for request bodies.
 */
@ApiTags('Invoicing · Payments')
@Controller('invoicing/payments')
export class PaymentsController {
  constructor(private readonly invoicingService: InvoicingService) {}

  @Get()
  @RequirePermissions('invoicing.payment.read')
  @ApiOperation({ summary: 'List payments in and out' })
  findAll() {
    return notImplemented('Invoicing · Payments: List payments in and out');
  }

  @Get(':id')
  @RequirePermissions('invoicing.payment.read')
  @ApiOperation({ summary: 'Get a payment with its allocations' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return notImplemented('Invoicing · Payments: Get a payment with its allocations');
  }

  @Post()
  @RequirePermissions('invoicing.payment.record')
  @ApiOperation({ summary: 'Record a payment and allocate it to invoices' })
  create() {
    return notImplemented('Invoicing · Payments: Record a payment and allocate it to invoices');
  }
}
