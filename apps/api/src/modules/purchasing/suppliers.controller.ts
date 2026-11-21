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
@ApiTags('Purchasing · Suppliers')
@Controller('purchasing/suppliers')
export class SuppliersController {
  constructor(private readonly purchasingService: PurchasingService) {}

  @Get()
  @RequirePermissions('purchasing.supplier.read')
  @ApiOperation({ summary: 'List / search suppliers' })
  findAll() {
    return notImplemented('Purchasing · Suppliers: List / search suppliers');
  }

  @Get(':id')
  @RequirePermissions('purchasing.supplier.read')
  @ApiOperation({ summary: 'Get a supplier with balance' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return notImplemented('Purchasing · Suppliers: Get a supplier with balance');
  }

  @Post()
  @RequirePermissions('purchasing.supplier.write')
  @ApiOperation({ summary: 'Create a supplier' })
  create() {
    return notImplemented('Purchasing · Suppliers: Create a supplier');
  }

  @Patch(':id')
  @RequirePermissions('purchasing.supplier.write')
  @ApiOperation({ summary: 'Update a supplier' })
  update(@Param('id', ParseUUIDPipe) id: string) {
    return notImplemented('Purchasing · Suppliers: Update a supplier');
  }
}
