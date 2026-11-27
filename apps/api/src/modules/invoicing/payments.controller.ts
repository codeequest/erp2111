import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Paginated, PaymentDetail, PaymentListItem } from '@erp/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RequestUser } from '../../common/types/request-user';
import { CreatePaymentDto, ListPaymentsQueryDto } from './dto/bill.dto';
import { PaymentsService } from './payments.service';

@ApiTags('Invoicing · Payments')
@Controller('invoicing/payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @RequirePermissions('invoicing.payment.read')
  @ApiOperation({ summary: 'List payments' })
  findAll(@Query() query: ListPaymentsQueryDto): Promise<Paginated<PaymentListItem>> {
    return this.payments.list(query);
  }

  @Get(':id')
  @RequirePermissions('invoicing.payment.read')
  @ApiOperation({ summary: 'Get a payment with its allocations' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<PaymentDetail> {
    return this.payments.get(id);
  }

  @Post()
  @RequirePermissions('invoicing.payment.record')
  @ApiOperation({ summary: 'Record a payment to a supplier and allocate it to open bills' })
  create(@Body() dto: CreatePaymentDto, @CurrentUser() user: RequestUser): Promise<PaymentDetail> {
    return this.payments.create(dto, user);
  }
}
