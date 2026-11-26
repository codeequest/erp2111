import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as argon2 from 'argon2';
import {
  AuthResponse,
  isPrivileged,
  LoginChallengeKind,
  MfaEnrollStart,
  PasswordPolicyHints,
} from '@erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { recordAudit } from '../../common/audit';
import { ClientInfo } from '../../common/client-info';
import { RateLimiter } from '../../common/rate-limit/rate-limiter';
import { AccessTokenPayload, LoadedUser, RequestUser } from '../../common/types/request-user';
import { BREACHED_MESSAGE, isBreached } from '../iam/breach-check';
import { checkPassword } from '../iam/password-policy';
import { SecurityPolicyService } from '../iam/security-policy.service';
import { hashToken } from '../iam/tokens';
import { MailService } from '../mail/mail.service';
import { AccountTokensService } from './account-tokens.service';
import { MfaInput, MfaService } from './mfa.service';
import { CreatedSession, SessionsService } from './sessions.service';
import { UserAccessService } from './user-access.service';

export interface IssuedSession extends AuthResponse {
  refreshToken: string;
  refreshExpiresAt: Date;
  sessionId: string;
}

export type LoginOutcome =
  | { kind: 'session'; session: IssuedSession }
  | { kind: 'challenge'; challenge: LoginChallengeKind; challengeToken: string };

interface ChallengePayload {
  sub: string;
  purpose: 'login_challenge';
  pending: LoginChallengeKind[];
}

type PasswordOwner = Pick<User, 'email' | 'username' | 'firstName' | 'lastName'>;

