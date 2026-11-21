import { Controller, Get, Post, Patch, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { notImplemented } from '../../common/not-implemented';
import { InvoicingService } from './invoicing.service';

/**
 * SKELETON — every endpoint answers 501 Not Implemented.
 * Routes and permissions are final; replace notImplemented(...) with calls to
 * InvoicingService and add DTOs (class-validator) for request bodies.
 */
@ApiTags('Invoicing · Customer invoices')
@Controller('invoicing/invoices')
export class InvoicesController {
  constructor(private readonly invoicingService: InvoicingService) {}

  @Get()
  @RequirePermissions('invoicing.invoice.read')
  @ApiOperation({ summary: 'List customer invoices and credit notes' })
  findAll() {
    return notImplemented('Invoicing · Customer invoices: List customer invoices and credit notes');
  }

  @Get(':id')
  @RequirePermissions('invoicing.invoice.read')
  @ApiOperation({ summary: 'Get an invoice with lines and payments' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return notImplemented('Invoicing · Customer invoices: Get an invoice with lines and payments');
  }

  @Post()
  @RequirePermissions('invoicing.invoice.write')
  @ApiOperation({ summary: 'Create a draft invoice (manually or from a sales order)' })
  create() {
    return notImplemented(
      'Invoicing · Customer invoices: Create a draft invoice (manually or from a sales order)',
    );
  }

  @Patch(':id')
  @RequirePermissions('invoicing.invoice.write')
  @ApiOperation({ summary: 'Update a draft invoice' })
  update(@Param('id', ParseUUIDPipe) id: string) {
    return notImplemented('Invoicing · Customer invoices: Update a draft invoice');
  }

  @Post(':id/post')
  @RequirePermissions('invoicing.invoice.post')
  @ApiOperation({ summary: 'Post an invoice (assigns number, becomes immutable)' })
  post(@Param('id', ParseUUIDPipe) id: string) {
    return notImplemented(
      'Invoicing · Customer invoices: Post an invoice (assigns number, becomes immutable)',
    );
  }

  @Post(':id/cancel')
  @RequirePermissions('invoicing.invoice.post')
  @ApiOperation({ summary: 'Cancel an invoice' })
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return notImplemented('Invoicing · Customer invoices: Cancel an invoice');
  }

  @Post(':id/credit-note')
  @RequirePermissions('invoicing.invoice.post')
  @ApiOperation({ summary: 'Create a credit note correcting a posted invoice' })
  creditNote(@Param('id', ParseUUIDPipe) id: string) {
    return notImplemented(
      'Invoicing · Customer invoices: Create a credit note correcting a posted invoice',
    );
  }

  @Get(':id/pdf')
  @RequirePermissions('invoicing.invoice.read')
  @ApiOperation({ summary: 'Download the invoice PDF' })
  getPdf(@Param('id', ParseUUIDPipe) id: string) {
    return notImplemented('Invoicing · Customer invoices: Download the invoice PDF');
  }
}
