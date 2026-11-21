import { Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { notImplemented } from '../../common/not-implemented';
import { SalesService } from './sales.service';

/**
 * SKELETON — every endpoint answers 501 Not Implemented.
 * Routes and permissions are final; replace notImplemented(...) with calls to
 * SalesService and add DTOs (class-validator) for request bodies.
 */
@ApiTags('Sales · Returns')
@Controller('sales/returns')
export class ReturnsController {
  constructor(private readonly salesService: SalesService) {}

  @Get()
  @RequirePermissions('sales.order.read')
  @ApiOperation({ summary: 'List customer returns' })
  findAll() {
    return notImplemented('Sales · Returns: List customer returns');
  }

  @Post()
  @RequirePermissions('sales.return.create')
  @ApiOperation({ summary: 'Register a customer return (stock IN + credit note)' })
  create() {
    return notImplemented('Sales · Returns: Register a customer return (stock IN + credit note)');
  }
}
