import {
  Body,
  Controller,
  Get,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RequestUser } from '../../common/types/request-user';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/product.dto';
import { InventoryService } from './inventory.service';

@ApiTags('Inventory · Categories & units')
@Controller('inventory/categories')
export class CategoriesController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'List categories (tree order, with depth and path)' })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  findAll(
    @Query('includeInactive', new ParseBoolPipe({ optional: true })) includeInactive?: boolean,
  ) {
    return this.inventoryService.listCategories(includeInactive ?? false);
  }

  @Post()
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Create a category (set parentId for a subcategory)' })
  create(@Body() dto: CreateCategoryDto, @CurrentUser() user: RequestUser) {
    return this.inventoryService.createCategory(dto, user);
  }

  @Patch(':id')
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Update a category (rename, move, activate / deactivate)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.inventoryService.updateCategory(id, dto, user);
  }
}
