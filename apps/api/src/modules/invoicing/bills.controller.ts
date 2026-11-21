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
@ApiTags('Invoicing · Supplier bills')
@Controller('invoicing/bills')
export class BillsController {
  constructor(private readonly invoicingService: InvoicingService) {}

  @Get()
  @RequirePermissions('invoicing.bill.read')
  @ApiOperation({ summary: 'List supplier bills' })
  findAll() {
    return notImplemented('Invoicing · Supplier bills: List supplier bills');
  }

  @Get(':id')
  @RequirePermissions('invoicing.bill.read')
  @ApiOperation({ summary: 'Get a supplier bill' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return notImplemented('Invoicing · Supplier bills: Get a supplier bill');
  }

  @Post()
  @RequirePermissions('invoicing.bill.write')
  @ApiOperation({ summary: 'Create a supplier bill (manually or from a PO)' })
  create() {
    return notImplemented(
      'Invoicing · Supplier bills: Create a supplier bill (manually or from a PO)',
    );
  }

  @Patch(':id')
  @RequirePermissions('invoicing.bill.write')
  @ApiOperation({ summary: 'Update a draft supplier bill' })
  update(@Param('id', ParseUUIDPipe) id: string) {
    return notImplemented('Invoicing · Supplier bills: Update a draft supplier bill');
  }

  @Post(':id/post')
  @RequirePermissions('invoicing.bill.write')
  @ApiOperation({ summary: 'Post a supplier bill' })
  post(@Param('id', ParseUUIDPipe) id: string) {
    return notImplemented('Invoicing · Supplier bills: Post a supplier bill');
  }
}
