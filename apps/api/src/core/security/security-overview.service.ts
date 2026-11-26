import { Injectable } from '@nestjs/common';
import {
  isPrivileged,
  PermissionCode,
  SecurityListKey,
  SecurityOverview,
  SecurityUserMini,
  SENSITIVE_PERMISSIONS,
} from '@erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AUDIT_INCLUDE, toAuditDto } from '../audit/audit-dto';
import { SecurityPolicyService } from '../iam/security-policy.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const LIST_MAX = 10;
const EXCESSIVE_SENSITIVE = 8;
const ADMIN_ACTIONS = ['user.', 'role.', 'security.', 'session.', 'access.'];

/** The admin "security health" page: who needs attention, and recent admin activity. */
@Injectable()
export class SecurityOverviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: SecurityPolicyService,
  ) {}

  async overview(): Promise<SecurityOverview> {
    const policy = await this.policy.get();
    const now = new Date();
    const dormantBefore = new Date(now.getTime() - policy.dormantDays * DAY_MS);
    const reviewBefore = new Date(now.getTime() - policy.accessReviewDays * DAY_MS);

    // An SMB-sized ERP: loading every user with their live roles is cheap and keeps rules in one place.
    const users = await this.prisma.user.findMany({
      include: {
        mfa: { select: { enabledAt: true } },
        roles: {
          where: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          include: { role: { include: { permissions: { include: { permission: true } } } } },
        },
        tokens: {
          where: { type: 'INVITATION', usedAt: null, expiresAt: { gt: now } },
          select: { id: true },
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    const lists: Record<SecurityListKey, SecurityUserMini[]> = {
      withoutMfaPrivileged: [],
      neverLoggedIn: [],
      dormant: [],
      reviewOverdue: [],
      excessive: [],
      pendingInvitations: [],
      locked: [],
    };
    let active = 0;
    let withoutMfa = 0;
    let privilegedCount = 0;

    for (const u of users) {
      const perms = new Set(u.roles.flatMap((r) => r.role.permissions.map((p) => p.permission.code)));
      const sensitive = [...perms].filter((c) => SENSITIVE_PERMISSIONS.has(c as PermissionCode));
      const privileged = isPrivileged(perms);
      const mfaOn = !!u.mfa?.enabledAt;
      const mini = (note: string | null = null): SecurityUserMini => ({
        id: u.id,
        fullName: u.fullName,
        email: u.email,
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        note,
      });

      if (u.lockedUntil && u.lockedUntil > now) {
        lists.locked.push(mini(`Locked until ${u.lockedUntil.toISOString()}`));
      }
      if (u.status === 'PENDING') {
        lists.pendingInvitations.push(mini(u.tokens.length ? 'Invitation sent' : 'Invitation expired'));
      }
      if (u.status !== 'ACTIVE') continue;

      active++;
      if (!mfaOn) withoutMfa++;
      if (privileged) privilegedCount++;
      const dormant = !!u.lastLoginAt && u.lastLoginAt < dormantBefore;

      if (privileged && !mfaOn) lists.withoutMfaPrivileged.push(mini(`${sensitive.length} sensitive permissions`));
      if (!u.lastLoginAt) lists.neverLoggedIn.push(mini());
      if (dormant) lists.dormant.push(mini());
      const reviewedOrCreated = u.accessReviewedAt ?? u.createdAt;
      if (u.roles.length > 0 && reviewedOrCreated < reviewBefore) {
        lists.reviewOverdue.push(mini(u.accessReviewedAt ? 'Last reviewed long ago' : 'Never reviewed'));
      }
      if (sensitive.length >= EXCESSIVE_SENSITIVE) {
        lists.excessive.push(mini(`${sensitive.length} sensitive permissions`));
      } else if (privileged && dormant) {
        lists.excessive.push(mini('Privileged but dormant'));
      }
    }

    const recent = await this.prisma.auditLog.findMany({
      where: {
        OR: [...ADMIN_ACTIONS.map((p) => ({ action: { startsWith: p } })), { result: 'DENIED' }],
      },
      include: AUDIT_INCLUDE,
      orderBy: { id: 'desc' },
      take: 20,
    });

    const out = Object.fromEntries(
      Object.entries(lists).map(([k, v]) => [k, { count: v.length, users: v.slice(0, LIST_MAX) }]),
    ) as SecurityOverview['lists'];

    return {
      totalUsers: users.length,
      activeUsers: active,
      withoutMfa,
      privilegedUsers: privilegedCount,
      pendingInvitations: lists.pendingInvitations.length,
      lockedAccounts: lists.locked.length,
      neverLoggedIn: lists.neverLoggedIn.length,
      dormant: lists.dormant.length,
      overdueAccessReviews: lists.reviewOverdue.length,
      lists: out,
      recentActivity: recent.map(toAuditDto),
    };
  }
}
