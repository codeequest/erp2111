import { INestApplication } from '@nestjs/common';
import { activeUser, ADMIN, api, bearer, bootApp, loginAs, prisma, Session } from './helpers';

describe('audit (e2e)', () => {
  let app: INestApplication;
  let admin: Session;

  beforeAll(async () => {
    app = await bootApp();
    admin = await loginAs(app, ADMIN.email, ADMIN.password);
  });
  afterAll(async () => {
    await app.close();
  });

  it('every admin write above produced an audit row with actor, target and result', async () => {
    const u = await activeUser(app, admin.token);
    await api(app)
      .post(`/api/v1/users/${u.id}/deactivate`)
      .set(bearer(admin.token))
      .send({ reason: 'audit e2e' })
      .expect(200);
    for (const action of ['user.created', 'user.invitation_sent', 'user.deactivated']) {
      const row = await prisma.auditLog.findFirst({ where: { action, entityId: u.id } });
      expect(row).toMatchObject({ userId: admin.userId, entity: 'User', result: 'SUCCESS' });
    }
    const deactivated = await prisma.auditLog.findFirst({
      where: { action: 'user.deactivated', entityId: u.id },
    });
    expect(deactivated?.reason).toBe('audit e2e');
  });

  it('audit rows cannot be updated or deleted (DB error)', async () => {
    const row = await prisma.auditLog.findFirstOrThrow();
    await expect(
      prisma.auditLog.update({ where: { id: row.id }, data: { action: 'tampered' } }),
    ).rejects.toThrow();
    await expect(prisma.auditLog.delete({ where: { id: row.id } })).rejects.toThrow();
  });

  it('GET /audit-logs requires admin.audit.read', async () => {
    const u = await activeUser(app, admin.token);
    await api(app).get('/api/v1/audit-logs').set(bearer(u.session.token)).expect(403);
    const ok = await api(app)
      .get('/api/v1/audit-logs?result=DENIED')
      .set(bearer(admin.token))
      .expect(200);
    // The refusal above was itself recorded.
    expect(
      ok.body.items.some(
        (e: { actorId: string; action: string }) =>
          e.actorId === u.id && e.action === 'access.denied',
      ),
    ).toBe(true);
  });
});
