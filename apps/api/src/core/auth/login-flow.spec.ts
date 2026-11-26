import { HttpException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { SENSITIVE_PERMISSIONS } from '@erp/shared';
import { RateLimiter } from '../../common/rate-limit/rate-limiter';
import { AuthService, LoginOutcome } from './auth.service';
import { UserAccessService } from './user-access.service';

const PASSWORD = 'Correct-Horse-Battery-9';
const POLICY = {
  passwordMinLength: 12,
  passwordMaxLength: 128,
  blockBreachedPasswords: true,
  breachApiCheck: false,
  lockoutThreshold: 5,
  lockoutMinutes: 15,
  invitationTtlHours: 72,
  resetTtlMinutes: 60,
  requireMfaForPrivileged: true,
  accessReviewDays: 90,
  dormantDays: 60,
  revokeSessionsOnPasswordReset: true,
};

type FakeUser = Record<string, unknown> & { id: string; email: string; perms?: string[] };

function user(over: Partial<FakeUser> & { id: string; email: string }, hash: string): FakeUser {
  return {
    username: null,
    firstName: 'Test',
    lastName: 'User',
    fullName: 'Test User',
    status: 'ACTIVE',
    passwordHash: hash,
    mustChangePassword: false,
    mfaRequired: false,
    failedLoginCount: 0,
    lockedUntil: null,
    perms: [],
    ...over,
  };
}

function setup(users: FakeUser[], enrolled = new Set<string>()) {
  const db = {
    user: {
      findUnique: jest.fn(async ({ where }: { where: { id?: string; email?: string } }) => {
        const u = users.find((x) => (where.id ? x.id === where.id : x.email === where.email));
        return u ? { ...u } : null;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: object }) => {
        const u = users.find((x) => x.id === where.id)!;
        for (const [k, v] of Object.entries(data)) {
          u[k] =
            v && typeof v === 'object' && 'increment' in v
              ? (u[k] as number) + (v as { increment: number }).increment
              : v;
        }
        return { ...u };
      }),
    },
    auditLog: { create: jest.fn(async (_args: unknown) => ({})) },
    $transaction: jest.fn(),
  };
  db.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(db));

  const userAccess = {
    loadActiveUser: jest.fn(async (id: string) => {
      const u = users.find((x) => x.id === id);
      if (!u || u.status !== 'ACTIVE') return null;
      return {
        id: u.id,
        email: u.email,
        fullName: u.fullName as string,
        roles: [],
        permissions: new Set(u.perms ?? []),
      };
    }),
    toAuthUser: UserAccessService.prototype.toAuthUser,
  };
  const sessions = {
    create: jest.fn(async () => ({
      sessionId: 's1',
      refreshToken: 'r1',
      refreshExpiresAt: new Date(Date.now() + 1e6),
    })),
    revokeAllForUser: jest.fn(async () => 0),
  };
  const mfa = {
    isEnabled: jest.fn(async (id: string) => enrolled.has(id)),
    verify: jest.fn(async (_id: string, input: { code?: string }) => input.code === '123456'),
    startEnrollment: jest.fn(async () => ({ otpauthUri: 'otpauth://x', qrDataUrl: 'data:', secret: 'S' })),
    confirmEnrollment: jest.fn(async () => ['aaaaa-bbbbb']),
  };
  const tokens = { sendPasswordReset: jest.fn(async () => undefined) };
  const mail = { send: jest.fn(async () => undefined) };
  const jwt = new JwtService({ secret: 'test-secret', signOptions: { expiresIn: '15m' } });

  const svc = new AuthService(
    db as never,
    jwt,
    { get: (_k: string, d?: string) => d } as never,
    userAccess as never,
    sessions as never,
    { get: async () => POLICY } as never,
    mfa as never,
    tokens as never,
    mail as never,
    new RateLimiter(),
  );
  return { svc, db, sessions, mfa, tokens };
}

const challengeOf = (o: LoginOutcome) => {
  if (o.kind !== 'challenge') throw new Error(`expected a challenge, got ${o.kind}`);
  return o;
};

