import { Injectable } from '@nestjs/common';
import { AuthUser, isPermissionCode, PermissionCode } from '@erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestUser } from '../../common/types/request-user';

/** Loads a user with their roles and effective permissions (union of all roles). */
@Injectable()
export class UserAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async loadActiveUser(userId: string): Promise<RequestUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: {
          include: { role: { include: { permissions: { include: { permission: true } } } } },
        },
      },
    });
    if (!user || user.status !== 'ACTIVE') return null;

    const permissions = new Set<PermissionCode>();
    for (const { role } of user.roles) {
      for (const { permission } of role.permissions) {
        if (isPermissionCode(permission.code)) permissions.add(permission.code);
      }
    }

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      roles: user.roles.map((r) => r.role.name),
      permissions,
    };
  }

  toAuthUser(user: RequestUser): AuthUser {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      roles: user.roles,
      permissions: [...user.permissions].sort(),
    };
  }
}
