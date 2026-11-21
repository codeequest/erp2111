import { Controller, Get, Post, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { notImplemented } from '../../common/not-implemented';
import { PurchasingService } from './purchasing.service';

/**
 * SKELETON — every endpoint answers 501 Not Implemented.
 * Routes and permissions are final; replace notImplemented(...) with calls to
 * PurchasingService and add DTOs (class-validator) for request bodies.
 */
@ApiTags('Purchasing · Goods receipts')
@Controller('purchasing/receipts')
export class GoodsReceiptsController {
  constructor(private readonly purchasingService: PurchasingService) {}

  @Get()
  @RequirePermissions('purchasing.order.read')
  @ApiOperation({ summary: 'List goods receipts' })
  findAll() {
    return notImplemented('Purchasing · Goods receipts: List goods receipts');
  }

  @Get(':id')
  @RequirePermissions('purchasing.order.read')
  @ApiOperation({ summary: 'Get a goods receipt' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return notImplemented('Purchasing · Goods receipts: Get a goods receipt');
  }

  @Post()
  @RequirePermissions('purchasing.receipt.create')
  @ApiOperation({ summary: 'Receive goods against a PO (stock IN, updates average cost)' })
  create() {
    return notImplemented(
      'Purchasing · Goods receipts: Receive goods against a PO (stock IN, updates average cost)',
    );
  }
}
