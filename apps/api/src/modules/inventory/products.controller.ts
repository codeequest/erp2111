import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { ProductImageDto } from './dto/stock.dto';
import { StockService } from './stock.service';
import { PriceListService } from './price-list.service';
import { SetProductPricesDto } from './dto/price-list.dto';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RequestUser } from '../../common/types/request-user';
import {
  CreateProductDto,
  ImportProductsDto,
  ListProductsQueryDto,
  UpdateProductDto,
} from './dto/product.dto';
import { InventoryService } from './inventory.service';

@ApiTags('Inventory · Products')
@Controller('inventory/products')
export class ProductsController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly stockService: StockService,
    private readonly priceLists: PriceListService,
  ) {}

  @Get(':id/prices')
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'Price of the product in every active price list' })
  prices(@Param('id', ParseUUIDPipe) id: string) {
    return this.priceLists.productPrices(id);
  }

  @Put(':id/prices')
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Set / clear fixed prices of the product in price lists' })
  setPrices(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetProductPricesDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.priceLists.setProductPrices(id, dto, user);
  }

  /**
   * Public so <img> tags can load it without the access token. Product ids are random
   * UUIDs and photos are catalogue pictures, not confidential data.
   */
  @Get(':id/image')
  @Public()
  @ApiOperation({ summary: 'Product photo (public, cacheable)' })
  async image(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const image = await this.stockService.getImage(id);
    res.setHeader('Content-Type', image.mimeType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(image.data);
  }

  @Put(':id/image')
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Upload / replace the product photo' })
  setImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProductImageDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.stockService.setImage(id, dto, user);
  }

  @Delete(':id/image')
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Remove the product photo' })
  removeImage(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.stockService.removeImage(id, user);
  }

  @Get()
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'List / search products' })
  findAll(@Query() query: ListProductsQueryDto, @CurrentUser() user: RequestUser) {
    return this.inventoryService.listProducts(query, user);
  }

  @Get('by-code/:code')
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'Find a product by scanned barcode (product or packaging) or SKU' })
  findByCode(@Param('code') code: string, @CurrentUser() user: RequestUser) {
    if (code.length > 64) throw new BadRequestException('Code is too long');
    return this.inventoryService.findByCode(code, user);
  }

  @Get(':id')
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'Get a product (cost only with inventory.cost.view)' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.inventoryService.getProduct(id, user);
  }

  @Post()
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Create a product' })
  create(@Body() dto: CreateProductDto, @CurrentUser() user: RequestUser) {
    return this.inventoryService.createProduct(dto, user);
  }

  @Patch(':id')
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Update a product' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.inventoryService.updateProduct(id, dto, user);
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Deactivate a product' })
  deactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.inventoryService.setProductActive(id, false, user);
  }

  @Post(':id/activate')
  @HttpCode(200)
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Re-activate a product' })
  activate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.inventoryService.setProductActive(id, true, user);
  }

  @Post('import')
  @HttpCode(200)
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Import products from CSV' })
  import(@Body() dto: ImportProductsDto, @CurrentUser() user: RequestUser) {
    return this.inventoryService.importProducts(dto, user);
  }
}
