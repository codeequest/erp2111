import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isPrivileged } from '@erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { recordAudit } from '../../common/audit';
import { ClientInfo } from '../../common/client-info';
import { RequestUser } from '../../common/types/request-user';
import { assertCanGrant, assertNotSelf } from '../iam/access-policy';
import { assertAdminsRemainInDb, withAdminLock } from '../iam/admin-lock';
import { SecurityPolicyService } from '../iam/security-policy.service';

type Tx = Prisma.TransactionClient;

export interface RoleAssignmentInput {
  roleId: string;
  /** ISO date-time; absent/null = permanent. */
  expiresAt?: string | null;
}

/** What to do with the user's roles: replace them all, or add/remove some. */
export type RoleChange =
  | { set: RoleAssignmentInput[] }
  | { add?: RoleAssignmentInput[]; remove?: string[] };

export interface RoleChangeResult {
  added: string[];
  removed: string[];
}

@Injectable()
export class UserRolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: SecurityPolicyService,
  ) {}

  /** PUT /users/:id/roles — replaces the user's roles. */
  async setRoles(
    actor: RequestUser,
    userId: string,
    roles: RoleAssignmentInput[],
    client: ClientInfo,
  ): Promise<RoleChangeResult> {
    assertNotSelf(actor.id, userId, 'change your own roles');
    return this.prisma.$transaction((tx) => this.apply(tx, actor, userId, { set: roles }, client));
  }

  /** Same rules, inside the caller's transaction (user creation, bulk). */
  async apply(
    tx: Tx,
    actor: RequestUser,
    userId: string,
    change: RoleChange,
    client: ClientInfo,
  ): Promise<RoleChangeResult> {
    assertNotSelf(actor.id, userId, 'change your own roles');
    await withAdminLock(tx);

    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const current = await tx.userRole.findMany({
      where: { userId },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
    const currentById = new Map(current.map((c) => [c.roleId, c]));

    // Desired final state.
    const desired = new Map<string, Date | null>();
    if ('set' in change) {
      for (const r of change.set) desired.set(r.roleId, this.expiry(r.expiresAt));
    } else {
      for (const c of current) desired.set(c.roleId, c.expiresAt);
      for (const r of change.add ?? []) desired.set(r.roleId, this.expiry(r.expiresAt));
      for (const id of change.remove ?? []) desired.delete(id);
    }

    const ids = [...desired.keys()];
    const roles = ids.length
      ? await tx.role.findMany({
          where: { id: { in: ids } },
          include: { permissions: { include: { permission: true } } },
        })
      : [];
    if (roles.length !== ids.length) throw new BadRequestException('Unknown role.');
    const roleById = new Map(roles.map((r) => [r.id, r]));

    // New assignments and changed expiries are grants.
    const granted = ids.filter((id) => {
      const before = currentById.get(id);
      return !before || before.expiresAt?.getTime() !== desired.get(id)?.getTime();
    });
    const removed = current.filter((c) => !desired.has(c.roleId));

    assertCanGrant(
      actor.permissions,
      granted.flatMap((id) => roleById.get(id)!.permissions.map((p) => p.permission.code)),
    );

    if (removed.length) {
      await tx.userRole.deleteMany({
        where: { userId, roleId: { in: removed.map((r) => r.roleId) } },
      });
    }
    for (const roleId of granted) {
      const expiresAt = desired.get(roleId) ?? null;
      await tx.userRole.upsert({
        where: { userId_roleId: { userId, roleId } },
        create: { userId, roleId, expiresAt, assignedById: actor.id },
        update: { expiresAt, assignedById: actor.id, assignedAt: new Date() },
      });
    }

    // Removing a role or making Admin temporary can drop the admin count.
    const adminWeakened =
      removed.some((r) => r.role.isProtected) ||
      granted.some((id) => roleById.get(id)!.isProtected && desired.get(id) !== null);
    if (adminWeakened) await assertAdminsRemainInDb(tx);

    const policy = await this.policy.get();
    const finalPerms = roles.flatMap((r) => r.permissions.map((p) => p.permission.code));
    if (policy.requireMfaForPrivileged && isPrivileged(finalPerms) && !user.mfaRequired) {
      await tx.user.update({ where: { id: userId }, data: { mfaRequired: true } });
    }

    const base = {
      actorId: actor.id,
      targetType: 'User',
      targetId: userId,
      targetLabel: user.email,
      ip: client.ip,
      userAgent: client.userAgent,
    };
    if (granted.length) {
      await recordAudit(tx, {
        ...base,
        action: 'user.roles_assigned',
        after: {
          roles: granted.map((id) => ({
            id,
            name: roleById.get(id)!.name,
            expiresAt: desired.get(id)?.toISOString() ?? null,
          })),
        },
      });
    }
    if (removed.length) {
      await recordAudit(tx, {
        ...base,
        action: 'user.roles_removed',
        before: { roles: removed.map((r) => ({ id: r.roleId, name: r.role.name })) },
      });
    }
    return {
      added: granted.map((id) => roleById.get(id)!.name),
      removed: removed.map((r) => r.role.name),
    };
  }

  private expiry(value: string | null | undefined): Date | null {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) throw new BadRequestException('Invalid expiry date.');
    if (d.getTime() <= Date.now()) {
      throw new BadRequestException('A temporary role must expire in the future.');
    }
    return d;
  }
}
