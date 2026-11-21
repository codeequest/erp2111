import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/types/request-user';
import { CategoriesService } from './categories.service';
import { SaveCategoryDto } from './catalog.dto';

@ApiTags('Products · Categories')
@ApiBearerAuth()
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'List categories (flat, sorted by full path)' })
  findAll() {
    return this.categories.findAll();
  }

  @Post()
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Create a category' })
  create(@Body() dto: SaveCategoryDto, @CurrentUser() me: RequestUser, @Ip() ip: string) {
    return this.categories.create(dto, { id: me.id, ip });
  }

  @Patch(':id')
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Rename, move or (de)activate a category' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveCategoryDto,
    @CurrentUser() me: RequestUser,
    @Ip() ip: string,
  ) {
    return this.categories.update(id, dto, { id: me.id, ip });
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Delete an empty category (no product, no sub-category)' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() me: RequestUser, @Ip() ip: string) {
    return this.categories.remove(id, { id: me.id, ip });
  }
}
