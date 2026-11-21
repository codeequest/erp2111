import { Controller, Get, Post, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { notImplemented } from '../../common/not-implemented';
import { SalesService } from './sales.service';

/**
 * SKELETON — every endpoint answers 501 Not Implemented.
 * Routes and permissions are final; replace notImplemented(...) with calls to
 * SalesService and add DTOs (class-validator) for request bodies.
 */
@ApiTags('Sales · Deliveries')
@Controller('sales/deliveries')
export class DeliveriesController {
  constructor(private readonly salesService: SalesService) {}

  @Get()
  @RequirePermissions('sales.order.read')
  @ApiOperation({ summary: 'List deliveries' })
  findAll() {
    return notImplemented('Sales · Deliveries: List deliveries');
  }

  @Get(':id')
  @RequirePermissions('sales.order.read')
  @ApiOperation({ summary: 'Get a delivery' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return notImplemented('Sales · Deliveries: Get a delivery');
  }

  @Post()
  @RequirePermissions('sales.delivery.create')
  @ApiOperation({ summary: 'Deliver goods against a sales order (stock OUT)' })
  create() {
    return notImplemented('Sales · Deliveries: Deliver goods against a sales order (stock OUT)');
  }

  @Get(':id/pdf')
  @RequirePermissions('sales.order.read')
  @ApiOperation({ summary: 'Download the delivery note PDF' })
  getPdf(@Param('id', ParseUUIDPipe) id: string) {
    return notImplemented('Sales · Deliveries: Download the delivery note PDF');
  }
}
