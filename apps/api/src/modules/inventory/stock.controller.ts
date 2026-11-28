import {
  BadRequestException,
  Controller,
  Get,
  Header,
  HttpCode,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RequestUser } from '../../common/types/request-user';
import { readTable, toXlsx, xlsxFile } from '../../common/spreadsheet';
import { OPENING_CSV_COLUMNS } from '@erp/shared';
import { StockLevelsQueryDto, StockMovesQueryDto } from './dto/stock-query.dto';
import { OpeningImportQueryDto } from './dto/warehouse.dto';
import { UploadedFileData } from './product-bulk.service';
import { OpeningBalanceService } from './stock/opening-balance.service';
import { StockReportsService } from './stock/stock-reports.service';

const CSV_LIMIT_BYTES = 10 * 1024 * 1024;
const FILE_BODY = {
  schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
};

/**
 * Stock endpoints: levels, ledger, consistency check and opening balances.
 * Adjustments and transfers are documents with their own routes:
 * see stock-documents.controller.ts.
 */
@ApiTags('Inventory · Stock')
@ApiBearerAuth()
@Controller('inventory/stock')
export class StockController {
  constructor(
    private readonly opening: OpeningBalanceService,
    private readonly reports: StockReportsService,
  ) {}

  @Get('levels')
  @RequirePermissions('inventory.stock.read')
  @ApiOperation({
    summary: 'Stock per product: on hand, reserved, available, low stock (value with inventory.cost.view)',
  })
  getLevels(@Query() query: StockLevelsQueryDto, @CurrentUser() user: RequestUser) {
    return this.reports.levels(query, user);
  }

  @Get('levels/export')
  @RequirePermissions('inventory.stock.read')
  @ApiOperation({ summary: 'Download the stock levels matching the filters as Excel (.xlsx)' })
  async exportLevels(@Query() query: StockLevelsQueryDto, @CurrentUser() user: RequestUser) {
    const { columns, rows } = await this.reports.levelsRows(query, user);
    return xlsxFile(await toXlsx('Stock levels', columns, rows), 'stock-levels.xlsx');
  }

  @Get('moves')
  @RequirePermissions('inventory.stock.read')
  @ApiOperation({
    summary: 'Stock ledger, newest first, with the balance after each move',
  })
  getMoves(@Query() query: StockMovesQueryDto, @CurrentUser() user: RequestUser) {
    return this.reports.moves(query, user);
  }

  @Get('consistency')
  @RequirePermissions('inventory.stock.read')
  @ApiOperation({ summary: 'Checks that cached balances equal the ledger (must always be ok)' })
  consistency() {
    return this.reports.consistency();
  }

  @Get('opening-balances/template')
  @RequirePermissions('inventory.stock.adjust')
  @ApiOperation({ summary: 'Download an Excel file with the opening stock columns and examples' })
  async openingTemplate() {
    const columns = OPENING_CSV_COLUMNS.map((h) => ({ header: h, numeric: h === 'quantity' || h === 'unit_cost' }));
    const rows = [
      ['SKU-0001', 'MAIN', '120', '7.25'],
      ['SKU-0002', '', '40', ''],
    ];
    return xlsxFile(await toXlsx('Opening stock', columns, rows), 'opening-stock-template.xlsx');
  }

  @Post('opening-balances')
  @HttpCode(200)
  @RequirePermissions('inventory.stock.adjust')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: CSV_LIMIT_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody(FILE_BODY)
  @ApiOperation({
    summary:
      'Import opening stock and cost from Excel (.xlsx, or .csv): sku, warehouse, quantity, unit_cost. ' +
      'dryRun=true (default) only previews.',
  })
  async openingBalances(
    @Query() query: OpeningImportQueryDto,
    @UploadedFile() file: UploadedFileData | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    if (!file) throw new BadRequestException('Attach an Excel (.xlsx) file in the "file" field');
    return this.opening.importTable(
      await readTable(file),
      query.dryRun,
      query.warehouseId,
      user,
    );
  }
}
