import {
  Body,
  Controller,
  Get,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RequestUser } from '../../common/types/request-user';
import {
  CreatePriceListDto,
  PriceListProductsQueryDto,
  SetProductPricesDto,
  UpdatePriceListDto,
} from './dto/price-list.dto';
import { PriceListsService } from './price-lists.service';

@ApiTags('Inventory · Price lists')
@ApiBearerAuth()
@Controller('inventory/price-lists')
export class PriceListsController {
  constructor(private readonly priceLists: PriceListsService) {}

  @Get()
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'List price lists' })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  findAll(
    @Query('includeInactive', new ParseBoolPipe({ optional: true })) includeInactive?: boolean,
  ) {
    return this.priceLists.list(includeInactive ?? false);
  }

  @Get(':id')
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'Get a price list' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.priceLists.get(id);
  }

  @Post()
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Create a price list' })
  create(@Body() dto: CreatePriceListDto, @CurrentUser() user: RequestUser) {
    return this.priceLists.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Rename, change the percentage or (de)activate a price list' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePriceListDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.priceLists.update(id, dto, user);
  }

  @Get(':id/products')
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'Active products with their prices in this list (paged)' })
  products(@Param('id', ParseUUIDPipe) id: string, @Query() query: PriceListProductsQueryDto) {
    return this.priceLists.products(id, query);
  }

  @Put(':id/products/:productId')
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Set or remove (price: null) the fixed prices of a product' })
  setProductPrices(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: SetProductPricesDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.priceLists.setProductPrices(id, productId, dto, user);
  }
}
