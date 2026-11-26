import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  DeliveryListItem,
  GoodsReceiptDetail,
  GoodsReceiptListItem,
  GoodsReceiptSummary,
  Paginated,
} from '@erp/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RequestUser } from '../../common/types/request-user';
import { XLSX_MIME } from '../../common/xlsx';
import {
  CreateGoodsReceiptDto,
  ExportDeliveriesQueryDto,
  ExportGoodsReceiptsQueryDto,
  ListDeliveriesQueryDto,
  ListGoodsReceiptsQueryDto,
  SetSupplierInvoiceDto,
} from './dto/goods-receipt.dto';
import { GoodsReceiptsService } from './goods-receipts.service';
import { PurchasingExportService } from './purchasing-export.service';

@ApiTags('Purchasing · Goods receipts')
@Controller('purchasing/receipts')
export class GoodsReceiptsController {
  constructor(
    private readonly receipts: GoodsReceiptsService,
    private readonly exporter: PurchasingExportService,
  ) {}

  @Get()
  @RequirePermissions('purchasing.order.read')
  @ApiOperation({ summary: 'List goods receipts' })
  findAll(@Query() query: ListGoodsReceiptsQueryDto): Promise<Paginated<GoodsReceiptListItem>> {
    return this.receipts.list(query);
  }

  // Fixed routes before ':id'
  @Get('summary')
  @RequirePermissions('purchasing.order.read')
  @ApiOperation({ summary: 'Receipts this month and orders waiting to be received' })
  summary(): Promise<GoodsReceiptSummary> {
    return this.receipts.summary();
  }

  @Get('deliveries')
  @RequirePermissions('purchasing.order.read')
  @ApiOperation({
    summary: 'Delivery follow-up of confirmed orders: waiting, in progress or delivered',
  })
  deliveries(@Query() query: ListDeliveriesQueryDto): Promise<Paginated<DeliveryListItem>> {
    return this.receipts.deliveries(query);
  }

  @Get('deliveries/export')
  @RequirePermissions('purchasing.order.read')
  @ApiOperation({ summary: 'Download the delivery follow-up as Excel' })
  async exportDeliveries(@Query() query: ExportDeliveriesQueryDto): Promise<StreamableFile> {
    const date = new Date().toISOString().slice(0, 10);
    const file = await this.exporter.deliveriesXlsx(query);
    return new StreamableFile(file, {
      type: XLSX_MIME,
      disposition: `attachment; filename="deliveries-${date}.xlsx"`,
    });
  }

  @Get('export')
  @RequirePermissions('purchasing.order.read')
  @ApiOperation({
    summary: 'Download the receipts matching the list filters as Excel (receipts + lines sheets)',
  })
  async export(@Query() query: ExportGoodsReceiptsQueryDto): Promise<StreamableFile> {
    const date = new Date().toISOString().slice(0, 10);
    const file = await this.exporter.receiptsXlsx(query);
    return new StreamableFile(file, {
      type: XLSX_MIME,
      disposition: `attachment; filename="goods-receipts-${date}.xlsx"`,
    });
  }

  @Get(':id')
  @RequirePermissions('purchasing.order.read')
  @ApiOperation({ summary: 'Get a goods receipt' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<GoodsReceiptDetail> {
    return this.receipts.get(id);
  }

  @Post()
  @RequirePermissions('purchasing.receipt.create')
  @ApiOperation({
    summary:
      'Receive goods against a confirmed PO (partial allowed): stock IN, average cost, PO status',
  })
  create(
    @Body() dto: CreateGoodsReceiptDto,
    @CurrentUser() user: RequestUser,
  ): Promise<GoodsReceiptDetail> {
    return this.receipts.create(dto, user);
  }

  @Patch(':id/invoice')
  @RequirePermissions('purchasing.receipt.create')
  @ApiOperation({
    summary:
      'Record the supplier invoice of a delivered order (100% received), on its completing receipt',
  })
  setInvoice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetSupplierInvoiceDto,
    @CurrentUser() user: RequestUser,
  ): Promise<GoodsReceiptDetail> {
    return this.receipts.setInvoice(id, dto, user);
  }
}
