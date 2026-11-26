import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AuditEntryDto,
  EffectivePermission,
  Page,
  PERMISSION_DEFINITIONS,
  PermissionCode,
  RoleColor,
  RoleRef,
  SessionInfo,
  UserDetail,
  UserListItem,
  UserStats,
} from '@erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { Assignment, explainPermissions } from '../iam/permission-resolution';
import { AUDIT_INCLUDE, toAuditDto } from '../audit/audit-dto';
import { SessionsService } from '../auth/sessions.service';
import { PageQueryDto, UserListQueryDto } from './dto/user-query.dto';
import { buildUserOrderBy, buildUserWhere } from './user-query';

export const USER_LIST_INCLUDE = {
  roles: { include: { role: true }, orderBy: { role: { name: 'asc' } } },
  mfa: { select: { enabledAt: true } },
} satisfies Prisma.UserInclude;

const USER_DETAIL_INCLUDE = {
  roles: {
    include: {
      role: { include: { permissions: { include: { permission: true } } } },
      assignedBy: { select: { fullName: true } },
    },
    orderBy: { role: { name: 'asc' } },
  },
  mfa: { select: { enabledAt: true } },
  deactivatedBy: { select: { fullName: true } },
  accessReviewedBy: { select: { fullName: true } },
} satisfies Prisma.UserInclude;

type ListRow = Prisma.UserGetPayload<{ include: typeof USER_LIST_INCLUDE }>;
type DetailRow = Prisma.UserGetPayload<{ include: typeof USER_DETAIL_INCLUDE }>;

const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;
const roleRef = (r: { id: string; name: string; color: string }): RoleRef => ({
  id: r.id,
  name: r.name,
  color: r.color as RoleColor,
});
const DEFINITIONS = new Map(PERMISSION_DEFINITIONS.map((d) => [d.code as string, d]));

export function toListItem(u: ListRow, now = new Date()): UserListItem {
  const live = u.roles.filter((r) => !r.expiresAt || r.expiresAt > now);
  return {
    id: u.id,
    email: u.email,
    username: u.username,
    firstName: u.firstName,
    lastName: u.lastName,
    fullName: u.fullName,
    department: u.department,
    jobTitle: u.jobTitle,
    status: u.status,
    displayStatus: u.lockedUntil && u.lockedUntil > now ? 'LOCKED' : u.status,
    roles: live.map((r) => roleRef(r.role)),
    mfaEnabled: !!u.mfa?.enabledAt,
    emailVerified: !!u.emailVerifiedAt,
    lastLoginAt: iso(u.lastLoginAt),
    createdAt: u.createdAt.toISOString(),
  };
}

