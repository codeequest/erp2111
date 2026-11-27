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
  AttachableReceipt,
  GoodsReceiptSummary,
  Paginated,
  ReceivingSettings,
} from '@erp/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RequestUser } from '../../common/types/request-user';
import { XLSX_MIME, writeXlsx } from '../../common/xlsx';
import {
  AttachReceiptDto,
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

  @Get('attachable')
  @RequirePermissions('purchasing.order.read')
  @ApiOperation({
    summary: "Validated receipts of an order's supplier that are not attached to an order yet",
  })
  attachable(
    @Query('purchaseOrderId', ParseUUIDPipe) purchaseOrderId: string,
  ): Promise<AttachableReceipt[]> {
    return this.receipts.attachable(purchaseOrderId);
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

  @Get(':id/export')
  @RequirePermissions('purchasing.order.read')
  @ApiOperation({ summary: 'Download one goods receipt as Excel (header + lines)' })
  async exportOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('lang') lang?: string,
  ): Promise<StreamableFile> {
    const r = await this.receipts.get(id);
    const fr = lang === 'fr';
    const s = r.supplierInfo;
    const num = (v: string) => Number(v);
    const quality = (q: string) =>
      q === 'NON_CONFORM' ? (fr ? 'Non conforme' : 'Non-conform') : fr ? 'Conforme' : 'Conform';
    const info: [string, string | number | null][] = [
      [fr ? 'Bon de réception' : 'Goods receipt', r.number],
      [fr ? 'Statut' : 'Status', r.status],
      [fr ? 'Date de réception' : 'Received on', r.receivedAt.slice(0, 10)],
      [fr ? 'Bon de commande' : 'Purchase order', r.purchaseOrder?.number ?? null],
      [fr ? 'Date de commande' : 'Order date', r.purchaseOrderDate],
      [fr ? 'BL fournisseur' : 'Supplier delivery note', r.supplierRef],
      [fr ? 'Dépôt' : 'Warehouse', `${r.warehouse.code} · ${r.warehouse.name}`],
      [fr ? 'Fournisseur' : 'Supplier', `${s.code} · ${s.name}`],
      [fr ? 'Matricule fiscal' : 'Tax ID', s.taxId],
      ['RNE', s.rne],
      [fr ? 'Téléphone' : 'Phone', s.phone],
      ['E-mail', s.email],
      [fr ? 'Adresse' : 'Address', s.address],
      [fr ? 'Reçu par' : 'Received by', r.createdBy.fullName],
      [fr ? 'Valeur HT' : 'Value excl. VAT', num(r.value)],
      [fr ? 'Notes' : 'Notes', r.notes],
    ];
    const cols = fr
      ? [
          'Réf.',
          'Article',
          'Code-barres',
          'Unité',
          'Reçu',
          'Refusé',
          'Entré en stock',
          'Lot',
          'Péremption',
          'Qualité',
          'Observation',
          'Prix unitaire HT',
          'Valeur HT',
        ]
      : [
          'SKU',
          'Product',
          'Barcode',
          'Unit',
          'Received',
          'Refused',
          'Into stock',
          'Lot',
          'Expiry',
          'Quality',
          'Observation',
          'Unit price excl. VAT',
          'Value excl. VAT',
        ];
    const file = await writeXlsx([
      {
        name: r.number.slice(0, 31),
        rows: [
          cols,
          ...r.lines.map((l) => [
            l.product.sku,
            l.product.name,
            l.product.barcode,
            l.unit.code,
            num(l.quantity),
            num(l.rejectedQty) || null,
            num(l.baseQuantity),
            l.lotNumber,
            l.expiryDate,
            quality(l.quality),
            l.rejectReason,
            num(l.unitPrice),
            num(l.value),
          ]),
        ],
        widths: [12, 32, 16, 8, 10, 10, 12, 14, 12, 14, 28, 12, 14],
        numFmt: {
          4: '#,##0.####',
          5: '#,##0.####',
          6: '#,##0.####',
          11: '#,##0.000#',
          12: '#,##0.000',
        },
      },
      {
        name: fr ? 'En-tête' : 'Header',
        rows: [[fr ? 'Champ' : 'Field', fr ? 'Valeur' : 'Value'], ...info],
        widths: [26, 48],
      },
    ]);
    return new StreamableFile(file, {
      type: XLSX_MIME,
      disposition: `attachment; filename="${r.number}.xlsx"`,
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
      'Receive goods from a supplier (products entered or scanned): posted at once (stock IN, costs), or saved as a draft with asDraft',
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

  @Post(':id/attach')
  @RequirePermissions('purchasing.receipt.create')
  @ApiOperation({
    summary: "Attach a validated receipt to an order: the order's received quantities follow",
  })
  attach(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AttachReceiptDto,
    @CurrentUser() user: RequestUser,
  ): Promise<GoodsReceiptDetail> {
    return this.receipts.attach(id, dto, user);
  }

  @Post(':id/detach')
  @RequirePermissions('purchasing.receipt.create')
  @ApiOperation({ summary: 'Detach a receipt from its order' })
  detach(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<GoodsReceiptDetail> {
    return this.receipts.detach(id, user);
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
