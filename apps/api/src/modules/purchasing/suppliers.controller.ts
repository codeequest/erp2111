import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Paginated, SupplierDetail, SupplierListItem, SupplierLookups } from '@erp/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RequestUser } from '../../common/types/request-user';
import { XLSX_MIME } from '../../common/xlsx';
import {
  CreateSupplierDto,
  ExportSuppliersQueryDto,
  ListSuppliersQueryDto,
  UpdateSupplierDto,
} from './dto/supplier.dto';
import { PurchasingExportService } from './purchasing-export.service';
import { SuppliersService } from './suppliers.service';

@ApiTags('Purchasing · Suppliers')
@Controller('purchasing/suppliers')
export class SuppliersController {
  constructor(
    private readonly suppliers: SuppliersService,
    private readonly exporter: PurchasingExportService,
  ) {}

  @Get()
  @RequirePermissions('purchasing.supplier.read')
  @ApiOperation({ summary: 'List / search suppliers' })
  findAll(@Query() query: ListSuppliersQueryDto): Promise<Paginated<SupplierListItem>> {
    return this.suppliers.list(query);
  }

  // Declared before :id so "lookups" / "export" are not taken for an id.
  @Get('export')
  @RequirePermissions('purchasing.supplier.read')
  @ApiOperation({ summary: 'Download the suppliers matching the list filters as Excel' })
  async export(@Query() query: ExportSuppliersQueryDto): Promise<StreamableFile> {
    const date = new Date().toISOString().slice(0, 10);
    const file = await this.exporter.suppliersXlsx(query);
    return new StreamableFile(file, {
      type: XLSX_MIME,
      disposition: `attachment; filename="suppliers-${date}.xlsx"`,
    });
  }

  @Get('lookups')
  @RequirePermissions('purchasing.supplier.read')
  @ApiOperation({ summary: 'Choices for the supplier form (active tax rates)' })
  lookups(): Promise<SupplierLookups> {
    return this.suppliers.lookups();
  }

  @Get(':id')
  @RequirePermissions('purchasing.supplier.read')
  @ApiOperation({ summary: 'Get a supplier with its order figures' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<SupplierDetail> {
    return this.suppliers.get(id);
  }

  @Post()
  @RequirePermissions('purchasing.supplier.write')
  @ApiOperation({ summary: 'Create a supplier (code generated when left empty)' })
  create(
    @Body() dto: CreateSupplierDto,
    @CurrentUser() user: RequestUser,
  ): Promise<SupplierDetail> {
    return this.suppliers.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions('purchasing.supplier.write')
  @ApiOperation({ summary: 'Update a supplier; isActive=false deactivates it' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupplierDto,
    @CurrentUser() user: RequestUser,
  ): Promise<SupplierDetail> {
    return this.suppliers.update(id, dto, user);
  }
}
