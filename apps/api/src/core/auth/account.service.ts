import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { AccountSecurity, isPrivileged, MfaEnrollStart } from '@erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { recordAudit } from '../../common/audit';
import { ClientInfo } from '../../common/client-info';
import { RequestUser } from '../../common/types/request-user';
import { SecurityPolicyService } from '../iam/security-policy.service';
import { MailService } from '../mail/mail.service';
import { AuthService } from './auth.service';
import { MfaInput, MfaService } from './mfa.service';
import { SessionsService } from './sessions.service';

const BAD_CODE = 'That code is not valid.';

/** A 6-digit string is a TOTP code; anything else is treated as a recovery code. */
function toMfaInput(code: string): MfaInput {
  const c = code.trim();
  return /^\d{6}$/.test(c) ? { code: c } : { recoveryCode: c };
}

/** Self-service security for the logged-in user. Everything is audited with actor = self. */
@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly mfa: MfaService,
    private readonly sessions: SessionsService,
    private readonly policy: SecurityPolicyService,
    private readonly mail: MailService,
  ) {}

  private async mfaRequired(me: RequestUser, flag: boolean): Promise<boolean> {
    const policy = await this.policy.get();
    return flag || (policy.requireMfaForPrivileged && isPrivileged(me.permissions));
  }

  async security(me: RequestUser): Promise<AccountSecurity> {
    const user = await this.prisma.user.findUnique({ where: { id: me.id }, include: { mfa: true } });
    if (!user) throw new NotFoundException('User not found');
    return {
      mfaEnabled: !!user.mfa?.enabledAt,
      mfaRequired: await this.mfaRequired(me, user.mfaRequired),
      recoveryCodesLeft: user.mfa?.enabledAt ? await this.mfa.recoveryCodesLeft(me.id) : 0,
      passwordChangedAt: user.passwordChangedAt?.toISOString() ?? null,
      sessions: await this.sessions.listForUser(me.id, me.sessionId),
    };
  }

  /** Changes the password and signs out every other session. */
  async changePassword(
    me: RequestUser,
    currentPassword: string,
    newPassword: string,
    client: ClientInfo,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: me.id } });
    if (!user?.passwordHash || !(await argon2.verify(user.passwordHash, currentPassword))) {
      throw new BadRequestException({
        statusCode: 400,
        message: ['Your current password is not correct.'],
        error: 'Bad Request',
      });
    }
    if (currentPassword === newPassword) {
      throw new BadRequestException({
        statusCode: 400,
        message: ['Choose a password different from your current one.'],
        error: 'Bad Request',
      });
    }
    await this.auth.assertNewPassword(newPassword, user);
    const passwordHash = await argon2.hash(newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: me.id },
        data: { passwordHash, passwordChangedAt: new Date(), mustChangePassword: false },
      });
      await this.sessions.revokeAllForUser(me.id, 'password_changed', tx, me.sessionId);
      await recordAudit(tx, {
        actorId: me.id,
        action: 'user.password_changed',
        targetType: 'User',
        targetId: me.id,
        targetLabel: me.email,
        ip: client.ip,
        userAgent: client.userAgent,
      });
    });
    await this.mail.send(user.email, 'password_changed', { name: user.firstName });
  }

  startMfa(me: RequestUser): Promise<MfaEnrollStart> {
    return this.mfa.startEnrollment(me.id);
  }

  confirmMfa(me: RequestUser, code: string, client: ClientInfo): Promise<string[]> {
    return this.mfa.confirmEnrollment(me.id, code, client);
  }

  async disableMfa(me: RequestUser, code: string, client: ClientInfo): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: me.id } });
    if (!user) throw new NotFoundException('User not found');
    if (await this.mfaRequired(me, user.mfaRequired)) {
      throw new ConflictException('Two-step verification is required for your account.');
    }
    if (!(await this.mfa.verify(me.id, toMfaInput(code)))) throw new BadRequestException(BAD_CODE);
    await this.prisma.$transaction(async (tx) => {
      await this.mfa.disable(me.id, tx);
      await recordAudit(tx, {
        actorId: me.id,
        action: 'user.mfa_disabled',
        targetType: 'User',
        targetId: me.id,
        targetLabel: me.email,
        ip: client.ip,
        userAgent: client.userAgent,
      });
    });
  }

  async regenerateRecoveryCodes(
    me: RequestUser,
    code: string,
    client: ClientInfo,
  ): Promise<string[]> {
    if (!(await this.mfa.verify(me.id, toMfaInput(code)))) throw new BadRequestException(BAD_CODE);
    return this.mfa.regenerateRecoveryCodes(me.id, client);
  }

  async revokeSession(me: RequestUser, sessionId: string, client: ClientInfo): Promise<void> {
    const owner = await this.sessions.ownerOf(sessionId);
    // Someone else's session looks the same as a missing one.
    if (owner !== me.id) throw new NotFoundException('Session not found');
    if (sessionId === me.sessionId) {
      throw new ForbiddenException('Use "Log out" to end the session you are using.');
    }
    await this.prisma.$transaction(async (tx) => {
      const ended = await this.sessions.revoke(sessionId, 'revoked_by_user', tx);
      if (ended) {
        await recordAudit(tx, {
          actorId: me.id,
          action: 'session.revoked',
          targetType: 'User',
          targetId: me.id,
          targetLabel: me.email,
          reason: 'revoked_by_user',
          after: { sessionId },
          ip: client.ip,
          userAgent: client.userAgent,
        });
      }
    });
  }
}
