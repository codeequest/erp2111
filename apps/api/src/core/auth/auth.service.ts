import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { AuthResponse } from '@erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessTokenPayload, RequestUser } from '../../common/types/request-user';
import { UserAccessService } from './user-access.service';

export interface ClientInfo {
  ip?: string;
  userAgent?: string;
}

export interface IssuedSession extends AuthResponse {
  refreshToken: string;
  refreshExpiresAt: Date;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly userAccess: UserAccessService,
  ) {}

  async login(email: string, password: string, client: ClientInfo): Promise<IssuedSession> {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    // Same error for unknown email, wrong password and deactivated user.
    const valid = user?.isActive && (await argon2.verify(user.passwordHash, password));
    if (!user || !valid) throw new UnauthorizedException('Invalid email or password');

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.prisma.auditLog.create({
      data: { userId: user.id, action: 'login', entity: 'User', entityId: user.id, ip: client.ip },
    });
    return this.issueSession(user.id, client);
  }

  /** Exchanges a valid refresh token for a new session (the old token is revoked). */
  async refresh(refreshToken: string | undefined, client: ClientInfo): Promise<IssuedSession> {
    if (!refreshToken) throw new UnauthorizedException('Missing refresh token');

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hash(refreshToken) },
    });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expired, please log in again');
    }
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    return this.issueSession(stored.userId, client);
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hash(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  me(user: RequestUser) {
    return this.userAccess.toAuthUser(user);
  }

  private async issueSession(userId: string, client: ClientInfo): Promise<IssuedSession> {
    const user = await this.userAccess.loadActiveUser(userId);
    if (!user) throw new UnauthorizedException('User not found or deactivated');

    const payload: AccessTokenPayload = { sub: user.id, email: user.email };
    const accessToken = await this.jwt.signAsync(payload);

    const refreshToken = randomBytes(48).toString('base64url');
    const days = Number(this.config.get('REFRESH_TOKEN_TTL_DAYS', 7));
    const refreshExpiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hash(refreshToken),
        expiresAt: refreshExpiresAt,
        ip: client.ip,
        userAgent: client.userAgent,
      },
    });

    return { accessToken, user: this.userAccess.toAuthUser(user), refreshToken, refreshExpiresAt };
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
