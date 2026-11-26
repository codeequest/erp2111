import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  isPrivileged,
  Page,
  PERMISSION_DEFINITIONS,
  RoleColor,
  RoleCompare,
  RoleDetail,
  RoleImpact,
  RoleListItem,
  ROLE_TEMPLATES,
  RoleTemplate,
} from '@erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { recordAudit } from '../../common/audit';
import { ClientInfo } from '../../common/client-info';
import { RequestUser } from '../../common/types/request-user';
import { assertCanGrant, assertRoleEditable } from '../iam/access-policy';
import { assertAdminsRemainInDb, withAdminLock } from '../iam/admin-lock';
import { CompareQueryDto, CreateRoleDto, RoleListQueryDto, UpdateRoleDto } from './dto/role.dto';
import { computeImpact } from './role-impact';
import {
  assertKnownCodes,
  assertSafeRoleChanges,
  permissionIdMap,
  STALE_ROLE,
  writeRolePermissions,
} from './role-permissions';

type Tx = Prisma.TransactionClient;

const NAME_TAKEN = 'A role with this name already exists.';
const live = () => ({ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] });

const ROLE_INCLUDE = {
  permissions: { include: { permission: true } },
  users: { where: live(), select: { userId: true } },
} satisfies Prisma.RoleInclude;

type RoleRow = Prisma.RoleGetPayload<{ include: typeof ROLE_INCLUDE }>;

