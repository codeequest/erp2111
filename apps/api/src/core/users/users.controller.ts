import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuditEntryDto,
  BulkUserResult,
  EffectivePermission,
  Page,
  SessionInfo,
  UserDetail,
  UserListItem,
  UserStats,
} from '@erp/shared';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Client, ClientInfo } from '../../common/client-info';
import { RequestUser } from '../../common/types/request-user';
import { BulkUserDto } from './dto/bulk.dto';
import { PageQueryDto, UserExportQueryDto, UserListQueryDto } from './dto/user-query.dto';
import { CreateUserDto, ReasonDto, SetRolesDto, UpdateUserDto } from './dto/user.dto';
import { UserLifecycleService } from './user-lifecycle.service';
import { UserRolesService } from './user-roles.service';
import { UsersBulkService } from './users-bulk.service';
import { UsersExportService } from './users-export.service';
import { UsersService } from './users.service';

const Id = () => Param('id', ParseUUIDPipe);

/** Users are never deleted: they are deactivated, so history stays intact. */
@ApiTags('Admin · Users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly lifecycle: UserLifecycleService,
    private readonly roles: UserRolesService,
    private readonly bulkService: UsersBulkService,
    private readonly exporter: UsersExportService,
  ) {}

  // Static paths first, so they are not parsed as an :id.

  @Get()
  @RequirePermissions('admin.user.view')
  @ApiOperation({ summary: 'Search, filter, sort and page users' })
  list(@Query() q: UserListQueryDto): Promise<Page<UserListItem>> {
    return this.users.list(q);
  }

  @Get('stats')
  @RequirePermissions('admin.user.view')
  @ApiOperation({ summary: 'Counts by status, locked and without MFA' })
  stats(): Promise<UserStats> {
    return this.users.stats();
  }

  @Get('departments')
  @RequirePermissions('admin.user.view')
  @ApiOperation({ summary: 'Departments in use (for the filter)' })
  departments(): Promise<string[]> {
    return this.users.departments();
  }

  @Get('export')
  @RequirePermissions('admin.user.export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="users.csv"')
  @ApiOperation({ summary: 'CSV of the selected users, or of all users matching the filters' })
  exportCsv(
    @Query() q: UserExportQueryDto,
    @CurrentUser() actor: RequestUser,
    @Client() client: ClientInfo,
  ): Promise<string> {
    return this.exporter.exportCsv(actor, q, client);
  }

  @Post('bulk')
  @HttpCode(200)
  @RequirePermissions('admin.user.view')
  @ApiOperation({
    summary: 'Activate, deactivate, assign or remove roles for up to 200 users',
    description: 'Also needs the permission of the action (e.g. admin.user.deactivate).',
  })
  bulk(
    @Body() dto: BulkUserDto,
    @CurrentUser() actor: RequestUser,
    @Client() client: ClientInfo,
  ): Promise<BulkUserResult> {
    return this.bulkService.run(actor, dto, client);
  }

  @Post()
  @RequirePermissions('admin.user.create')
  @ApiOperation({ summary: 'Create a user (invited by email by default)' })
  async create(
    @Body() dto: CreateUserDto,
    @CurrentUser() actor: RequestUser,
    @Client() client: ClientInfo,
  ): Promise<UserDetail> {
    return this.users.detail(await this.lifecycle.create(actor, dto, client));
  }

  @Get(':id')
  @RequirePermissions('admin.user.view')
  @ApiOperation({ summary: 'A user with roles, security state and history fields' })
  detail(@Id() id: string): Promise<UserDetail> {
    return this.users.detail(id);
  }

  @Patch(':id')
  @RequirePermissions('admin.user.update')
  @ApiOperation({ summary: 'Edit profile fields (email change re-verifies the address)' })
  async update(
    @Id() id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: RequestUser,
    @Client() client: ClientInfo,
  ): Promise<UserDetail> {
    await this.lifecycle.update(actor, id, dto, client);
    return this.users.detail(id);
  }

  @Get(':id/effective-permissions')
  @RequirePermissions('admin.user.view')
  @ApiOperation({ summary: 'Every permission the user has now, and which role grants it' })
  effective(@Id() id: string): Promise<EffectivePermission[]> {
    return this.users.effectivePermissions(id);
  }

  @Get(':id/activity')
  @RequirePermissions('admin.audit.read')
  @ApiOperation({ summary: 'Audit events about or by this user' })
  activity(@Id() id: string, @Query() q: PageQueryDto): Promise<Page<AuditEntryDto>> {
    return this.users.activity(id, q);
  }

  @Put(':id/roles')
  @RequirePermissions('admin.user.assign_roles')
  @ApiOperation({ summary: 'Replace the roles (optionally temporary) of a user' })
  async setRoles(
    @Id() id: string,
    @Body() dto: SetRolesDto,
    @CurrentUser() actor: RequestUser,
    @Client() client: ClientInfo,
  ): Promise<UserDetail> {
    await this.roles.setRoles(actor, id, dto.roles, client);
    return this.users.detail(id);
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  @RequirePermissions('admin.user.deactivate')
  @ApiOperation({ summary: 'Deactivate: ends sessions and voids pending links' })
  async deactivate(
    @Id() id: string,
    @Body() dto: ReasonDto,
    @CurrentUser() actor: RequestUser,
    @Client() client: ClientInfo,
  ): Promise<UserDetail> {
    await this.lifecycle.deactivate(actor, id, dto.reason, client);
    return this.users.detail(id);
  }

  @Post(':id/activate')
  @HttpCode(200)
  @RequirePermissions('admin.user.activate')
  @ApiOperation({ summary: 'Re-activate (roles are kept)' })
  async activate(
    @Id() id: string,
    @CurrentUser() actor: RequestUser,
    @Client() client: ClientInfo,
  ): Promise<UserDetail> {
    await this.lifecycle.activate(actor, id, client);
    return this.users.detail(id);
  }

  @Post(':id/reset-password')
  @HttpCode(204)
  @RequirePermissions('admin.user.reset_password')
  @ApiOperation({ summary: 'Email the user a password reset link' })
  async resetPassword(
    @Id() id: string,
    @CurrentUser() actor: RequestUser,
    @Client() client: ClientInfo,
  ): Promise<void> {
    await this.lifecycle.sendPasswordReset(actor, id, client);
  }

  @Post(':id/force-password-change')
  @HttpCode(200)
  @RequirePermissions('admin.user.reset_password')
  @ApiOperation({ summary: 'Require a new password at next login (ends current sessions)' })
  async forcePasswordChange(
    @Id() id: string,
    @CurrentUser() actor: RequestUser,
    @Client() client: ClientInfo,
  ): Promise<UserDetail> {
    await this.lifecycle.forcePasswordChange(actor, id, client);
    return this.users.detail(id);
  }

  @Post(':id/invitation')
  @HttpCode(204)
  @RequirePermissions('admin.user.create')
  @ApiOperation({ summary: 'Send the invitation again (voids the previous link)' })
  async resendInvitation(
    @Id() id: string,
    @CurrentUser() actor: RequestUser,
    @Client() client: ClientInfo,
  ): Promise<void> {
    await this.lifecycle.resendInvitation(actor, id, client);
  }

  @Delete(':id/invitation')
  @HttpCode(204)
  @RequirePermissions('admin.user.create')
  @ApiOperation({ summary: 'Cancel the pending invitation link' })
  async revokeInvitation(
    @Id() id: string,
    @CurrentUser() actor: RequestUser,
    @Client() client: ClientInfo,
  ): Promise<void> {
    await this.lifecycle.revokeInvitation(actor, id, client);
  }

  @Post(':id/verify-email')
  @HttpCode(204)
  @RequirePermissions('admin.user.update')
  @ApiOperation({ summary: 'Send the email verification link again' })
  async resendVerification(
    @Id() id: string,
    @CurrentUser() actor: RequestUser,
    @Client() client: ClientInfo,
  ): Promise<void> {
    await this.lifecycle.resendVerification(actor, id, client);
  }

  @Post(':id/unlock')
  @HttpCode(200)
  @RequirePermissions('admin.user.manage_mfa')
  @ApiOperation({ summary: 'Clear a lockout after too many failed logins' })
  async unlock(
    @Id() id: string,
    @CurrentUser() actor: RequestUser,
    @Client() client: ClientInfo,
  ): Promise<UserDetail> {
    await this.lifecycle.unlock(actor, id, client);
    return this.users.detail(id);
  }

  @Delete(':id/mfa')
  @HttpCode(200)
  @RequirePermissions('admin.user.manage_mfa')
  @ApiOperation({ summary: 'Reset two-step verification (lost device)' })
  async resetMfa(
    @Id() id: string,
    @CurrentUser() actor: RequestUser,
    @Client() client: ClientInfo,
  ): Promise<UserDetail> {
    await this.lifecycle.resetMfa(actor, id, client);
    return this.users.detail(id);
  }

  @Get(':id/sessions')
  @RequirePermissions('admin.user.view')
  @ApiOperation({ summary: 'Active sessions of the user' })
  sessions(@Id() id: string): Promise<SessionInfo[]> {
    return this.users.sessionsOf(id);
  }

  @Delete(':id/sessions')
  @RequirePermissions('admin.session.revoke')
  @ApiOperation({ summary: 'Sign the user out everywhere' })
  async revokeAll(
    @Id() id: string,
    @CurrentUser() actor: RequestUser,
    @Client() client: ClientInfo,
  ): Promise<{ revoked: number }> {
    return { revoked: await this.lifecycle.revokeSessions(actor, id, undefined, client) };
  }

  @Delete(':id/sessions/:sid')
  @RequirePermissions('admin.session.revoke')
  @ApiOperation({ summary: 'End one session of the user' })
  async revokeOne(
    @Id() id: string,
    @Param('sid', ParseUUIDPipe) sid: string,
    @CurrentUser() actor: RequestUser,
    @Client() client: ClientInfo,
  ): Promise<{ revoked: number }> {
    return { revoked: await this.lifecycle.revokeSessions(actor, id, sid, client) };
  }

  @Post(':id/access-review')
  @HttpCode(200)
  @RequirePermissions('admin.user.update')
  @ApiOperation({ summary: "Record that this user's access was reviewed" })
  async reviewAccess(
    @Id() id: string,
    @CurrentUser() actor: RequestUser,
    @Client() client: ClientInfo,
  ): Promise<UserDetail> {
    await this.lifecycle.reviewAccess(actor, id, client);
    return this.users.detail(id);
  }
}
