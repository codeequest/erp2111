import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RequestUser } from '../../common/types/request-user';
import { readTable, toXlsx, xlsxFile } from '../../common/spreadsheet';
import {
  CreateStockCountDto,
  ListStockDocumentsQueryDto,
  SaveCountLinesDto,
} from './dto/stock-document.dto';
import { UploadedFileData } from './product-bulk.service';
import { StockCountsService } from './stock/stock-counts.service';

const CSV_LIMIT_BYTES = 10 * 1024 * 1024;

@ApiTags('Inventory · Stock counts')
@ApiBearerAuth()
@Controller('inventory/counts')
export class StockCountsController {
  constructor(private readonly counts: StockCountsService) {}

  @Get()
  @RequirePermissions('inventory.stock.read')
  @ApiOperation({ summary: 'List stock counts (newest first)' })
  list(@Query() query: ListStockDocumentsQueryDto) {
    return this.counts.list(query);
  }

  @Get(':id')
  @RequirePermissions('inventory.stock.read')
  @ApiOperation({ summary: 'One count with every line, expected and counted quantities' })
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.counts.get(id, user);
  }

  @Get(':id/sheet')
  @RequirePermissions('inventory.stock.read')
  @ApiQuery({ name: 'blind', required: false, description: 'true = leave out expected quantities' })
  @ApiOperation({ summary: 'Download the count sheet as Excel (.xlsx), to print or fill in' })
  async sheet(@Param('id', ParseUUIDPipe) id: string, @Query('blind') blind: string | undefined) {
    const { name, columns, rows } = await this.counts.sheetRows(id, blind === 'true' || blind === '1');
    return xlsxFile(await toXlsx('Count', columns, rows), name);
  }

  @Post()
  @RequirePermissions('inventory.stock.adjust')
  @ApiOperation({ summary: 'Start a count: lists the products of a warehouse with their expected stock' })
  create(@Body() dto: CreateStockCountDto, @CurrentUser() user: RequestUser) {
    return this.counts.create(dto, user);
  }

  @Put(':id/lines')
  @RequirePermissions('inventory.stock.adjust')
  @ApiOperation({ summary: 'Save counted quantities (adds products that are not on the count yet)' })
  saveLines(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveCountLinesDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.counts.saveLines(id, dto, user);
  }

  @Post(':id/import')
  @HttpCode(200)
  @RequirePermissions('inventory.stock.adjust')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: CSV_LIMIT_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOperation({ summary: 'Import counted quantities from Excel (.xlsx, or .csv): sku, counted_qty. Empty cells are skipped.' })
  async import(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: UploadedFileData | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    if (!file) throw new BadRequestException('Attach an Excel (.xlsx) file in the "file" field');
    return this.counts.importTable(id, await readTable(file), user);
  }

  @Post(':id/post')
  @HttpCode(200)
  @RequirePermissions('inventory.stock.adjust')
  @ApiOperation({ summary: 'Validate: adjusts each counted product to the counted quantity' })
  post(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.counts.post(id, user);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermissions('inventory.stock.adjust')
  @ApiOperation({ summary: 'Cancel a count that is not validated' })
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.counts.cancel(id, user);
  }
}
