import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Page,
  RoleCompare,
  RoleDetail,
  RoleImpact,
  RoleListItem,
  RoleTemplate,
} from '@erp/shared';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Client, ClientInfo } from '../../common/client-info';
import { RequestUser } from '../../common/types/request-user';
import {
  CompareQueryDto,
  CreateRoleDto,
  DeleteRoleQueryDto,
  ImpactDto,
  RoleListQueryDto,
  UpdateRoleDto,
} from './dto/role.dto';
import { RolesService } from './roles.service';

const Id = () => Param('id', ParseUUIDPipe);

@ApiTags('Admin · Roles')
@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @RequirePermissions('admin.role.view')
  @ApiOperation({ summary: 'Search, sort and page roles' })
  list(@Query() q: RoleListQueryDto): Promise<Page<RoleListItem>> {
    return this.roles.list(q);
  }

  @Get('templates')
  @RequirePermissions('admin.role.view')
  @ApiOperation({ summary: 'Starting points for a new role' })
  templates(): RoleTemplate[] {
    return this.roles.templates();
  }

  @Get('compare')
  @RequirePermissions('admin.role.view')
  @ApiOperation({ summary: 'Compare 2–4 roles (only differences unless all=true)' })
  compare(@Query() q: CompareQueryDto): Promise<RoleCompare> {
    return this.roles.compare(q);
  }

  @Post()
  @RequirePermissions('admin.role.create')
  @ApiOperation({ summary: 'Create a custom role (from scratch, a copy or a template)' })
  async create(
    @Body() dto: CreateRoleDto,
    @CurrentUser() actor: RequestUser,
    @Client() client: ClientInfo,
  ): Promise<RoleDetail> {
    return this.roles.detail(await this.roles.create(actor, dto, client));
  }

  @Get(':id')
  @RequirePermissions('admin.role.view')
  @ApiOperation({ summary: 'A role with its permissions and users' })
  detail(@Id() id: string): Promise<RoleDetail> {
    return this.roles.detail(id);
  }

  @Patch(':id')
  @RequirePermissions('admin.role.update')
  @ApiOperation({
    summary: 'Edit a role (send the version you loaded)',
    description: 'Changing permissions also needs admin.permission.manage.',
  })
  async update(
    @Id() id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() actor: RequestUser,
    @Client() client: ClientInfo,
  ): Promise<RoleDetail> {
    await this.roles.update(actor, id, dto, client);
    return this.roles.detail(id);
  }

  @Post(':id/impact')
  @HttpCode(200)
  @RequirePermissions('admin.role.view')
  @ApiOperation({ summary: 'Preview what a permission change does and who it affects' })
  impact(@Id() id: string, @Body() dto: ImpactDto): Promise<RoleImpact> {
    return this.roles.impact(id, dto.permissions);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('admin.role.delete')
  @ApiOperation({ summary: 'Delete a custom role (reassigning its users)' })
  async remove(
    @Id() id: string,
    @Query() q: DeleteRoleQueryDto,
    @CurrentUser() actor: RequestUser,
    @Client() client: ClientInfo,
  ): Promise<void> {
    await this.roles.remove(actor, id, q.reassignToRoleId, client);
  }
}
