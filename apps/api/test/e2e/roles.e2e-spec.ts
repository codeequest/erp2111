import { INestApplication } from '@nestjs/common';
import { activeUser, ADMIN, api, bearer, bootApp, loginAs, prisma, roleId } from './helpers';

describe('roles (e2e)', () => {
  let app: INestApplication;
  let admin: string;

  const newRole = async (permissions: string[] = []) =>
    (
      await api(app)
        .post('/api/v1/roles')
        .set(bearer(admin))
        .send({
          name: `Role ${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
          color: 'emerald',
          permissions,
        })
        .expect(201)
    ).body;

  beforeAll(async () => {
    app = await bootApp();
    admin = (await loginAs(app, ADMIN.email, ADMIN.password)).token;
  });
  afterAll(async () => {
    await app.close();
  });

  it('Admin role permissions cannot be changed (409)', async () => {
    const id = await roleId('Admin');
    const r = await api(app).get(`/api/v1/roles/${id}`).set(bearer(admin)).expect(200);
    const res = await api(app)
      .patch(`/api/v1/roles/${id}`)
      .set(bearer(admin))
      .send({ version: r.body.version, permissions: [] });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PROTECTED_ROLE');
  });

  it('system role cannot be deleted (409)', async () => {
    const res = await api(app)
      .delete(`/api/v1/roles/${await roleId('Viewer')}`)
      .set(bearer(admin));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('SYSTEM_ROLE');
  });

  it('custom role delete requires reassignment and leaves no dangling user_roles', async () => {
    const role = await newRole(['dashboard.summary.view']);
    const u = await activeUser(app, admin, { roles: [{ roleId: role.id }] });
    await api(app).delete(`/api/v1/roles/${role.id}`).set(bearer(admin)).expect(409);
    const viewer = await roleId('Viewer');
    await api(app)
      .delete(`/api/v1/roles/${role.id}?reassignToRoleId=${viewer}`)
      .set(bearer(admin))
      .expect(204);
    expect(await prisma.userRole.count({ where: { roleId: role.id } })).toBe(0);
    expect(await prisma.userRole.count({ where: { userId: u.id, roleId: viewer } })).toBe(1);
  });

  it('matrix save with stale version is 409 and changes nothing', async () => {
    const a = await newRole([]);
    const b = await newRole([]);
    const res = await api(app)
      .put('/api/v1/permissions/matrix')
      .set(bearer(admin))
      .send({
        roles: [
          { id: a.id, version: a.version, permissions: ['sales.order.read'] },
          { id: b.id, version: b.version + 5, permissions: ['sales.order.read'] },
        ],
      });
    expect(res.status).toBe(409);
    expect(await prisma.rolePermission.count({ where: { roleId: { in: [a.id, b.id] } } })).toBe(0);
  });

  it('editing a role applies to its users on their next request', async () => {
    const role = await newRole(['dashboard.summary.view']);
    const u = await activeUser(app, admin, { roles: [{ roleId: role.id }] });
    await api(app).get('/api/v1/users').set(bearer(u.session.token)).expect(403);
    await api(app)
      .patch(`/api/v1/roles/${role.id}`)
      .set(bearer(admin))
      .send({ version: role.version, permissions: ['dashboard.summary.view', 'admin.user.view'] })
      .expect(200);
    await api(app).get('/api/v1/users').set(bearer(u.session.token)).expect(200);
  });

  it('expired temporary assignment grants nothing', async () => {
    const role = await newRole(['admin.user.view']);
    const soon = new Date(Date.now() + 3_600_000).toISOString();
    const u = await activeUser(app, admin, { roles: [{ roleId: role.id, expiresAt: soon }] });
    await api(app).get('/api/v1/users').set(bearer(u.session.token)).expect(200);
    // Time passes: no background job needed, the check is at request time.
    await prisma.userRole.updateMany({
      where: { userId: u.id, roleId: role.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await api(app).get('/api/v1/users').set(bearer(u.session.token)).expect(403);
  });
});
