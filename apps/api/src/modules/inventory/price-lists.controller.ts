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
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RequestUser } from '../../common/types/request-user';
import {
  CreatePriceListDto,
  ImportPricesDto,
  ListPriceItemsQueryDto,
  UpdatePriceListDto,
} from './dto/price-list.dto';
import { PriceListService } from './price-list.service';

@ApiTags('Inventory · Price lists')
@Controller('inventory/price-lists')
export class PriceListsController {
  constructor(private readonly priceLists: PriceListService) {}

  @Get()
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'List price lists (Retail is the product sale price)' })
  findAll() {
    return this.priceLists.list();
  }

  @Post()
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Create a price list' })
  create(@Body() dto: CreatePriceListDto, @CurrentUser() user: RequestUser) {
    return this.priceLists.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Update a price list (name, rule, active)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePriceListDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.priceLists.update(id, dto, user);
  }

  @Get(':id/items')
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'Products with their price in this list' })
  items(@Param('id', ParseUUIDPipe) id: string, @Query() query: ListPriceItemsQueryDto) {
    return this.priceLists.items(id, query);
  }

  @Post(':id/import')
  @HttpCode(200)
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Import fixed prices from CSV (sku, price)' })
  import(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ImportPricesDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.priceLists.importPrices(id, dto, user);
  }
}