describe('login flow', () => {
  let hash: string;
  beforeAll(async () => {
    hash = await argon2.hash(PASSWORD);
  });

  it('normalises the email: "  Admin@ERP.local " logs in as admin@erp.local', async () => {
    const { svc } = setup([user({ id: 'u1', email: 'admin@erp.local' }, hash)]);
    const out = await svc.login('  Admin@ERP.local ', PASSWORD, {});
    expect(out.kind).toBe('session');
    if (out.kind === 'session') expect(out.session.user.email).toBe('admin@erp.local');
  });

  it('locks after 5 wrong passwords; correct password refused until lockout ends', async () => {
    const users = [user({ id: 'u1', email: 'bob@x.com' }, hash)];
    const { svc, db } = setup(users);
    let now = new Date('2026-01-01T10:00:00Z');
    jest.spyOn(svc as unknown as { now: () => Date }, 'now').mockImplementation(() => now);

    for (let i = 0; i < 5; i++) {
      await expect(svc.login('bob@x.com', 'wrong-password', {})).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    }
    expect(users[0].lockedUntil).toBeInstanceOf(Date);
    const err = await svc.login('bob@x.com', PASSWORD, {}).catch((e) => e);
    expect(err).toBeInstanceOf(UnauthorizedException);
    expect((err as UnauthorizedException).message).toBe('Invalid email or password');
    // Locked attempts don't increment the counter.
    expect(users[0].failedLoginCount).toBe(5);
    expect(
      (db.auditLog.create.mock.calls as unknown as [{ data: { action: string } }][]).some(
        (c) => c[0].data.action === 'user.locked',
      ),
    ).toBe(true);

    now = new Date(now.getTime() + 15 * 60_000 + 1000);
    const out = await svc.login('bob@x.com', PASSWORD, {});
    expect(out.kind).toBe('session');
    expect(users[0].failedLoginCount).toBe(0);
    expect(users[0].lockedUntil).toBeNull();
  });

  it('unknown email, wrong password and inactive user get the same error', async () => {
    const { svc } = setup([
      user({ id: 'u1', email: 'a@x.com' }, hash),
      user({ id: 'u2', email: 'off@x.com', status: 'INACTIVE' }, hash),
    ]);
    const msgs = await Promise.all([
      svc.login('nobody@x.com', PASSWORD, {}).catch((e: Error) => e.message),
      svc.login('a@x.com', 'nope-nope-nope', {}).catch((e: Error) => e.message),
      svc.login('off@x.com', PASSWORD, {}).catch((e: Error) => e.message),
    ]);
    expect(new Set(msgs)).toEqual(new Set(['Invalid email or password']));
  });

  it('MFA user gets an mfa challenge; 5 wrong codes exhaust it (429)', async () => {
    const { svc } = setup([user({ id: 'u1', email: 'm@x.com' }, hash)], new Set(['u1']));
    const c = challengeOf(await svc.login('m@x.com', PASSWORD, {}));
    expect(c.challenge).toBe('mfa');

    for (let i = 0; i < 5; i++) {
      await expect(svc.challengeMfa(c.challengeToken, { code: '000000' }, {})).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    }
    const err = await svc.challengeMfa(c.challengeToken, { code: '123456' }, {}).catch((e) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(429);
  });

  it('a correct MFA code completes the login', async () => {
    const { svc, sessions } = setup([user({ id: 'u1', email: 'm@x.com' }, hash)], new Set(['u1']));
    const c = challengeOf(await svc.login('m@x.com', PASSWORD, {}));
    expect(sessions.create).not.toHaveBeenCalled();
    const out = await svc.challengeMfa(c.challengeToken, { code: '123456' }, {});
    expect(out.kind).toBe('session');
    expect(sessions.create).toHaveBeenCalledTimes(1);
  });

  it('a challenge token is never accepted for another step', async () => {
    const { svc } = setup([user({ id: 'u1', email: 'm@x.com' }, hash)], new Set(['u1']));
    const c = challengeOf(await svc.login('m@x.com', PASSWORD, {}));
    await expect(
      svc.challengePassword(c.challengeToken, 'Another-Strong-Pass-77', {}),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('privileged user without MFA must enrol; no session until confirm', async () => {
    const sensitive = [...SENSITIVE_PERMISSIONS][0];
    const { svc, sessions, mfa } = setup([
      user({ id: 'u1', email: 'p@x.com', perms: [sensitive] }, hash),
    ]);
    const c = challengeOf(await svc.login('p@x.com', PASSWORD, {}));
    expect(c.challenge).toBe('mfa_enroll');

    await svc.challengeMfaEnrollStart(c.challengeToken);
    expect(mfa.startEnrollment).toHaveBeenCalledWith('u1');
    expect(sessions.create).not.toHaveBeenCalled();

    const out = await svc.challengeMfaEnrollConfirm(c.challengeToken, '123456', {});
    expect(out.outcome.kind).toBe('session');
    expect(out.recoveryCodes).toEqual(['aaaaa-bbbbb']);
    expect(sessions.create).toHaveBeenCalledTimes(1);
  });

  it('mfaRequired on a non-privileged user also forces enrolment', async () => {
    const { svc } = setup([user({ id: 'u1', email: 'r@x.com', mfaRequired: true }, hash)]);
    expect(challengeOf(await svc.login('r@x.com', PASSWORD, {})).challenge).toBe('mfa_enroll');
  });

  it('mustChangePassword → password_change, then mfa when enrolled (steps chain)', async () => {
    const users = [user({ id: 'u1', email: 'c@x.com', mustChangePassword: true }, hash)];
    const { svc } = setup(users, new Set(['u1']));
    const c1 = challengeOf(await svc.login('c@x.com', PASSWORD, {}));
    expect(c1.challenge).toBe('password_change');

    const c2 = challengeOf(await svc.challengePassword(c1.challengeToken, 'Brand-New-Secret-42', {}));
    expect(c2.challenge).toBe('mfa');
    expect(users[0].mustChangePassword).toBe(false);
    expect(await argon2.verify(users[0].passwordHash as string, 'Brand-New-Secret-42')).toBe(true);

    const out = await svc.challengeMfa(c2.challengeToken, { code: '123456' }, {});
    expect(out.kind).toBe('session');
  });

  it('password challenge rejects a weak password', async () => {
    const { svc } = setup([user({ id: 'u1', email: 'c@x.com', mustChangePassword: true }, hash)]);
    const c = challengeOf(await svc.login('c@x.com', PASSWORD, {}));
    await expect(svc.challengePassword(c.challengeToken, 'short', {})).rejects.toMatchObject({
      status: 400,
    });
  });

  it('forgot-password returns the same body for unknown and known emails', async () => {
    const { svc, tokens } = setup([user({ id: 'u1', email: 'k@x.com' }, hash)]);
    const a = await svc.forgotPassword('nobody@x.com', {});
    const b = await svc.forgotPassword('  K@X.com ', {});
    expect(a).toEqual({ ok: true });
    expect(b).toEqual(a);
    expect(tokens.sendPasswordReset).toHaveBeenCalledTimes(1);
  });
});
