import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { isPrivileged } from '@erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { recordAudit } from '../../common/audit';
import { ClientInfo } from '../../common/client-info';
import { RequestUser } from '../../common/types/request-user';
import { assertNotSelf } from '../iam/access-policy';
import { assertAdminsRemainInDb, withAdminLock } from '../iam/admin-lock';
import { SecurityPolicyService } from '../iam/security-policy.service';
import { AccountTokensService } from '../auth/account-tokens.service';
import { MfaService } from '../auth/mfa.service';
import { SessionsService } from '../auth/sessions.service';
import { MailService } from '../mail/mail.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { UserRolesService } from './user-roles.service';

type Tx = Prisma.TransactionClient;

const EMAIL_TAKEN = 'A user with this email already exists.';
const USERNAME_TAKEN = 'This username is already taken.';
const PROFILE_FIELDS = [
  'firstName',
  'lastName',
  'email',
  'username',
  'phone',
  'department',
  'jobTitle',
  'employeeId',
  'metadata',
] as const;

/** Maps unique-constraint races to the same 409 as the explicit checks. */
function rethrowUnique(e: unknown): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    const target = String((e.meta as { target?: unknown } | undefined)?.target ?? '');
    throw new ConflictException(target.includes('username') ? USERNAME_TAKEN : EMAIL_TAKEN);
  }
  throw e;
}

