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
import { UnitsService } from './units.service';
import { SaveUnitDto } from './catalog.dto';

@ApiTags('Products · Units')
@ApiBearerAuth()
@Controller('units')
export class UnitsController {
  constructor(private readonly units: UnitsService) {}

  @Get()
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'List units of measure' })
  findAll() {
    return this.units.findAll();
  }

  @Post()
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Create a unit' })
  create(@Body() dto: SaveUnitDto, @CurrentUser() me: RequestUser, @Ip() ip: string) {
    return this.units.create(dto, { id: me.id, ip });
  }

  @Patch(':id')
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Rename a unit' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveUnitDto,
    @CurrentUser() me: RequestUser,
    @Ip() ip: string,
  ) {
    return this.units.update(id, dto, { id: me.id, ip });
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('inventory.product.write')
  @ApiOperation({ summary: 'Delete a unit that no product uses' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() me: RequestUser, @Ip() ip: string) {
    return this.units.remove(id, { id: me.id, ip });
  }
}
