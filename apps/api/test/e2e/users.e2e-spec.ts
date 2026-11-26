import { INestApplication } from '@nestjs/common';
import {
  activeUser,
  ADMIN,
  api,
  bearer,
  bootApp,
  createUser,
  loginAs,
  outboxToken,
  prisma,
  roleId,
  Session,
} from './helpers';

describe('users (e2e)', () => {
  let app: INestApplication;
  let admin: Session;

  beforeAll(async () => {
    app = await bootApp();
    admin = await loginAs(app, ADMIN.email, ADMIN.password);
  });
  afterAll(async () => {
    await app.close();
  });

  it('deactivate invalidates a live access token on the next request', async () => {
    const u = await activeUser(app, admin.token);
    await api(app).get('/api/v1/auth/me').set(bearer(u.session.token)).expect(200);
    await api(app)
      .post(`/api/v1/users/${u.id}/deactivate`)
      .set(bearer(admin.token))
      .send({ reason: 'e2e' })
      .expect(200);
    await api(app).get('/api/v1/auth/me').set(bearer(u.session.token)).expect(401);
  });

  it("deactivated user's outstanding reset link is rejected", async () => {
    const u = await activeUser(app, admin.token);
    await api(app)
      .post(`/api/v1/users/${u.id}/reset-password`)
      .set(bearer(admin.token))
      .expect(204);
    const token = await outboxToken(u.email, 'password_reset');
    await api(app)
      .post(`/api/v1/users/${u.id}/deactivate`)
      .set(bearer(admin.token))
      .send({})
      .expect(200);
    const res = await api(app)
      .post('/api/v1/auth/reset-password')
      .send({ token, newPassword: 'Quiet-Meadow-Engine-61' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('This link is invalid or has expired.');
  });

  it('cannot deactivate self', async () => {
    const res = await api(app)
      .post(`/api/v1/users/${admin.userId}/deactivate`)
      .set(bearer(admin.token))
      .send({});
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('SELF_MODIFICATION');
  });

  it('last admin survives concurrent removals', async () => {
    const adminRole = await roleId('Admin');
    // Earlier runs may have left other admins: deactivate them so exactly A and B remain.
    await prisma.user.updateMany({
      where: { id: { not: admin.userId }, roles: { some: { roleId: adminRole } } },
      data: { status: 'INACTIVE' },
    });
    const b = await activeUser(app, admin.token, { roles: [{ roleId: adminRole }] });
    // Leave exactly two admins: A (seeded) and B.
    const [ab, ba] = await Promise.all([
      api(app).post(`/api/v1/users/${b.id}/deactivate`).set(bearer(admin.token)).send({}),
      api(app)
        .post(`/api/v1/users/${admin.userId}/deactivate`)
        .set(bearer(b.session.token))
        .send({}),
    ]);
    const statuses = [ab.status, ba.status].sort();
    // Exactly one wins. The loser gets 409 (last admin) — or 401 when its own account
    // was already deactivated before its request was authenticated.
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.find((s) => s !== 200)).toEqual(expect.any(Number));
    expect([401, 409]).toContain(statuses.find((s) => s !== 200));
    const admins = await prisma.user.count({
      where: {
        status: 'ACTIVE',
        roles: { some: { expiresAt: null, role: { isProtected: true } } },
      },
    });
    expect(admins).toBeGreaterThanOrEqual(1);
    // Put the seeded admin back for the following tests if B won.
    if (ba.status === 200) {
      await prisma.user.update({
        where: { id: admin.userId },
        data: { status: 'ACTIVE', deactivatedAt: null },
      });
      admin = await loginAs(app, ADMIN.email, ADMIN.password);
    }
  });

  it('escalation via crafted PUT /users/:id/roles is 403', async () => {
    const tpl = await api(app)
      .post('/api/v1/roles')
      .set(bearer(admin.token))
      .send({ name: `User managers ${Date.now()}`, color: 'blue', templateKey: 'user-manager' })
      .expect(201);
    const manager = await activeUser(app, admin.token, { roles: [{ roleId: tpl.body.id }] });
    const victim = await createUser(app, admin.token);
    const res = await api(app)
      .put(`/api/v1/users/${victim.id}/roles`)
      .set(bearer(manager.session.token))
      .send({ roles: [{ roleId: await roleId('Admin') }] });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ESCALATION');
  });

  it('duplicate email with different case is 409', async () => {
    const u = await createUser(app, admin.token);
    const res = await api(app)
      .post('/api/v1/users')
      .set(bearer(admin.token))
      .send({ firstName: 'Dup', lastName: 'Licate', email: `  ${u.email.toUpperCase()} ` });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('A user with this email already exists.');
  });

  it('bulk deactivate reports self and last-admin as failed and continues', async () => {
    const u = await activeUser(app, admin.token);
    const res = await api(app)
      .post('/api/v1/users/bulk')
      .set(bearer(admin.token))
      .send({ action: 'deactivate', userIds: [admin.userId, u.id] })
      .expect(200);
    const byId = new Map(res.body.results.map((r: { userId: string }) => [r.userId, r]));
    expect(byId.get(admin.userId)).toMatchObject({ result: 'failed' });
    expect(byId.get(u.id)).toMatchObject({ result: 'updated' });
  });

  it('no DELETE /users/:id route (404)', async () => {
    const u = await createUser(app, admin.token);
    await api(app).delete(`/api/v1/users/${u.id}`).set(bearer(admin.token)).expect(404);
  });
});
