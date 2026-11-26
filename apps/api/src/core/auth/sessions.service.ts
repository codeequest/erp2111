import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { SessionInfo } from '@erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { recordAudit } from '../../common/audit';
import { ClientInfo } from '../../common/client-info';
import { hashToken, newToken } from '../iam/tokens';

type Tx = Prisma.TransactionClient;

export interface CreatedSession {
  sessionId: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export interface RotatedSession extends CreatedSession {
  userId: string;
}

const LAST_SEEN_THROTTLE_MS = 60_000;

/**
 * Server-side sessions. A session survives refresh-token rotation; revoking it
 * ends every access token bound to it on the next request (guard check).
 */
@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private ttlMs(): number {
    return Number(this.config.get('REFRESH_TOKEN_TTL_DAYS', '7')) * 24 * 60 * 60 * 1000;
  }

  /** Opens a session and its first refresh token atomically. */
  async create(userId: string, client: ClientInfo, tx?: Tx): Promise<CreatedSession> {
    const run = async (db: Tx) => {
      const refreshExpiresAt = new Date(Date.now() + this.ttlMs());
      const session = await db.session.create({
        data: { userId, expiresAt: refreshExpiresAt, ip: client.ip, userAgent: client.userAgent },
      });
      const { token, hash } = newToken();
      await db.refreshToken.create({
        data: {
          userId,
          sessionId: session.id,
          tokenHash: hash,
          expiresAt: refreshExpiresAt,
          ip: client.ip,
          userAgent: client.userAgent,
        },
      });
      return { sessionId: session.id, refreshToken: token, refreshExpiresAt };
    };
    return tx ? run(tx) : this.prisma.$transaction(run);
  }

  /** Exchanges a refresh token for a new one in the same session. Reuse kills the session. */
  async rotate(refreshToken: string | undefined, client: ClientInfo): Promise<RotatedSession> {
    const expired = () => new UnauthorizedException('Session expired, please log in again');
    if (!refreshToken) throw new UnauthorizedException('Missing refresh token');

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      include: { session: true },
    });
    const now = new Date();
    if (!stored) throw expired();

    if (stored.revokedAt) {
      // A rotated-away token came back: it was stolen or replayed. End the session.
      await this.prisma.$transaction(async (tx) => {
        const res = await tx.session.updateMany({
          where: { id: stored.sessionId, revokedAt: null },
          data: { revokedAt: now, revokedReason: 'refresh_token_reuse' },
        });
        await tx.refreshToken.updateMany({
          where: { sessionId: stored.sessionId, revokedAt: null },
          data: { revokedAt: now },
        });
        if (res.count > 0) {
          await recordAudit(tx, {
            actorId: null,
            action: 'session.revoked',
            targetType: 'User',
            targetId: stored.userId,
            reason: 'refresh_token_reuse',
            ip: client.ip,
            userAgent: client.userAgent,
          });
        }
      });
      throw expired();
    }

    if (stored.expiresAt < now || stored.session.revokedAt || stored.session.expiresAt < now) {
      throw expired();
    }

    return this.prisma.$transaction(async (tx) => {
      // Conditional revoke: two concurrent refreshes with the same token → one wins.
      const res = await tx.refreshToken.updateMany({
        where: { id: stored.id, revokedAt: null },
        data: { revokedAt: now },
      });
      if (res.count === 0) throw expired();

      const refreshExpiresAt = new Date(now.getTime() + this.ttlMs());
      await tx.session.update({
        where: { id: stored.sessionId },
        data: { lastSeenAt: now, expiresAt: refreshExpiresAt },
      });
      const { token, hash } = newToken();
      await tx.refreshToken.create({
        data: {
          userId: stored.userId,
          sessionId: stored.sessionId,
          tokenHash: hash,
          expiresAt: refreshExpiresAt,
          ip: client.ip,
          userAgent: client.userAgent,
        },
      });
      return {
        userId: stored.userId,
        sessionId: stored.sessionId,
        refreshToken: token,
        refreshExpiresAt,
      };
    });
  }

  /** True when the session exists, is not revoked and not expired. Bumps last_seen_at (≤ 1/min). */
  async isActive(sessionId: string): Promise<boolean> {
    const s = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { revokedAt: true, expiresAt: true, lastSeenAt: true },
    });
    const now = Date.now();
    if (!s || s.revokedAt || s.expiresAt.getTime() < now) return false;
    if (!s.lastSeenAt || now - s.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS) {
      await this.prisma.session
        .update({ where: { id: sessionId }, data: { lastSeenAt: new Date(now) } })
        .catch(() => undefined);
    }
    return true;
  }

  /** Session owner (for ownership checks), or null. */
  async ownerOf(sessionId: string): Promise<string | null> {
    const s = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { userId: true },
    });
    return s?.userId ?? null;
  }

  async revoke(sessionId: string, reason: string, tx?: Tx): Promise<boolean> {
    const db = tx ?? this.prisma;
    const now = new Date();
    const res = await db.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: now, revokedReason: reason },
    });
    await db.refreshToken.updateMany({
      where: { sessionId, revokedAt: null },
      data: { revokedAt: now },
    });
    return res.count > 0;
  }

  /** Revokes every live session of the user (optionally keeping one). Returns how many ended. */
  async revokeAllForUser(
    userId: string,
    reason: string,
    tx?: Tx,
    exceptSessionId?: string,
  ): Promise<number> {
    const db = tx ?? this.prisma;
    const now = new Date();
    const res = await db.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      data: { revokedAt: now, revokedReason: reason },
    });
    await db.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptSessionId ? { sessionId: { not: exceptSessionId } } : {}),
      },
      data: { revokedAt: now },
    });
    return res.count;
  }

  /** Live sessions, most recently seen first. */
  async listForUser(userId: string, currentSessionId?: string): Promise<SessionInfo[]> {
    const rows = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: 'desc' },
    });
    return rows.map((s) => ({
      id: s.id,
      createdAt: s.createdAt.toISOString(),
      lastSeenAt: s.lastSeenAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      ip: s.ip,
      userAgent: s.userAgent,
      current: s.id === currentSessionId,
    }));
  }
}
