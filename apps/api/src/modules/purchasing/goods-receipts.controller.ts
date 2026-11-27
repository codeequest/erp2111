import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
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
  ReceivingSettings,
} from '@erp/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RequestUser } from '../../common/types/request-user';
import { XLSX_MIME } from '../../common/xlsx';
import {
  CancelGoodsReceiptDto,
  CreateGoodsReceiptDto,
  ExportDeliveriesQueryDto,
  ExportGoodsReceiptsQueryDto,
  ListDeliveriesQueryDto,
  ListGoodsReceiptsQueryDto,
  SetSupplierInvoiceDto,
  UpdateGoodsReceiptDto,
  UpdateReceivingSettingsDto,
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

  @Get('settings')
  @RequirePermissions('purchasing.order.read')
  @ApiOperation({ summary: 'Receiving settings (over-receipt tolerance)' })
  settings(): Promise<ReceivingSettings> {
    return this.receipts.settings();
  }

  @Patch('settings')
  @RequirePermissions('admin.settings.manage')
  @ApiOperation({ summary: 'Change the over-receipt tolerance' })
  updateSettings(
    @Body() dto: UpdateReceivingSettingsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ReceivingSettings> {
    return this.receipts.updateSettings(dto, user);
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
      'Receive goods against a confirmed PO (partial allowed): posted at once (stock IN, costs, PO status), or saved as a draft with asDraft',
  })
  create(
    @Body() dto: CreateGoodsReceiptDto,
    @CurrentUser() user: RequestUser,
  ): Promise<GoodsReceiptDetail> {
    return this.receipts.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions('purchasing.receipt.create')
  @ApiOperation({ summary: 'Update a draft goods receipt (same order)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGoodsReceiptDto,
    @CurrentUser() user: RequestUser,
  ): Promise<GoodsReceiptDetail> {
    return this.receipts.update(id, dto, user);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('purchasing.receipt.create')
  @ApiOperation({ summary: 'Delete a draft goods receipt' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser): Promise<void> {
    return this.receipts.remove(id, user);
  }

  @Post(':id/post')
  @RequirePermissions('purchasing.receipt.create')
  @ApiOperation({
    summary: 'Post a draft receipt: number, stock IN, average and last purchase cost, PO status',
  })
  post(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<GoodsReceiptDetail> {
    return this.receipts.post(id, user);
  }

  @Post(':id/cancel')
  @RequirePermissions('purchasing.receipt.cancel')
  @ApiOperation({
    summary:
      'Cancel a posted receipt: reversing stock moves, PO quantities back (refused once billed)',
  })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelGoodsReceiptDto,
    @CurrentUser() user: RequestUser,
  ): Promise<GoodsReceiptDetail> {
    return this.receipts.cancel(id, dto, user);
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
