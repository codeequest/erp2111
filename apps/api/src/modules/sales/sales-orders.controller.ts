import { Controller, Get, Post, Patch, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { notImplemented } from '../../common/not-implemented';
import { SalesService } from './sales.service';

/**
 * SKELETON — every endpoint answers 501 Not Implemented.
 * Routes and permissions are final; replace notImplemented(...) with calls to
 * SalesService and add DTOs (class-validator) for request bodies.
 */
@ApiTags('Sales · Quotations & orders')
@Controller('sales/orders')
export class SalesOrdersController {
  constructor(private readonly salesService: SalesService) {}

  @Get()
  @RequirePermissions('sales.order.read')
  @ApiOperation({ summary: 'List quotations and sales orders' })
  findAll() {
    return notImplemented('Sales · Quotations & orders: List quotations and sales orders');
  }

  @Get(':id')
  @RequirePermissions('sales.order.read')
  @ApiOperation({ summary: 'Get a quotation / order with lines and deliveries' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return notImplemented(
      'Sales · Quotations & orders: Get a quotation / order with lines and deliveries',
    );
  }

  @Post()
  @RequirePermissions('sales.order.write')
  @ApiOperation({ summary: 'Create a quotation' })
  create() {
    return notImplemented('Sales · Quotations & orders: Create a quotation');
  }

  @Patch(':id')
  @RequirePermissions('sales.order.write')
  @ApiOperation({ summary: 'Update a quotation' })
  update(@Param('id', ParseUUIDPipe) id: string) {
    return notImplemented('Sales · Quotations & orders: Update a quotation');
  }

  @Post(':id/confirm')
  @RequirePermissions('sales.order.confirm')
  @ApiOperation({ summary: 'Confirm: quotation → sales order (stock + credit checks)' })
  confirm(@Param('id', ParseUUIDPipe) id: string) {
    return notImplemented(
      'Sales · Quotations & orders: Confirm: quotation → sales order (stock + credit checks)',
    );
  }

  @Post(':id/cancel')
  @RequirePermissions('sales.order.confirm')
  @ApiOperation({ summary: 'Cancel a sales order' })
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return notImplemented('Sales · Quotations & orders: Cancel a sales order');
  }

  @Get(':id/pdf')
  @RequirePermissions('sales.order.read')
  @ApiOperation({ summary: 'Download the quotation / order PDF' })
  getPdf(@Param('id', ParseUUIDPipe) id: string) {
    return notImplemented('Sales · Quotations & orders: Download the quotation / order PDF');
  }
}
