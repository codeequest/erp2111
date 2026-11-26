import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Paginated, PurchaseOrderDetail, PurchaseOrderListItem } from '@erp/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { notImplemented } from '../../common/not-implemented';
import { RequestUser } from '../../common/types/request-user';
import { XLSX_MIME } from '../../common/xlsx';
import { PurchasingExportService } from './purchasing-export.service';
import {
  CreatePurchaseOrderDto,
  ExportPurchaseOrdersQueryDto,
  ListPurchaseOrdersQueryDto,
  UpdatePurchaseOrderDto,
} from './dto/purchase-order.dto';
import { PurchaseOrdersService } from './purchase-orders.service';

@ApiTags('Purchasing · Orders')
@Controller('purchasing/orders')
export class PurchaseOrdersController {
  constructor(
    private readonly orders: PurchaseOrdersService,
    private readonly exporter: PurchasingExportService,
  ) {}

  @Get()
  @RequirePermissions('purchasing.order.read')
  @ApiOperation({ summary: 'List purchase orders' })
  findAll(@Query() query: ListPurchaseOrdersQueryDto): Promise<Paginated<PurchaseOrderListItem>> {
    return this.orders.list(query);
  }

  // Declared before :id so "export" is not taken for an id.
  @Get('export')
  @RequirePermissions('purchasing.order.read')
  @ApiOperation({
    summary: 'Download the orders matching the list filters as Excel (orders + lines sheets)',
  })
  async export(@Query() query: ExportPurchaseOrdersQueryDto): Promise<StreamableFile> {
    const date = new Date().toISOString().slice(0, 10);
    const file = await this.exporter.ordersXlsx(query);
    return new StreamableFile(file, {
      type: XLSX_MIME,
      disposition: `attachment; filename="purchase-orders-${date}.xlsx"`,
    });
  }

  @Get(':id')
  @RequirePermissions('purchasing.order.read')
  @ApiOperation({ summary: 'Get a purchase order with lines and receipts' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<PurchaseOrderDetail> {
    return this.orders.get(id);
  }

  @Post()
  @RequirePermissions('purchasing.order.write')
  @ApiOperation({ summary: 'Create a draft purchase order' })
  create(
    @Body() dto: CreatePurchaseOrderDto,
    @CurrentUser() user: RequestUser,
  ): Promise<PurchaseOrderDetail> {
    return this.orders.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions('purchasing.order.write')
  @ApiOperation({ summary: 'Update a draft purchase order (lines, when sent, replace all lines)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePurchaseOrderDto,
    @CurrentUser() user: RequestUser,
  ): Promise<PurchaseOrderDetail> {
    return this.orders.update(id, dto, user);
  }

  @Post(':id/confirm')
  @HttpCode(200)
  @RequirePermissions('purchasing.order.confirm')
  @ApiOperation({ summary: 'Confirm a purchase order' })
  confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<PurchaseOrderDetail> {
    return this.orders.confirm(id, user);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermissions('purchasing.order.confirm')
  @ApiOperation({ summary: 'Cancel a purchase order (nothing received yet)' })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<PurchaseOrderDetail> {
    return this.orders.cancel(id, user);
  }

  @Get(':id/pdf')
  @RequirePermissions('purchasing.order.read')
  @ApiOperation({
    summary: 'Download the purchase order PDF (not built yet: comes with Invoicing PDFs)',
  })
  getPdf(@Param('id', ParseUUIDPipe) id: string) {
    return notImplemented('Purchasing · Orders: Download the purchase order PDF');
  }
}
