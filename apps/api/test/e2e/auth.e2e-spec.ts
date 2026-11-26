import { INestApplication } from '@nestjs/common';
import { totpAt } from '../../src/core/iam/totp';
import {
  acceptInvite,
  activeUser,
  ADMIN,
  api,
  bearer,
  bootApp,
  createUser,
  loginAs,
  outboxToken,
  PASSWORD,
  prisma,
  totpCode,
} from './helpers';

describe('auth (e2e)', () => {
  let app: INestApplication;
  let admin: string;

  beforeAll(async () => {
    app = await bootApp();
    admin = (await loginAs(app, ADMIN.email, ADMIN.password)).token;
  });
  afterAll(async () => {
    await app.close();
  });

  it('locks after 5 failures and keeps the lock for 15 minutes', async () => {
    const u = await activeUser(app, admin);
    for (let i = 0; i < 5; i++) {
      await api(app)
        .post('/api/v1/auth/login')
        .send({ email: u.email, password: 'wrong-password-1' })
        .expect(401);
    }
    const locked = await api(app)
      .post('/api/v1/auth/login')
      .send({ email: u.email, password: PASSWORD });
    expect(locked.status).toBe(401);
    expect(locked.body.message).toBe('Invalid email or password');

    const row = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    const minutes = (row.lockedUntil!.getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(14);
    expect(minutes).toBeLessThanOrEqual(15);

    // Fast-forward past the lock.
    await prisma.user.update({
      where: { id: u.id },
      data: { lockedUntil: new Date(Date.now() - 1000) },
    });
    const ok = await api(app)
      .post('/api/v1/auth/login')
      .send({ email: u.email, password: PASSWORD });
    expect(ok.body.kind).toBe('session');
  });

  it('invite → accept → enrol MFA → login with TOTP', async () => {
    const u = await createUser(app, admin, { requireMfa: true });
    const accepted = await acceptInvite(app, u.email);
    expect(accepted.body).toMatchObject({ kind: 'challenge', challenge: 'mfa_enroll' });
    const ct = accepted.body.challengeToken;

    const start = await api(app)
      .post('/api/v1/auth/challenge/mfa-enroll/start')
      .send({ challengeToken: ct })
      .expect(200);
    const secret: string = start.body.secret;
    // Pin the 30 s step so a step boundary during the test can't turn the replay into a fresh code.
    const step = Math.floor(Date.now() / 30_000);
    const confirm = await api(app)
      .post('/api/v1/auth/challenge/mfa-enroll/confirm')
      .send({ challengeToken: ct, code: totpAt(secret, step) })
      .expect(200);
    expect(confirm.body.kind).toBe('session');
    expect(confirm.body.recoveryCodes).toHaveLength(10);

    const login = await api(app)
      .post('/api/v1/auth/login')
      .send({ email: u.email, password: PASSWORD });
    expect(login.body).toMatchObject({ kind: 'challenge', challenge: 'mfa' });
    // Same step as the enrolment code is a replay → rejected; the next step works.
    await api(app)
      .post('/api/v1/auth/challenge/mfa')
      .send({ challengeToken: login.body.challengeToken, code: totpAt(secret, step) })
      .expect(401);
    const done = await api(app)
      .post('/api/v1/auth/challenge/mfa')
      .send({ challengeToken: login.body.challengeToken, code: totpAt(secret, step + 1) })
      .expect(200);
    expect(done.body.kind).toBe('session');
  });

  it('reset link works once and ends other sessions', async () => {
    const u = await activeUser(app, admin);
    await api(app).get('/api/v1/auth/me').set(bearer(u.session.token)).expect(200);

    await api(app).post('/api/v1/auth/forgot-password').send({ email: u.email }).expect(202);
    // Sending is asynchronous on purpose (no timing oracle); wait for the outbox row.
    let token = '';
    for (let i = 0; i < 20 && !token; i++) {
      token = await outboxToken(u.email, 'password_reset').catch(() => '');
      if (!token) await new Promise((r) => setTimeout(r, 100));
    }
    const newPassword = 'Velvet-Harbor-Signal-48';
    await api(app).post('/api/v1/auth/reset-password').send({ token, newPassword }).expect(204);
    await api(app)
      .post('/api/v1/auth/reset-password')
      .send({ token, newPassword: 'Another-Long-Phrase-77' })
      .expect(400);

    await api(app).get('/api/v1/auth/me').set(bearer(u.session.token)).expect(401);
    const again = await api(app)
      .post('/api/v1/auth/login')
      .send({ email: u.email, password: newPassword });
    expect(again.body.kind).toBe('session');
  });

  it('forgot-password response is identical for unknown email', async () => {
    const u = await activeUser(app, admin);
    const known = await api(app).post('/api/v1/auth/forgot-password').send({ email: u.email });
    const unknown = await api(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'nobody-here@e2e.test' });
    expect(known.status).toBe(202);
    expect(unknown.status).toBe(202);
    expect(unknown.body).toEqual(known.body);
  });

  it('rate-limits forgot-password per email', async () => {
    const email = `limit-${Date.now()}@e2e.test`;
    for (let i = 0; i < 3; i++) {
      await api(app).post('/api/v1/auth/forgot-password').send({ email }).expect(202);
    }
    await api(app).post('/api/v1/auth/forgot-password').send({ email }).expect(429);
  });

  it('treats "  Mixed@Case " as the same account', async () => {
    const u = await activeUser(app, admin);
    const res = await api(app)
      .post('/api/v1/auth/login')
      .send({ email: `  ${u.email.toUpperCase()} `, password: PASSWORD });
    expect(res.body.kind).toBe('session');
  });
});
