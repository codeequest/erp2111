import { INestApplication } from '@nestjs/common';
import {
  acceptInvite,
  activeUser,
  ADMIN,
  api,
  bearer,
  bootApp,
  createUser,
  loginAs,
  PASSWORD,
  totpCode,
} from './helpers';

describe('account (e2e)', () => {
  let app: INestApplication;
  let admin: string;

  beforeAll(async () => {
    app = await bootApp();
    admin = (await loginAs(app, ADMIN.email, ADMIN.password)).token;
  });
  afterAll(async () => {
    await app.close();
  });

  it('disable MFA is refused when MFA is required', async () => {
    const u = await createUser(app, admin, { requireMfa: true });
    const accepted = await acceptInvite(app, u.email);
    const ct = accepted.body.challengeToken;
    const { body } = await api(app)
      .post('/api/v1/auth/challenge/mfa-enroll/start')
      .send({ challengeToken: ct });
    const done = await api(app)
      .post('/api/v1/auth/challenge/mfa-enroll/confirm')
      .send({ challengeToken: ct, code: totpCode(body.secret) });
    const token = done.body.accessToken;

    const res = await api(app)
      .delete('/api/v1/account/mfa')
      .set(bearer(token))
      .send({ code: totpCode(body.secret, 1) });
    expect(res.status).toBe(409);
    const sec = await api(app).get('/api/v1/account/security').set(bearer(token)).expect(200);
    expect(sec.body).toMatchObject({ mfaEnabled: true, mfaRequired: true });
  });

  it('change password revokes other sessions', async () => {
    const u = await activeUser(app, admin);
    const other = await loginAs(app, u.email);
    const newPassword = 'Granite-Willow-Comet-27';
    await api(app)
      .post('/api/v1/account/password')
      .set(bearer(u.session.token))
      .send({ currentPassword: PASSWORD, newPassword })
      .expect(204);
    await api(app).get('/api/v1/auth/me').set(bearer(u.session.token)).expect(200);
    await api(app).get('/api/v1/auth/me').set(bearer(other.token)).expect(401);
  });
});
