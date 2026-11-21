import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Param,
  ParseUUIDPipe,
  Query,
  ParseBoolPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/types/request-user';
import { InventoryService } from './inventory.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/reference.dto';

@ApiTags('Inventory · Categories & units')
@Controller('inventory/categories')
export class CategoriesController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'List categories (flat, with parentId — build the tree client-side)' })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  findAll(
    @Query('includeInactive', new DefaultValuePipe(false), ParseBoolPipe) includeInactive: boolean,
  ) {
    return this.inventoryService.listCategories(includeInactive);
  }

  @Post()
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Create a category' })
  create(@Body() dto: CreateCategoryDto, @CurrentUser() user: RequestUser) {
    return this.inventoryService.createCategory(dto, user);
  }

  @Patch(':id')
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Rename, move or (de)activate a category' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.inventoryService.updateCategory(id, dto, user);
  }
}