const INVALID_LOGIN = 'Invalid email or password';
const STEP_EXPIRED = 'This sign-in step has expired. Please log in again.';
const CHALLENGE_TTL = '5m';
const CHALLENGE_ATTEMPTS = 5;
const CHALLENGE_WINDOW_MS = 5 * 60_000;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private dummyHash?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly userAccess: UserAccessService,
    private readonly sessions: SessionsService,
    private readonly policy: SecurityPolicyService,
    private readonly mfa: MfaService,
    private readonly tokens: AccountTokensService,
    private readonly mail: MailService,
    private readonly limiter: RateLimiter,
  ) {}

  /** Overridable clock (tests). */
  protected now(): Date {
    return new Date();
  }

  // ─── Login ──────────────────────────────────────────────────────────────

  async login(emailInput: string, password: string, client: ClientInfo): Promise<LoginOutcome> {
    const email = normalizeEmail(emailInput);
    const user = await this.prisma.user.findUnique({ where: { email } });
    const now = this.now();
    const fail = async (reason: string, u: User | null) => {
      await recordAudit(this.prisma, {
        actorId: null,
        action: 'auth.login_failed',
        targetType: 'User',
        targetId: u?.id ?? null,
        targetLabel: email,
        result: 'FAILURE',
        reason,
        ip: client.ip,
        userAgent: client.userAgent,
      });
      return new UnauthorizedException(INVALID_LOGIN);
    };

    if (!user) {
      // Spend the same time as a real check so timing doesn't reveal unknown emails.
      await argon2.verify(await this.getDummyHash(), password).catch(() => false);
      throw await fail('unknown_email', null);
    }
    if (user.lockedUntil && user.lockedUntil > now) throw await fail('locked', user);

    const ok = user.passwordHash
      ? await argon2.verify(user.passwordHash, password).catch(() => false)
      : false;
    if (!ok) {
      await this.recordBadPassword(user, now, client);
      throw new UnauthorizedException(INVALID_LOGIN);
    }
    if (user.status !== 'ACTIVE') throw await fail(`status_${user.status.toLowerCase()}`, user);

    if (user.failedLoginCount !== 0 || user.lockedUntil) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockedUntil: null },
      });
    }
    return this.proceed(user.id, await this.pendingSteps(user), client);
  }

  private async recordBadPassword(user: User, now: Date, client: ClientInfo): Promise<void> {
    const policy = await this.policy.get();
    const lockExpired = !!user.lockedUntil && user.lockedUntil <= now;
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: user.id },
        // After an expired lockout the count restarts.
        data: lockExpired
          ? { failedLoginCount: 1, lockedUntil: null }
          : { failedLoginCount: { increment: 1 } },
      });
      await recordAudit(tx, {
        actorId: null,
        action: 'auth.login_failed',
        targetType: 'User',
        targetId: user.id,
        targetLabel: user.email,
        result: 'FAILURE',
        reason: 'bad_password',
        ip: client.ip,
        userAgent: client.userAgent,
      });
      if (updated.failedLoginCount >= policy.lockoutThreshold) {
        const lockedUntil = new Date(now.getTime() + policy.lockoutMinutes * 60_000);
        await tx.user.update({ where: { id: user.id }, data: { lockedUntil } });
        await recordAudit(tx, {
          actorId: null,
          action: 'user.locked',
          targetType: 'User',
          targetId: user.id,
          targetLabel: user.email,
          reason: `${updated.failedLoginCount} failed attempts`,
          after: { lockedUntil: lockedUntil.toISOString() },
          ip: client.ip,
          userAgent: client.userAgent,
        });
      }
    });
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= argon2.hash('timing-equaliser-not-a-real-password');
    return this.dummyHash;
  }

  /** Steps still required before a session: password change, then MFA (verify or enrol). */
  private async pendingSteps(
    user: Pick<User, 'id' | 'mustChangePassword' | 'mfaRequired'>,
  ): Promise<LoginChallengeKind[]> {
    const pending: LoginChallengeKind[] = [];
    if (user.mustChangePassword) pending.push('password_change');
    if (await this.mfa.isEnabled(user.id)) {
      pending.push('mfa');
    } else {
      const policy = await this.policy.get();
      const loaded = await this.userAccess.loadActiveUser(user.id);
      const privileged = !!loaded && isPrivileged(loaded.permissions);
      if (user.mfaRequired || (policy.requireMfaForPrivileged && privileged)) {
        pending.push('mfa_enroll');
      }
    }
    return pending;
  }

  /** Either issues the next challenge or finishes the login with a session. */
  private async proceed(
    userId: string,
    pending: LoginChallengeKind[],
    client: ClientInfo,
  ): Promise<LoginOutcome> {
    if (pending.length > 0) {
      const payload: ChallengePayload = { sub: userId, purpose: 'login_challenge', pending };
      const challengeToken = await this.jwt.signAsync(payload, { expiresIn: CHALLENGE_TTL });
      return { kind: 'challenge', challenge: pending[0], challengeToken };
    }
    const session = await this.issueSession(userId, client);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { lastLoginAt: this.now() } });
      await recordAudit(tx, {
        actorId: userId,
        action: 'auth.login',
        targetType: 'User',
        targetId: userId,
        targetLabel: session.user.email,
        ip: client.ip,
        userAgent: client.userAgent,
      });
    });
    return { kind: 'session', session };
  }

  private async readChallenge(
    token: string,
    expected: LoginChallengeKind,
  ): Promise<{ user: User; rest: LoginChallengeKind[] }> {
    let payload: Partial<ChallengePayload>;
    try {
      payload = await this.jwt.verifyAsync<ChallengePayload>(token);
    } catch {
      throw new UnauthorizedException(STEP_EXPIRED);
    }
    if (
      payload.purpose !== 'login_challenge' ||
      !Array.isArray(payload.pending) ||
      payload.pending[0] !== expected ||
      typeof payload.sub !== 'string'
    ) {
      throw new UnauthorizedException(STEP_EXPIRED);
    }
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== 'ACTIVE' || (user.lockedUntil && user.lockedUntil > this.now())) {
      throw new UnauthorizedException(STEP_EXPIRED);
    }
    return { user, rest: payload.pending.slice(1) };
  }

  /** Counts every attempt against one challenge token. */
  private throttleChallenge(token: string): void {
    const r = this.limiter.hit(
      `challenge:${hashToken(token)}`,
      CHALLENGE_ATTEMPTS,
      CHALLENGE_WINDOW_MS,
    );
    if (!r.allowed) {
      throw new HttpException(
        {
          statusCode: 429,
          message: 'Too many attempts. Please log in again.',
          error: 'Too Many Requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async challengeMfa(token: string, input: MfaInput, client: ClientInfo): Promise<LoginOutcome> {
    this.throttleChallenge(token);
    const { user, rest } = await this.readChallenge(token, 'mfa');
    const ok = await this.mfa.verify(user.id, input);
    if (!ok) {
      await recordAudit(this.prisma, {
        actorId: null,
        action: 'auth.mfa_failed',
        targetType: 'User',
        targetId: user.id,
        targetLabel: user.email,
        result: 'FAILURE',
        reason: input.recoveryCode ? 'bad_recovery_code' : 'bad_code',
        ip: client.ip,
        userAgent: client.userAgent,
      });
      throw new UnauthorizedException('That code is not valid.');
    }
    if (input.recoveryCode) {
      await recordAudit(this.prisma, {
        actorId: user.id,
        action: 'user.mfa_recovery_code_used',
        targetType: 'User',
        targetId: user.id,
        targetLabel: user.email,
        ip: client.ip,
        userAgent: client.userAgent,
      });
    }
    return this.proceed(user.id, rest, client);
  }

  async challengeMfaEnrollStart(token: string): Promise<MfaEnrollStart> {
    const { user } = await this.readChallenge(token, 'mfa_enroll');
    return this.mfa.startEnrollment(user.id);
  }

  async challengeMfaEnrollConfirm(
    token: string,
    code: string,
    client: ClientInfo,
  ): Promise<{ outcome: LoginOutcome; recoveryCodes: string[] }> {
    this.throttleChallenge(token);
    const { user, rest } = await this.readChallenge(token, 'mfa_enroll');
    const recoveryCodes = await this.mfa.confirmEnrollment(user.id, code, client);
    return { outcome: await this.proceed(user.id, rest, client), recoveryCodes };
  }

  async challengePassword(
    token: string,
    newPassword: string,
    client: ClientInfo,
  ): Promise<LoginOutcome> {
    this.throttleChallenge(token);
    const { user, rest } = await this.readChallenge(token, 'password_change');
    // The step is done once: a replayed token can't change the password again.
    if (!user.mustChangePassword) throw new UnauthorizedException(STEP_EXPIRED);
    await this.assertNewPassword(newPassword, user);
    if (user.passwordHash && (await argon2.verify(user.passwordHash, newPassword))) {
      throw new BadRequestException({
        statusCode: 400,
        message: ['Choose a password different from your current one.'],
        error: 'Bad Request',
      });
    }
    const passwordHash = await argon2.hash(newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash, passwordChangedAt: this.now(), mustChangePassword: false },
      });
      await recordAudit(tx, {
        actorId: user.id,
        action: 'user.password_changed',
        targetType: 'User',
        targetId: user.id,
        targetLabel: user.email,
        reason: 'required_at_login',
        ip: client.ip,
        userAgent: client.userAgent,
      });
    });
    return this.proceed(user.id, rest, client);
  }

  // ─── Passwords ──────────────────────────────────────────────────────────

  /** Throws 400 with every problem found (policy, then optional breach lookup). */
  async assertNewPassword(password: string, owner: PasswordOwner): Promise<void> {
    const policy = await this.policy.get();
    const errors = checkPassword(
      password,
      {
        email: owner.email,
        username: owner.username,
        firstName: owner.firstName,
        lastName: owner.lastName,
      },
      {
        minLength: policy.passwordMinLength,
        maxLength: policy.passwordMaxLength,
        blockCommon: policy.blockBreachedPasswords,
      },
    );
    if (errors.length === 0 && policy.breachApiCheck && (await isBreached(password))) {
      errors.push(BREACHED_MESSAGE);
    }
    if (errors.length > 0) {
      throw new BadRequestException({ statusCode: 400, message: errors, error: 'Bad Request' });
    }
  }

  async passwordPolicyHints(): Promise<PasswordPolicyHints> {
    const p = await this.policy.get();
    return { minLength: p.passwordMinLength, maxLength: p.passwordMaxLength };
  }

  /** Always the same answer, whether or not the email exists. */
  async forgotPassword(emailInput: string, client: ClientInfo): Promise<{ ok: true }> {
    const user = await this.prisma.user.findUnique({ where: { email: normalizeEmail(emailInput) } });
    if (user?.status === 'ACTIVE') {
      // Not awaited: response time must not reveal that the account exists.
      void this.tokens
        .sendPasswordReset(user, null, client)
        .catch((e: Error) => this.logger.error(`Password reset email failed: ${e.message}`));
    }
    return { ok: true };
  }

  async resetPassword(token: string, newPassword: string, client: ClientInfo): Promise<void> {
    const candidate = await this.tokens.peek(token, 'PASSWORD_RESET');
    await this.assertNewPassword(newPassword, candidate);
    const passwordHash = await argon2.hash(newPassword);
    const policy = await this.policy.get();

    const user = await this.prisma.$transaction(async (tx) => {
      const u = await this.tokens.consume(token, 'PASSWORD_RESET', tx);
      await tx.user.update({
        where: { id: u.id },
        data: {
          passwordHash,
          passwordChangedAt: this.now(),
          mustChangePassword: false,
          failedLoginCount: 0,
          lockedUntil: null,
        },
      });
      if (policy.revokeSessionsOnPasswordReset) {
        await this.sessions.revokeAllForUser(u.id, 'password_reset', tx);
      }
      await recordAudit(tx, {
        actorId: u.id,
        action: 'user.password_reset',
        targetType: 'User',
        targetId: u.id,
        targetLabel: u.email,
        ip: client.ip,
        userAgent: client.userAgent,
      });
      return u;
    });
    await this.mail.send(user.email, 'password_changed', { name: user.firstName });
  }

  // ─── Invitations & verification ─────────────────────────────────────────

  async inspectInvitation(token: string): Promise<{ email: string; firstName: string }> {
    const user = await this.tokens.peek(token, 'INVITATION');
    return { email: user.email, firstName: user.firstName };
  }

  async acceptInvitation(
    token: string,
    newPassword: string,
    client: ClientInfo,
  ): Promise<LoginOutcome> {
    const candidate = await this.tokens.peek(token, 'INVITATION');
    await this.assertNewPassword(newPassword, candidate);
    const passwordHash = await argon2.hash(newPassword);
    const now = this.now();

    const user = await this.prisma.$transaction(async (tx) => {
      const u = await this.tokens.consume(token, 'INVITATION', tx);
      const updated = await tx.user.update({
        where: { id: u.id },
        data: {
          passwordHash,
          status: 'ACTIVE',
          // Following the emailed link proves the address.
          emailVerifiedAt: u.emailVerifiedAt ?? now,
          passwordChangedAt: now,
          mustChangePassword: false,
        },
      });
      await recordAudit(tx, {
        actorId: u.id,
        action: 'user.invitation_accepted',
        targetType: 'User',
        targetId: u.id,
        targetLabel: u.email,
        ip: client.ip,
        userAgent: client.userAgent,
      });
      return updated;
    });
    return this.proceed(user.id, await this.pendingSteps(user), client);
  }

  async verifyEmail(token: string, client: ClientInfo): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const u = await this.tokens.consume(token, 'EMAIL_VERIFICATION', tx);
      await tx.user.update({ where: { id: u.id }, data: { emailVerifiedAt: this.now() } });
      await recordAudit(tx, {
        actorId: u.id,
        action: 'user.email_verified',
        targetType: 'User',
        targetId: u.id,
        targetLabel: u.email,
        ip: client.ip,
        userAgent: client.userAgent,
      });
    });
  }

  // ─── Sessions ───────────────────────────────────────────────────────────

  /** Exchanges a valid refresh token for a new one in the same session. */
  async refresh(refreshToken: string | undefined, client: ClientInfo): Promise<IssuedSession> {
    const rotated = await this.sessions.rotate(refreshToken, client);
    const user = await this.userAccess.loadActiveUser(rotated.userId);
    if (!user) {
      await this.sessions.revoke(rotated.sessionId, 'user_inactive');
      throw new UnauthorizedException('User not found or deactivated');
    }
    return this.sign(user, rotated);
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      select: { sessionId: true },
    });
    if (stored) await this.sessions.revoke(stored.sessionId, 'logout');
  }

  me(user: RequestUser) {
    return this.userAccess.toAuthUser(user);
  }

  /** Opens a new session for an active user and signs its first access token. */
  async issueSession(userId: string, client: ClientInfo): Promise<IssuedSession> {
    const user = await this.userAccess.loadActiveUser(userId);
    if (!user) throw new UnauthorizedException('User not found or deactivated');
    const created = await this.sessions.create(user.id, client);
    return this.sign(user, created);
  }

  private async sign(user: LoadedUser, s: CreatedSession): Promise<IssuedSession> {
    const payload: AccessTokenPayload = { sub: user.id, email: user.email, sid: s.sessionId };
    const accessToken = await this.jwt.signAsync(payload);
    return {
      accessToken,
      user: this.userAccess.toAuthUser(user),
      refreshToken: s.refreshToken,
      refreshExpiresAt: s.refreshExpiresAt,
      sessionId: s.sessionId,
    };
  }
}
