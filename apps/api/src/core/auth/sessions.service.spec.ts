import { UnauthorizedException } from '@nestjs/common';
import { hashToken } from '../iam/tokens';
import { SessionsService } from './sessions.service';

function make(env: Record<string, string> = {}) {
  const prisma = {
    session: {
      create: jest.fn().mockResolvedValue({ id: 's1' }),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    refreshToken: {
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
  const config = { get: (k: string, d?: string) => env[k] ?? d };
  return { svc: new SessionsService(prisma as never, config as never), prisma };
}

const future = () => new Date(Date.now() + 60_000);

describe('SessionsService', () => {
  it('rotating a valid token returns a new one and revokes the old', async () => {
    const { svc, prisma } = make();
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt1',
      userId: 'u1',
      sessionId: 's1',
      revokedAt: null,
      expiresAt: future(),
      session: { id: 's1', revokedAt: null, expiresAt: future() },
    });

    const out = await svc.rotate('old-token', { ip: '1.1.1.1' });

    expect(prisma.refreshToken.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tokenHash: hashToken('old-token') } }),
    );
    expect(out.userId).toBe('u1');
    expect(out.sessionId).toBe('s1');
    expect(out.refreshToken).not.toBe('old-token');
    // The old token is revoked via a conditional update (no double rotation).
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'rt1', revokedAt: null } }),
    );
    const created = prisma.refreshToken.create.mock.calls[0][0].data;
    expect(created.tokenHash).toBe(hashToken(out.refreshToken));
    expect(created.sessionId).toBe('s1');
  });

  it('reusing an already-revoked token revokes the whole session and throws', async () => {
    const { svc, prisma } = make();
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt1',
      userId: 'u1',
      sessionId: 's1',
      revokedAt: new Date(),
      expiresAt: future(),
      session: { id: 's1', revokedAt: null, expiresAt: future() },
    });

    await expect(svc.rotate('reused', {})).rejects.toBeInstanceOf(UnauthorizedException);

    expect(prisma.session.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 's1', revokedAt: null },
        data: expect.objectContaining({ revokedReason: 'refresh_token_reuse' }),
      }),
    );
    const audit = prisma.auditLog.create.mock.calls[0][0].data;
    expect(audit.action).toBe('session.revoked');
    expect(audit.reason).toBe('refresh_token_reuse');
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('rejects a token whose session was revoked', async () => {
    const { svc, prisma } = make();
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt1',
      userId: 'u1',
      sessionId: 's1',
      revokedAt: null,
      expiresAt: future(),
      session: { id: 's1', revokedAt: new Date(), expiresAt: future() },
    });
    await expect(svc.rotate('t', {})).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('revokeAllForUser with exceptSessionId leaves that one', async () => {
    const { svc, prisma } = make();
    await svc.revokeAllForUser('u1', 'password_changed', undefined, 'keep');
    const where = prisma.session.updateMany.mock.calls[0][0].where;
    expect(where).toEqual({ userId: 'u1', revokedAt: null, id: { not: 'keep' } });
    expect(prisma.refreshToken.updateMany.mock.calls[0][0].where).toEqual({
      userId: 'u1',
      revokedAt: null,
      sessionId: { not: 'keep' },
    });
  });

  it('isActive is false for revoked or expired sessions', async () => {
    const { svc, prisma } = make();
    prisma.session.findUnique.mockResolvedValueOnce({ revokedAt: new Date(), expiresAt: future() });
    expect(await svc.isActive('s1')).toBe(false);
    prisma.session.findUnique.mockResolvedValueOnce({
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(await svc.isActive('s1')).toBe(false);
    prisma.session.findUnique.mockResolvedValueOnce(null);
    expect(await svc.isActive('s1')).toBe(false);
    prisma.session.findUnique.mockResolvedValueOnce({
      revokedAt: null,
      expiresAt: future(),
      lastSeenAt: new Date(),
    });
    expect(await svc.isActive('s1')).toBe(true);
  });
});
