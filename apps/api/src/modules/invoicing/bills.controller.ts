import {
  Body,
  Controller,
  Delete,
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
import type {
  BillDetail,
  BillListItem,
  BillLookups,
  BillSummary,
  BillableReceipt,
  Paginated,
} from '@erp/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RequestUser } from '../../common/types/request-user';
import { XLSX_MIME, writeXlsx } from '../../common/xlsx';
import { BillsService } from './bills.service';
import {
  BillableQueryDto,
  CancelBillDto,
  CreateBillDto,
  ExportBillsQueryDto,
  ListBillsQueryDto,
  UpdateBillDto,
} from './dto/bill.dto';

const EXPORT_TEXT = {
  en: {
    sheet: 'Supplier bills',
    cols: [
      'Number',
      'Status',
      'Supplier code',
      'Supplier',
      'Supplier ref',
      'Order',
      'Bill date',
      'Due date',
      'Currency',
      'Total',
      'Paid',
      'Balance',
      'Days overdue',
    ],
  },
  fr: {
    sheet: 'Factures fournisseurs',
    cols: [
      'Numéro',
      'Statut',
      'Code fournisseur',
      'Fournisseur',
      'Réf. fournisseur',
      'Commande',
      'Date facture',
      'Échéance',
      'Devise',
      'Total TTC',
      'Payé',
      'Reste dû',
      'Jours de retard',
    ],
  },
} as const;

@ApiTags('Invoicing · Supplier bills')
@Controller('invoicing/bills')
export class BillsController {
  constructor(private readonly bills: BillsService) {}

  @Get()
  @RequirePermissions('invoicing.bill.read')
  @ApiOperation({ summary: 'List supplier bills' })
  findAll(@Query() query: ListBillsQueryDto): Promise<Paginated<BillListItem>> {
    return this.bills.list(query);
  }

  // Fixed routes before ':id'
  @Get('summary')
  @RequirePermissions('invoicing.bill.read')
  @ApiOperation({ summary: 'Drafts, open and overdue balances per currency, aging' })
  summary(): Promise<BillSummary> {
    return this.bills.summary();
  }

  @Get('lookups')
  @RequirePermissions('invoicing.bill.read')
  @ApiOperation({ summary: 'Company currency and tax rates for the bill form' })
  lookups(): Promise<BillLookups> {
    return this.bills.lookups();
  }

  @Get('billable')
  @RequirePermissions('invoicing.bill.read')
  @ApiOperation({ summary: "A supplier's posted receipts with quantities not billed yet" })
  billable(@Query() query: BillableQueryDto): Promise<BillableReceipt[]> {
    return this.bills.billable(query);
  }

  @Get('export')
  @RequirePermissions('invoicing.bill.read')
  @ApiOperation({ summary: 'Download the bills matching the list filters as Excel' })
  async export(@Query() query: ExportBillsQueryDto): Promise<StreamableFile> {
    const rows = await this.bills.exportRows(query);
    const tx = EXPORT_TEXT[query.lang];
    const num = (v: string) => Number(v);
    const file = await writeXlsx([
      {
        name: tx.sheet,
        rows: [
          [...tx.cols],
          ...rows.map((b) => [
            b.number,
            b.status,
            b.supplier.code,
            b.supplier.name,
            b.supplierRef,
            b.purchaseOrder?.number ?? null,
            b.issueDate,
            b.dueDate,
            b.currency,
            num(b.total),
            num(b.amountPaid),
            num(b.balance),
            b.daysOverdue || null,
          ]),
        ],
        widths: [18, 14, 12, 28, 16, 16, 12, 12, 8, 14, 14, 14, 10],
        numFmt: { 9: '#,##0.000', 10: '#,##0.000', 11: '#,##0.000' },
      },
    ]);
    const date = new Date().toISOString().slice(0, 10);
    return new StreamableFile(file, {
      type: XLSX_MIME,
      disposition: `attachment; filename="supplier-bills-${date}.xlsx"`,
    });
  }

  @Get(':id')
  @RequirePermissions('invoicing.bill.read')
  @ApiOperation({ summary: 'Get a supplier bill with lines, payments and warnings' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<BillDetail> {
    return this.bills.get(id);
  }

  @Post()
  @RequirePermissions('invoicing.bill.write')
  @ApiOperation({ summary: 'Create a draft supplier bill (from received lines and/or free lines)' })
  create(@Body() dto: CreateBillDto, @CurrentUser() user: RequestUser): Promise<BillDetail> {
    return this.bills.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions('invoicing.bill.write')
  @ApiOperation({ summary: 'Update a draft supplier bill' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBillDto,
    @CurrentUser() user: RequestUser,
  ): Promise<BillDetail> {
    return this.bills.update(id, dto, user);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('invoicing.bill.write')
  @ApiOperation({ summary: 'Delete a draft supplier bill' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser): Promise<void> {
    return this.bills.remove(id, user);
  }

  @Post(':id/post')
  @RequirePermissions('invoicing.bill.write')
  @ApiOperation({ summary: 'Post a supplier bill (final number, immutable, lines billed)' })
  post(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<BillDetail> {
    return this.bills.post(id, user);
  }

  @Post(':id/cancel')
  @RequirePermissions('invoicing.bill.write')
  @ApiOperation({ summary: 'Cancel a posted bill without payments' })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelBillDto,
    @CurrentUser() user: RequestUser,
  ): Promise<BillDetail> {
    return this.bills.cancel(id, dto, user);
  }
}