function toListItem(r: RoleRow): RoleListItem {
  const codes = r.permissions.map((p) => p.permission.code);
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? '',
    type: r.type,
    isProtected: r.isProtected,
    color: r.color as RoleColor,
    category: r.category,
    userCount: r.users.length,
    permissionCount: codes.length,
    privileged: isPrivileged(codes),
    version: r.version,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  templates(): RoleTemplate[] {
    return ROLE_TEMPLATES;
  }

  async list(q: RoleListQueryDto): Promise<Page<RoleListItem>> {
    const where: Prisma.RoleWhereInput = {
      ...(q.type ? { type: q.type } : {}),
      ...(q.search
        ? {
            OR: [
              { name: { contains: q.search, mode: 'insensitive' } },
              { description: { contains: q.search, mode: 'insensitive' } },
              { category: { contains: q.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const dir = q.order ?? (q.sort && q.sort !== 'name' ? 'desc' : 'asc');
    const orderBy: Prisma.RoleOrderByWithRelationInput[] =
      q.sort === 'userCount'
        ? [{ users: { _count: dir } }]
        : q.sort === 'permissionCount'
          ? [{ permissions: { _count: dir } }]
          : q.sort === 'createdAt' || q.sort === 'updatedAt'
            ? [{ [q.sort]: dir }]
            : [{ isProtected: 'desc' }, { name: dir }];
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.role.count({ where }),
      this.prisma.role.findMany({
        where,
        include: ROLE_INCLUDE,
        orderBy: [...orderBy, { id: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return { items: rows.map(toListItem), total, page: q.page, pageSize: q.pageSize };
  }

  async detail(id: string): Promise<RoleDetail> {
    const r = await this.prisma.role.findUnique({
      where: { id },
      include: {
        ...ROLE_INCLUDE,
        users: {
          where: live(),
          include: { user: { select: { id: true, fullName: true, email: true, status: true } } },
          orderBy: { user: { lastName: 'asc' } },
        },
      },
    });
    if (!r) throw new NotFoundException('Role not found');
    return {
      ...toListItem({ ...r, users: r.users.map((u) => ({ userId: u.userId })) }),
      permissions: r.permissions.map((p) => p.permission.code).sort(),
      users: r.users.map((u) => ({ ...u.user, expiresAt: u.expiresAt?.toISOString() ?? null })),
    };
  }

  async compare(q: CompareQueryDto): Promise<RoleCompare> {
    const rows = await this.prisma.role.findMany({
      where: { id: { in: q.ids } },
      include: { permissions: { include: { permission: true } } },
    });
    if (rows.length !== q.ids.length) throw new NotFoundException('Role not found');
    const ordered = q.ids.map((id) => rows.find((r) => r.id === id)!);
    const sets = ordered.map((r) => new Set(r.permissions.map((p) => p.permission.code)));
    return {
      roles: ordered.map((r) => ({ id: r.id, name: r.name, color: r.color as RoleColor })),
      rows: PERMISSION_DEFINITIONS.map((d) => ({
        code: d.code,
        label: d.label,
        module: d.module,
        sensitive: d.sensitive,
        held: sets.map((s) => s.has(d.code)),
      })).filter((row) => q.all || (row.held.some(Boolean) && !row.held.every(Boolean))),
    };
  }

  /** What saving `permissions` on this role would change, and for whom. */
  async impact(id: string, permissions: string[]): Promise<RoleImpact> {
    const r = await this.prisma.role.findUnique({
      where: { id },
      include: {
        permissions: { include: { permission: true } },
        users: {
          where: live(),
          include: { user: { select: { id: true, fullName: true, email: true } } },
        },
      },
    });
    if (!r) throw new NotFoundException('Role not found');
    const diff = computeImpact(
      r.permissions.map((p) => p.permission.code),
      permissions,
    );
    return { ...diff, affectedUsers: r.users.map((u) => u.user) };
  }

  private async assertNameFree(tx: Tx | PrismaService, name: string, exceptId?: string) {
    const clash = await tx.role.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
    });
    if (clash) throw new ConflictException(NAME_TAKEN);
  }

  async create(actor: RequestUser, dto: CreateRoleDto, client: ClientInfo): Promise<string> {
    let permissions = dto.permissions ?? [];
    if (dto.cloneFromId) {
      const src = await this.prisma.role.findUnique({
        where: { id: dto.cloneFromId },
        include: { permissions: { include: { permission: true } } },
      });
      if (!src) throw new BadRequestException('The role to copy was not found.');
      permissions = [...permissions, ...src.permissions.map((p) => p.permission.code)];
    }
    if (dto.templateKey) {
      permissions = [
        ...permissions,
        ...ROLE_TEMPLATES.find((t) => t.key === dto.templateKey)!.permissions,
      ];
    }
    permissions = [...new Set(permissions)];
    assertKnownCodes(permissions);
    if (permissions.length && !actor.permissions.has('admin.permission.manage')) {
      throw new ForbiddenException('Missing permission: admin.permission.manage');
    }
    assertCanGrant(actor.permissions, permissions);

    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.assertNameFree(tx, dto.name);
        const permIds = await permissionIdMap(tx);
        const role = await tx.role.create({
          data: {
            name: dto.name,
            description: dto.description || null,
            color: dto.color,
            category: dto.category ?? null,
            type: 'CUSTOM',
            permissions: { create: permissions.map((c) => ({ permissionId: permIds.get(c)! })) },
          },
        });
        await recordAudit(tx, {
          actorId: actor.id,
          action: 'role.created',
          targetType: 'Role',
          targetId: role.id,
          targetLabel: role.name,
          after: {
            name: role.name,
            color: role.color,
            permissions: permissions.sort(),
            ...(dto.cloneFromId ? { clonedFrom: dto.cloneFromId } : {}),
            ...(dto.templateKey ? { template: dto.templateKey } : {}),
          },
          ip: client.ip,
          userAgent: client.userAgent,
        });
        return role.id;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(NAME_TAKEN);
      }
      throw e;
    }
  }

  async update(
    actor: RequestUser,
    id: string,
    dto: UpdateRoleDto,
    client: ClientInfo,
  ): Promise<void> {
    if (dto.permissions && !actor.permissions.has('admin.permission.manage')) {
      throw new ForbiddenException('Missing permission: admin.permission.manage');
    }
    await this.prisma.$transaction(async (tx) => {
      const role = await tx.role.findUnique({
        where: { id },
        include: { permissions: { include: { permission: true } } },
      });
      if (!role) throw new NotFoundException('Role not found');
      if (role.version !== dto.version) throw new ConflictException(STALE_ROLE);

      const before = role.permissions.map((p) => p.permission.code);
      const diff = dto.permissions ? computeImpact(before, dto.permissions) : null;
      const permsChanged = !!diff && (diff.added.length > 0 || diff.removed.length > 0);
      const renamed = dto.name !== undefined && dto.name !== role.name;

      const fields: Record<string, unknown> = {};
      const prev: Record<string, unknown> = {};
      for (const f of ['name', 'description', 'color', 'category'] as const) {
        const next = dto[f];
        if (next === undefined) continue;
        const cur = f === 'description' ? (role.description ?? '') : role[f];
        if ((next ?? null) === (cur ?? null)) continue;
        fields[f] = f === 'description' ? next || null : next;
        prev[f] = role[f];
      }
      if (!permsChanged && Object.keys(fields).length === 0) return;

      assertRoleEditable(role, { rename: renamed, permissions: permsChanged });
      if (renamed) await this.assertNameFree(tx, dto.name!, id);

      if (permsChanged) {
        await withAdminLock(tx);
        await assertSafeRoleChanges(
          tx,
          actor,
          new Map([[id, { before, after: [...new Set(dto.permissions!)] }]]),
        );
        await writeRolePermissions(tx, actor, role, diff!, await permissionIdMap(tx), client);
      } else {
        const bumped = await tx.role.updateMany({
          where: { id, version: role.version },
          data: { version: { increment: 1 } },
        });
        if (bumped.count === 0) throw new ConflictException(STALE_ROLE);
      }

      if (Object.keys(fields).length) {
        await tx.role.update({ where: { id }, data: fields });
        await recordAudit(tx, {
          actorId: actor.id,
          action: 'role.updated',
          targetType: 'Role',
          targetId: id,
          targetLabel: (fields.name as string | undefined) ?? role.name,
          before: prev,
          after: fields,
          ip: client.ip,
          userAgent: client.userAgent,
        });
      }
    });
  }

  /** Custom roles only. Users must be reassigned (or the role emptied) first. */
  async remove(
    actor: RequestUser,
    id: string,
    reassignToRoleId: string | undefined,
    client: ClientInfo,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await withAdminLock(tx);
      const role = await tx.role.findUnique({
        where: { id },
        include: {
          permissions: { include: { permission: true } },
          users: { include: { user: { select: { email: true } } } },
        },
      });
      if (!role) throw new NotFoundException('Role not found');
      assertRoleEditable(role, { delete: true });

      const holders = role.users;
      let target: { id: string; name: string } | null = null;
      if (holders.length > 0) {
        if (!reassignToRoleId) {
          throw new ConflictException(
            `Reassign or remove this role from its ${holders.length} ${holders.length === 1 ? 'user' : 'users'} first.`,
          );
        }
        if (reassignToRoleId === id) {
          throw new BadRequestException('Choose a different role to move the users to.');
        }
        const t = await tx.role.findUnique({
          where: { id: reassignToRoleId },
          include: { permissions: { include: { permission: true } } },
        });
        if (!t) throw new BadRequestException('The role to move users to was not found.');
        assertCanGrant(
          actor.permissions,
          t.permissions.map((p) => p.permission.code),
        );
        target = t;
      }

      // The actor must not lose admin capabilities by deleting a role they hold.
      await assertSafeRoleChanges(
        tx,
        actor,
        new Map([[id, { before: role.permissions.map((p) => p.permission.code), after: null }]]),
      );

      if (target) {
        for (const h of holders) {
          await tx.userRole.upsert({
            where: { userId_roleId: { userId: h.userId, roleId: target.id } },
            create: {
              userId: h.userId,
              roleId: target.id,
              expiresAt: h.expiresAt,
              assignedById: actor.id,
            },
            update: {},
          });
        }
      }
      await tx.role.delete({ where: { id } });
      await recordAudit(tx, {
        actorId: actor.id,
        action: 'role.deleted',
        targetType: 'Role',
        targetId: id,
        targetLabel: role.name,
        before: {
          name: role.name,
          permissions: role.permissions.map((p) => p.permission.code).sort(),
          users: holders.length,
        },
        after: target ? { reassignedTo: { id: target.id, name: target.name } } : null,
        ip: client.ip,
        userAgent: client.userAgent,
      });
      await assertAdminsRemainInDb(tx);
    });
  }
}
