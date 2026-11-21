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
@ApiTags('Sales · Customers')
@Controller('sales/customers')
export class CustomersController {
  constructor(private readonly salesService: SalesService) {}

  @Get()
  @RequirePermissions('sales.customer.read')
  @ApiOperation({ summary: 'List / search customers' })
  findAll() {
    return notImplemented('Sales · Customers: List / search customers');
  }

  @Get(':id')
  @RequirePermissions('sales.customer.read')
  @ApiOperation({ summary: 'Get a customer with balance' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return notImplemented('Sales · Customers: Get a customer with balance');
  }

  @Post()
  @RequirePermissions('sales.customer.write')
  @ApiOperation({ summary: 'Create a customer' })
  create() {
    return notImplemented('Sales · Customers: Create a customer');
  }

  @Patch(':id')
  @RequirePermissions('sales.customer.write')
  @ApiOperation({ summary: 'Update a customer' })
  update(@Param('id', ParseUUIDPipe) id: string) {
    return notImplemented('Sales · Customers: Update a customer');
  }
}