/** Read side of user administration. */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
  ) {}

  async list(q: UserListQueryDto): Promise<Page<UserListItem>> {
    const now = new Date();
    const where = buildUserWhere(q, now);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        include: USER_LIST_INCLUDE,
        orderBy: buildUserOrderBy(q),
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return { items: rows.map((u) => toListItem(u, now)), total, page: q.page, pageSize: q.pageSize };
  }

  async stats(): Promise<UserStats> {
    const now = new Date();
    const [total, active, pending, inactive, locked, withoutMfa] = await this.prisma.$transaction([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { status: 'ACTIVE' } }),
      this.prisma.user.count({ where: { status: 'PENDING' } }),
      this.prisma.user.count({ where: { status: 'INACTIVE' } }),
      this.prisma.user.count({ where: { lockedUntil: { gt: now } } }),
      this.prisma.user.count({
        where: {
          status: 'ACTIVE',
          OR: [{ mfa: { is: null } }, { mfa: { is: { enabledAt: null } } }],
        },
      }),
    ]);
    return { total, active, pending, inactive, locked, withoutMfa };
  }

  async departments(): Promise<string[]> {
    const rows = await this.prisma.user.findMany({
      where: { department: { not: null } },
      select: { department: true },
      distinct: ['department'],
      orderBy: { department: 'asc' },
    });
    return rows.map((r) => r.department!).filter((d) => d.trim() !== '');
  }

  private async load(id: string): Promise<DetailRow> {
    const u = await this.prisma.user.findUnique({ where: { id }, include: USER_DETAIL_INCLUDE });
    if (!u) throw new NotFoundException('User not found');
    return u;
  }

  async detail(id: string): Promise<UserDetail> {
    const u = await this.load(id);
    const now = new Date();
    const pendingInvite = await this.prisma.userToken.count({
      where: { userId: id, type: 'INVITATION', usedAt: null, expiresAt: { gt: now } },
    });
    const metadata =
      u.metadata && typeof u.metadata === 'object' && !Array.isArray(u.metadata)
        ? (u.metadata as Record<string, string>)
        : {};
    return {
      ...toListItem(u, now),
      phone: u.phone,
      employeeId: u.employeeId,
      metadata,
      assignments: u.roles.map((r) => ({
        role: roleRef(r.role),
        assignedAt: r.assignedAt.toISOString(),
        assignedBy: r.assignedBy?.fullName ?? null,
        expiresAt: iso(r.expiresAt),
      })),
      mfaRequired: u.mfaRequired,
      mustChangePassword: u.mustChangePassword,
      passwordChangedAt: iso(u.passwordChangedAt),
      emailVerifiedAt: iso(u.emailVerifiedAt),
      failedLoginCount: u.failedLoginCount,
      lockedUntil: u.lockedUntil && u.lockedUntil > now ? u.lockedUntil.toISOString() : null,
      deactivatedAt: iso(u.deactivatedAt),
      deactivatedBy: u.deactivatedBy?.fullName ?? null,
      deactivationReason: u.deactivationReason,
      accessReviewedAt: iso(u.accessReviewedAt),
      accessReviewedBy: u.accessReviewedBy?.fullName ?? null,
      hasPendingInvitation: pendingInvite > 0,
      updatedAt: u.updatedAt.toISOString(),
    };
  }

  /** What the user can do right now and which role grants each permission. */
  async effectivePermissions(id: string): Promise<EffectivePermission[]> {
    const u = await this.load(id);
    const assignments: Assignment[] = u.roles.map((r) => ({
      roleId: r.role.id,
      roleName: r.role.name,
      isAdminRole: r.role.isProtected,
      expiresAt: r.expiresAt,
      permissions: r.role.permissions.map((p) => p.permission.code),
    }));
    const colors = new Map(u.roles.map((r) => [r.role.id, r.role.color as RoleColor]));
    const explained = explainPermissions(assignments, new Date());
    const order = new Map(PERMISSION_DEFINITIONS.map((d, i) => [d.code as string, i]));
    return [...explained.entries()]
      .sort(([a], [b]) => (order.get(a) ?? 0) - (order.get(b) ?? 0))
      .map(([code, sources]: [PermissionCode, { roleId: string; roleName: string }[]]) => {
        const def = DEFINITIONS.get(code)!;
        return {
          code,
          label: def.label,
          module: def.module,
          sensitive: def.sensitive,
          sources: sources.map((s) => ({
            id: s.roleId,
            name: s.roleName,
            color: colors.get(s.roleId) ?? 'slate',
          })),
        };
      });
  }

  /** Audit events about the user or performed by them, newest first. */
  async activity(id: string, q: PageQueryDto): Promise<Page<AuditEntryDto>> {
    await this.load(id);
    const where: Prisma.AuditLogWhereInput = {
      OR: [{ entity: 'User', entityId: id }, { userId: id }],
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        include: AUDIT_INCLUDE,
        orderBy: { id: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return { items: rows.map(toAuditDto), total, page: q.page, pageSize: q.pageSize };
  }

  async sessionsOf(id: string): Promise<SessionInfo[]> {
    await this.load(id);
    return this.sessions.listForUser(id);
  }
}
