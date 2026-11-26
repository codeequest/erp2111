import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionMatrix } from '@erp/shared';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Client, ClientInfo } from '../../common/client-info';
import { RequestUser } from '../../common/types/request-user';
import { MatrixSaveDto } from './dto/role.dto';
import { catalogueByModule, MatrixService } from './matrix.service';

@ApiTags('Admin · Permissions')
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly matrix: MatrixService) {}

  @Get()
  @RequirePermissions('admin.role.view')
  @ApiOperation({ summary: 'The permission catalogue, grouped by module' })
  catalogue(): PermissionMatrix['modules'] {
    return catalogueByModule();
  }

  @Get('matrix')
  @RequirePermissions('admin.role.view')
  @ApiOperation({ summary: 'Every role × every permission' })
  get(): Promise<PermissionMatrix> {
    return this.matrix.get();
  }

  @Put('matrix')
  @RequirePermissions('admin.permission.manage')
  @ApiOperation({ summary: 'Save changed roles at once (all-or-nothing, version-checked)' })
  save(
    @Body() dto: MatrixSaveDto,
    @CurrentUser() actor: RequestUser,
    @Client() client: ClientInfo,
  ): Promise<PermissionMatrix> {
    return this.matrix.save(actor, dto, client);
  }
}
