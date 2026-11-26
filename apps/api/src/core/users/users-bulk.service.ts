import { ConflictException, ForbiddenException, HttpException, Injectable } from '@nestjs/common';
import { BulkUserAction, BulkUserResult, BulkUserResultItem, PermissionCode } from '@erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ClientInfo } from '../../common/client-info';
import { RequestUser } from '../../common/types/request-user';
import { PolicyViolation } from '../iam/access-policy';
import { BulkUserDto } from './dto/bulk.dto';
import { UserLifecycleService } from './user-lifecycle.service';
import { UserRolesService } from './user-roles.service';

const REQUIRED: Record<BulkUserAction, PermissionCode> = {
  activate: 'admin.user.activate',
  deactivate: 'admin.user.deactivate',
  assignRoles: 'admin.user.assign_roles',
  removeRoles: 'admin.user.assign_roles',
};

/** Each user in its own transaction: one failure (self, last admin, escalation) doesn't stop the rest. */
@Injectable()
export class UsersBulkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: UserLifecycleService,
    private readonly roles: UserRolesService,
  ) {}

  async run(actor: RequestUser, dto: BulkUserDto, client: ClientInfo): Promise<BulkUserResult> {
    const needed = REQUIRED[dto.action];
    if (!actor.permissions.has(needed)) {
      throw new ForbiddenException(`Missing permission: ${needed}`);
    }
    const results: BulkUserResultItem[] = [];
    for (const userId of dto.userIds) {
      results.push(await this.one(actor, dto, userId, client));
    }
    return { results };
  }

  private async one(
    actor: RequestUser,
    dto: BulkUserDto,
    userId: string,
    client: ClientInfo,
  ): Promise<BulkUserResultItem> {
    try {
      switch (dto.action) {
        case 'activate':
          await this.lifecycle.activate(actor, userId, client);
          break;
        case 'deactivate':
          await this.lifecycle.deactivate(actor, userId, dto.reason, client);
          break;
        case 'assignRoles':
        case 'removeRoles': {
          const roleIds = dto.roleIds ?? [];
          const change =
            dto.action === 'assignRoles'
              ? { add: roleIds.map((roleId) => ({ roleId })) }
              : { remove: roleIds };
          const res = await this.prisma.$transaction((tx) =>
            this.roles.apply(tx, actor, userId, change, client),
          );
          if (res.added.length === 0 && res.removed.length === 0) {
            return { userId, result: 'skipped', reason: 'No change needed.' };
          }
          break;
        }
      }
      return { userId, result: 'updated' };
    } catch (e) {
      // "Already active/inactive" is not an error for a bulk run.
      if (e instanceof ConflictException && /already/i.test(e.message)) {
        return { userId, result: 'skipped', reason: e.message };
      }
      if (e instanceof PolicyViolation || e instanceof HttpException) {
        return { userId, result: 'failed', reason: e.message };
      }
      return { userId, result: 'failed', reason: 'Unexpected error.' };
    }
  }
}
