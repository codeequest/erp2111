import { Controller, Get, Post, Patch, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { notImplemented } from '../../common/not-implemented';
import { UsersService } from './users.service';

/**
 * SKELETON — every endpoint answers 501 Not Implemented.
 * Routes and permissions are final; replace notImplemented(...) with calls to
 * UsersService and add DTOs (class-validator) for request bodies.
 */
@ApiTags('Admin · Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermissions('admin.user.view')
  @ApiOperation({ summary: 'List users' })
  findAll() {
    return notImplemented('Admin · Users: List users');
  }

  @Get(':id')
  @RequirePermissions('admin.user.view')
  @ApiOperation({ summary: 'Get a user with their roles' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return notImplemented('Admin · Users: Get a user with their roles');
  }

  @Post()
  @RequirePermissions('admin.user.view')
  @ApiOperation({ summary: 'Create a user and assign roles' })
  create() {
    return notImplemented('Admin · Users: Create a user and assign roles');
  }

  @Patch(':id')
  @RequirePermissions('admin.user.view')
  @ApiOperation({ summary: 'Update a user (name, email, roles)' })
  update(@Param('id', ParseUUIDPipe) id: string) {
    return notImplemented('Admin · Users: Update a user (name, email, roles)');
  }

  @Post(':id/deactivate')
  @RequirePermissions('admin.user.view')
  @ApiOperation({ summary: 'Deactivate a user (users are never deleted)' })
  deactivate(@Param('id', ParseUUIDPipe) id: string) {
    return notImplemented('Admin · Users: Deactivate a user (users are never deleted)');
  }

  @Post(':id/activate')
  @RequirePermissions('admin.user.view')
  @ApiOperation({ summary: 'Re-activate a user' })
  activate(@Param('id', ParseUUIDPipe) id: string) {
    return notImplemented('Admin · Users: Re-activate a user');
  }

  @Post(':id/reset-password')
  @RequirePermissions('admin.user.view')
  @ApiOperation({ summary: 'Set a new password for a user' })
  resetPassword(@Param('id', ParseUUIDPipe) id: string) {
    return notImplemented('Admin · Users: Set a new password for a user');
  }
}