/** Writes on users: create, edit, (de)activate, credentials, MFA, sessions, reviews. */
@Injectable()
export class UserLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roles: UserRolesService,
    private readonly tokens: AccountTokensService,
    private readonly sessions: SessionsService,
    private readonly mfa: MfaService,
    private readonly policy: SecurityPolicyService,
    private readonly mail: MailService,
  ) {}

  private async find(tx: Tx | PrismaService, id: string): Promise<User> {
    const u = await tx.user.findUnique({ where: { id } });
    if (!u) throw new NotFoundException('User not found');
    return u;
  }

  private audit(
    tx: Tx | PrismaService,
    actor: RequestUser,
    user: Pick<User, 'id' | 'email'>,
    action: string,
    client: ClientInfo,
    extra: { before?: object; after?: object; reason?: string | null } = {},
  ) {
    return recordAudit(tx, {
      actorId: actor.id,
      action,
      targetType: 'User',
      targetId: user.id,
      targetLabel: user.email,
      ip: client.ip,
      userAgent: client.userAgent,
      ...extra,
    });
  }

  private async assertUnique(email?: string, username?: string | null, exceptId?: string) {
    const not = exceptId ? { id: { not: exceptId } } : {};
    if (email && (await this.prisma.user.findFirst({ where: { email, ...not } }))) {
      throw new ConflictException(EMAIL_TAKEN);
    }
    if (username && (await this.prisma.user.findFirst({ where: { username, ...not } }))) {
      throw new ConflictException(USERNAME_TAKEN);
    }
  }

  // ─── Create / update ────────────────────────────────────────────────────

  async create(actor: RequestUser, dto: CreateUserDto, client: ClientInfo): Promise<string> {
    if (dto.roles?.length && !actor.permissions.has('admin.user.assign_roles')) {
      throw new ForbiddenException('Missing permission: admin.user.assign_roles');
    }
    await this.assertUnique(dto.email, dto.username);
    const policy = await this.policy.get();
    const sendInvitation = dto.active !== false && dto.sendInvitation !== false;
    // A user without a password is never ACTIVE: they become ACTIVE by accepting the invitation.
    const status = dto.active === false ? 'INACTIVE' : 'PENDING';

    const roleIds = (dto.roles ?? []).map((r) => r.roleId);
    const rolePerms = roleIds.length
      ? (
          await this.prisma.rolePermission.findMany({
            where: { roleId: { in: roleIds } },
            include: { permission: true },
          })
        ).map((rp) => rp.permission.code)
      : [];
    const mfaRequired =
      dto.requireMfa === true || (policy.requireMfaForPrivileged && isPrivileged(rolePerms));

    let token: string | null = null;
    const user = await this.prisma
      .$transaction(async (tx) => {
        const u = await tx.user.create({
          data: {
            email: dto.email,
            username: dto.username ?? null,
            firstName: dto.firstName,
            lastName: dto.lastName,
            fullName: `${dto.firstName} ${dto.lastName}`,
            phone: dto.phone ?? null,
            department: dto.department ?? null,
            jobTitle: dto.jobTitle ?? null,
            employeeId: dto.employeeId ?? null,
            metadata: dto.metadata ?? {},
            status,
            mfaRequired,
            ...(status === 'INACTIVE'
              ? { deactivatedAt: new Date(), deactivatedById: actor.id }
              : {}),
          },
        });
        await this.audit(tx, actor, u, 'user.created', client, {
          after: {
            email: u.email,
            fullName: u.fullName,
            status,
            mfaRequired,
            invited: sendInvitation,
          },
        });
        if (dto.roles?.length) {
          await this.roles.apply(tx, actor, u.id, { set: dto.roles }, client);
        }
        if (sendInvitation) {
          token = await this.tokens.issue(u.id, 'INVITATION', actor.id, tx);
          await this.audit(tx, actor, u, 'user.invitation_sent', client);
        }
        return u;
      })
      .catch(rethrowUnique);

    // Mail after commit: never email a link for a user that was rolled back.
    if (token) await this.tokens.mailToken(user, 'INVITATION', token);
    return user.id;
  }

  async update(
    actor: RequestUser,
    id: string,
    dto: UpdateUserDto,
    client: ClientInfo,
  ): Promise<void> {
    if (dto.requireMfa !== undefined && !actor.permissions.has('admin.user.manage_mfa')) {
      throw new ForbiddenException('Missing permission: admin.user.manage_mfa');
    }
    const current = await this.find(this.prisma, id);
    await this.assertUnique(
      dto.email !== current.email ? dto.email : undefined,
      dto.username !== current.username ? dto.username : undefined,
      id,
    );

    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    const data: Prisma.UserUpdateInput = {};
    for (const f of PROFILE_FIELDS) {
      const next = dto[f];
      if (next === undefined) continue;
      const prev = current[f];
      if (JSON.stringify(prev ?? null) === JSON.stringify(next ?? null)) continue;
      before[f] = prev;
      after[f] = next;
      (data as Record<string, unknown>)[f] = next;
    }
    if (dto.requireMfa !== undefined && dto.requireMfa !== current.mfaRequired) {
      before.mfaRequired = current.mfaRequired;
      after.mfaRequired = dto.requireMfa;
      data.mfaRequired = dto.requireMfa;
    }
    if (Object.keys(after).length === 0) return;

    if ('firstName' in after || 'lastName' in after) {
      data.fullName = `${dto.firstName ?? current.firstName} ${dto.lastName ?? current.lastName}`;
    }
    const emailChanged = 'email' in after;
    if (emailChanged) data.emailVerifiedAt = null;

    const updated = await this.prisma
      .$transaction(async (tx) => {
        const u = await tx.user.update({ where: { id }, data });
        await this.audit(tx, actor, u, 'user.updated', client, { before, after });
        return u;
      })
      .catch(rethrowUnique);

    if (emailChanged && updated.status !== 'INACTIVE') {
      await this.tokens.sendEmailVerification(updated, actor.id, client);
    }
  }

  // ─── Status ─────────────────────────────────────────────────────────────

  async deactivate(
    actor: RequestUser,
    id: string,
    reason: string | null | undefined,
    client: ClientInfo,
  ): Promise<void> {
    assertNotSelf(actor.id, id, 'deactivate your own account');
    const user = await this.prisma.$transaction(async (tx) => {
      await withAdminLock(tx);
      const u = await this.find(tx, id);
      if (u.status === 'INACTIVE') throw new ConflictException('This user is already inactive.');
      await tx.user.update({
        where: { id },
        data: {
          status: 'INACTIVE',
          deactivatedAt: new Date(),
          deactivatedById: actor.id,
          deactivationReason: reason ?? null,
        },
      });
      await this.sessions.revokeAllForUser(id, 'user_deactivated', tx);
      await this.tokens.revokeAll(id, tx);
      await this.audit(tx, actor, u, 'user.deactivated', client, {
        before: { status: u.status },
        after: { status: 'INACTIVE' },
        reason: reason ?? null,
      });
      await assertAdminsRemainInDb(tx);
      return u;
    });
    await this.mail.send(user.email, 'account_deactivated', { name: user.firstName });
  }

  async activate(actor: RequestUser, id: string, client: ClientInfo): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const u = await this.find(tx, id);
      if (u.status !== 'INACTIVE') throw new ConflictException('This user is already active.');
      // Roles are kept; MFA / forced password change still apply at the next login.
      const status = u.passwordHash ? 'ACTIVE' : 'PENDING';
      await tx.user.update({
        where: { id },
        data: { status, deactivatedAt: null, deactivatedById: null, deactivationReason: null },
      });
      await this.audit(tx, actor, u, 'user.activated', client, {
        before: { status: 'INACTIVE' },
        after: { status },
      });
    });
  }

  // ─── Credentials ────────────────────────────────────────────────────────

  async sendPasswordReset(actor: RequestUser, id: string, client: ClientInfo): Promise<void> {
    const u = await this.find(this.prisma, id);
    if (u.status === 'PENDING') {
      throw new ConflictException(
        'This user has not accepted their invitation yet. Resend the invitation instead.',
      );
    }
    if (u.status !== 'ACTIVE') {
      throw new ConflictException('Activate this user before sending a reset link.');
    }
    await this.tokens.sendPasswordReset(u, actor.id, client);
  }

  async resendInvitation(actor: RequestUser, id: string, client: ClientInfo): Promise<void> {
    const u = await this.find(this.prisma, id);
    if (u.status !== 'PENDING') {
      throw new ConflictException('Only users who have not joined yet can be invited.');
    }
    await this.tokens.sendInvitation(u, actor, client);
  }

  async revokeInvitation(actor: RequestUser, id: string, client: ClientInfo): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const u = await this.find(tx, id);
      const now = new Date();
      const res = await tx.userToken.updateMany({
        where: { userId: id, type: 'INVITATION', usedAt: null, expiresAt: { gt: now } },
        data: { expiresAt: now },
      });
      if (res.count === 0) throw new ConflictException('There is no pending invitation.');
      await this.audit(tx, actor, u, 'user.invitation_revoked', client);
    });
  }

  async resendVerification(actor: RequestUser, id: string, client: ClientInfo): Promise<void> {
    const u = await this.find(this.prisma, id);
    if (u.emailVerifiedAt) throw new ConflictException('This email address is already verified.');
    if (u.status === 'INACTIVE') throw new ConflictException('This user is inactive.');
    await this.tokens.sendEmailVerification(u, actor.id, client);
  }

  /** Next login must set a new password; current sessions end now. */
  async forcePasswordChange(actor: RequestUser, id: string, client: ClientInfo): Promise<void> {
    assertNotSelf(actor.id, id, 'force a password change on your own account');
    await this.prisma.$transaction(async (tx) => {
      const u = await this.find(tx, id);
      await tx.user.update({ where: { id }, data: { mustChangePassword: true } });
      await this.sessions.revokeAllForUser(id, 'password_change_required', tx);
      await this.audit(tx, actor, u, 'user.password_change_required', client);
    });
  }

  async unlock(actor: RequestUser, id: string, client: ClientInfo): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const u = await this.find(tx, id);
      await tx.user.update({ where: { id }, data: { failedLoginCount: 0, lockedUntil: null } });
      await this.audit(tx, actor, u, 'user.unlocked', client, {
        before: { failedLoginCount: u.failedLoginCount, lockedUntil: u.lockedUntil?.toISOString() ?? null },
      });
    });
  }

  /** Removes the user's MFA (lost device). They must enrol again if MFA is required. */
  async resetMfa(actor: RequestUser, id: string, client: ClientInfo): Promise<void> {
    assertNotSelf(actor.id, id, 'reset your own two-step verification here');
    const user = await this.prisma.$transaction(async (tx) => {
      const u = await this.find(tx, id);
      const m = await tx.userMfa.findUnique({ where: { userId: id } });
      if (!m) throw new ConflictException('Two-step verification is not set up for this user.');
      await this.mfa.disable(id, tx);
      await this.sessions.revokeAllForUser(id, 'mfa_reset', tx);
      await this.audit(tx, actor, u, 'user.mfa_reset', client);
      return u;
    });
    await this.mail.send(user.email, 'mfa_reset', { name: user.firstName });
  }

  // ─── Sessions & reviews ─────────────────────────────────────────────────

  async revokeSessions(
    actor: RequestUser,
    id: string,
    sessionId: string | undefined,
    client: ClientInfo,
  ): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const u = await this.find(tx, id);
      let count: number;
      if (sessionId) {
        const owner = await tx.session.findUnique({ where: { id: sessionId } });
        if (owner?.userId !== id) throw new NotFoundException('Session not found');
        count = (await this.sessions.revoke(sessionId, 'revoked_by_admin', tx)) ? 1 : 0;
      } else {
        count = await this.sessions.revokeAllForUser(id, 'revoked_by_admin', tx);
      }
      await this.audit(tx, actor, u, 'session.revoked', client, {
        reason: 'revoked_by_admin',
        after: { sessions: count, ...(sessionId ? { sessionId } : {}) },
      });
      return count;
    });
  }

  async reviewAccess(actor: RequestUser, id: string, client: ClientInfo): Promise<void> {
    assertNotSelf(actor.id, id, 'review your own access');
    await this.prisma.$transaction(async (tx) => {
      const u = await this.find(tx, id);
      const now = new Date();
      await tx.user.update({
        where: { id },
        data: { accessReviewedAt: now, accessReviewedById: actor.id },
      });
      await this.audit(tx, actor, u, 'user.access_reviewed', client, {
        before: { accessReviewedAt: u.accessReviewedAt?.toISOString() ?? null },
        after: { accessReviewedAt: now.toISOString() },
      });
    });
  }
}
