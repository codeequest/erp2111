import { Controller, Get, Post, Patch, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { notImplemented } from '../../common/not-implemented';
import { PurchasingService } from './purchasing.service';

/**
 * SKELETON — every endpoint answers 501 Not Implemented.
 * Routes and permissions are final; replace notImplemented(...) with calls to
 * PurchasingService and add DTOs (class-validator) for request bodies.
 */
@ApiTags('Purchasing · Orders')
@Controller('purchasing/orders')
export class PurchaseOrdersController {
  constructor(private readonly purchasingService: PurchasingService) {}

  @Get()
  @RequirePermissions('purchasing.order.read')
  @ApiOperation({ summary: 'List purchase orders' })
  findAll() {
    return notImplemented('Purchasing · Orders: List purchase orders');
  }

  @Get(':id')
  @RequirePermissions('purchasing.order.read')
  @ApiOperation({ summary: 'Get a purchase order with lines and receipts' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return notImplemented('Purchasing · Orders: Get a purchase order with lines and receipts');
  }

  @Post()
  @RequirePermissions('purchasing.order.write')
  @ApiOperation({ summary: 'Create a draft purchase order' })
  create() {
    return notImplemented('Purchasing · Orders: Create a draft purchase order');
  }

  @Patch(':id')
  @RequirePermissions('purchasing.order.write')
  @ApiOperation({ summary: 'Update a draft purchase order' })
  update(@Param('id', ParseUUIDPipe) id: string) {
    return notImplemented('Purchasing · Orders: Update a draft purchase order');
  }

  @Post(':id/confirm')
  @RequirePermissions('purchasing.order.confirm')
  @ApiOperation({ summary: 'Confirm a purchase order' })
  confirm(@Param('id', ParseUUIDPipe) id: string) {
    return notImplemented('Purchasing · Orders: Confirm a purchase order');
  }

  @Post(':id/cancel')
  @RequirePermissions('purchasing.order.confirm')
  @ApiOperation({ summary: 'Cancel a purchase order' })
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return notImplemented('Purchasing · Orders: Cancel a purchase order');
  }

  @Get(':id/pdf')
  @RequirePermissions('purchasing.order.read')
  @ApiOperation({ summary: 'Download the purchase order PDF' })
  getPdf(@Param('id', ParseUUIDPipe) id: string) {
    return notImplemented('Purchasing · Orders: Download the purchase order PDF');
  }
}
