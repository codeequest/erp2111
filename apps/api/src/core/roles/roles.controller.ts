import { Controller, Get, Post, Patch, Delete, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { notImplemented } from '../../common/not-implemented';
import { RolesService } from './roles.service';

/**
 * SKELETON — every endpoint answers 501 Not Implemented.
 * Routes and permissions are final; replace notImplemented(...) with calls to
 * RolesService and add DTOs (class-validator) for request bodies.
 */
@ApiTags('Admin · Roles')
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get('permissions')
  @RequirePermissions('admin.role.view')
  @ApiOperation({ summary: 'List every permission, grouped by module' })
  getPermissions() {
    return notImplemented('Admin · Roles: List every permission, grouped by module');
  }

  @Get()
  @RequirePermissions('admin.role.view')
  @ApiOperation({ summary: 'List roles' })
  findAll() {
    return notImplemented('Admin · Roles: List roles');
  }

  @Get(':id')
  @RequirePermissions('admin.role.view')
  @ApiOperation({ summary: 'Get a role with its permissions' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return notImplemented('Admin · Roles: Get a role with its permissions');
  }

  @Post()
  @RequirePermissions('admin.role.view')
  @ApiOperation({ summary: 'Create a role' })
  create() {
    return notImplemented('Admin · Roles: Create a role');
  }

  @Patch(':id')
  @RequirePermissions('admin.role.view')
  @ApiOperation({ summary: 'Update a role name / permissions' })
  update(@Param('id', ParseUUIDPipe) id: string) {
    return notImplemented('Admin · Roles: Update a role name / permissions');
  }

  @Delete(':id')
  @RequirePermissions('admin.role.view')
  @ApiOperation({ summary: 'Delete a role (not allowed for system roles)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return notImplemented('Admin · Roles: Delete a role (not allowed for system roles)');
  }
}
