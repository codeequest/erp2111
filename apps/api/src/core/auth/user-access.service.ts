import { Injectable } from '@nestjs/common';
import { AuthUser } from '@erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { LoadedUser } from '../../common/types/request-user';
import { Assignment, resolvePermissions } from '../iam/permission-resolution';

/** Loads a user with their roles and effective permissions (union of all roles). */
@Injectable()
export class UserAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async loadActiveUser(userId: string): Promise<LoadedUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: {
          include: { role: { include: { permissions: { include: { permission: true } } } } },
        },
      },
    });
    if (!user || user.status !== 'ACTIVE') return null;

    const assignments: Assignment[] = user.roles.map((ur) => ({
      roleId: ur.role.id,
      roleName: ur.role.name,
      isAdminRole: ur.role.isProtected,
      expiresAt: ur.expiresAt,
      permissions: ur.role.permissions.map((rp) => rp.permission.code),
    }));
    const now = new Date();
    const permissions = resolvePermissions(user, assignments, now);

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      roles: assignments.filter((a) => !a.expiresAt || a.expiresAt > now).map((a) => a.roleName),
      permissions,
    };
  }

  toAuthUser(user: LoadedUser): AuthUser {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      roles: user.roles,
      permissions: [...user.permissions].sort(),
    };
  }
}
