import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { AuthResponse } from '@erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessTokenPayload, LoadedUser, RequestUser } from '../../common/types/request-user';
import { ClientInfo } from '../../common/client-info';
import { hashToken } from '../iam/tokens';
import { CreatedSession, SessionsService } from './sessions.service';
import { UserAccessService } from './user-access.service';

export interface IssuedSession extends AuthResponse {
  refreshToken: string;
  refreshExpiresAt: Date;
  sessionId: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly userAccess: UserAccessService,
    private readonly sessions: SessionsService,
  ) {}

  async login(email: string, password: string, client: ClientInfo): Promise<IssuedSession> {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    // Same error for unknown email, wrong password, non-active user and a user
    // without a password yet (invited): none of them can log in.
    const valid =
      user?.status === 'ACTIVE' &&
      user.passwordHash !== null &&
      (await argon2.verify(user.passwordHash, password));
    if (!user || !valid) throw new UnauthorizedException('Invalid email or password');

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.prisma.auditLog.create({
      data: { userId: user.id, action: 'login', entity: 'User', entityId: user.id, ip: client.ip },
    });
    return this.issueSession(user.id, client);
  }

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
