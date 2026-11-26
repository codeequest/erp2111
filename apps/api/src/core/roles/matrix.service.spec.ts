import { ConflictException } from '@nestjs/common';
import { ALL_PERMISSIONS, PermissionCode } from '@erp/shared';
import { PolicyViolation } from '../iam/access-policy';
import { MatrixService } from './matrix.service';

type R = { id: string; name: string; type: 'SYSTEM' | 'CUSTOM'; isProtected: boolean; version: number; perms: string[] };

function setup(roles: R[], actorRoleIds: string[] = []) {
  const toRow = (r: R) => ({
    ...r,
    color: 'slate',
    permissions: r.perms.map((code) => ({ permission: { id: `p-${code}`, code } })),
  });
  const tx = {
    $executeRaw: jest.fn(async () => 0),
    role: {
      findMany: jest.fn(async ({ where }: { where?: { id?: { in: string[] } } } = {}) =>
        roles.filter((r) => !where?.id || where.id.in.includes(r.id)).map(toRow),
      ),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    permission: {
      findMany: jest.fn(async () => ALL_PERMISSIONS.map((code) => ({ id: `p-${code}`, code }))),
    },
    rolePermission: {
      deleteMany: jest.fn(async () => ({ count: 1 })),
      createMany: jest.fn(async () => ({ count: 1 })),
    },
    userRole: {
      findMany: jest.fn(async () =>
        actorRoleIds.map((roleId) => ({
          roleId,
          expiresAt: null,
          role: toRow(roles.find((r) => r.id === roleId)!),
        })),
      ),
    },
    auditLog: { create: jest.fn(async () => ({})) },
  };
  const prisma = { $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)) };
  const svc = new MatrixService(prisma as never);
  // The matrix read after a successful save is not under test.
  jest.spyOn(svc, 'get').mockResolvedValue({ modules: [], roles: [] });
  return { svc, tx };
}

const actor = (perms: string[]) => ({
  id: 'actor',
  email: 'a@x.com',
  fullName: 'A',
  roles: [],
  permissions: new Set(perms as PermissionCode[]),
  sessionId: 's',
});

const ALL = ALL_PERMISSIONS as string[];

describe('MatrixService.save', () => {
  it('one stale version → 409 and nothing is written', async () => {
    const { svc, tx } = setup([
      { id: 'r1', name: 'Sales', type: 'CUSTOM', isProtected: false, version: 3, perms: [] },
      { id: 'r2', name: 'Stock', type: 'CUSTOM', isProtected: false, version: 1, perms: [] },
    ]);
    const err = await svc
      .save(
        actor(ALL),
        {
          roles: [
            { id: 'r1', version: 3, permissions: ['sales.order.read'] },
            { id: 'r2', version: 0, permissions: ['inventory.product.read'] },
          ],
        },
        {},
      )
      .catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect((err as Error).message).toBe(
      'This role was changed by someone else. Reload to see the latest version.',
    );
    expect(tx.rolePermission.createMany).not.toHaveBeenCalled();
    expect(tx.rolePermission.deleteMany).not.toHaveBeenCalled();
  });

  it('touching the Admin role → PROTECTED_ROLE', async () => {
    const { svc } = setup([
      { id: 'adm', name: 'Admin', type: 'SYSTEM', isProtected: true, version: 1, perms: ALL },
    ]);
    const err = await svc
      .save(actor(ALL), { roles: [{ id: 'adm', version: 1, permissions: ['sales.order.read'] }] }, {})
      .catch((e: PolicyViolation) => e);
    expect((err as PolicyViolation).code).toBe('PROTECTED_ROLE');
  });

  it('removing admin.permission.manage from a role the actor depends on → SELF_LOCKOUT', async () => {
    const perms = ['admin.role.view', 'admin.permission.manage'];
    const { svc, tx } = setup(
      [{ id: 'sec', name: 'Security', type: 'CUSTOM', isProtected: false, version: 2, perms }],
      ['sec'],
    );
    const err = await svc
      .save(actor(perms), { roles: [{ id: 'sec', version: 2, permissions: ['admin.role.view'] }] }, {})
      .catch((e: PolicyViolation) => e);
    expect((err as PolicyViolation).code).toBe('SELF_LOCKOUT');
    expect(tx.rolePermission.deleteMany).not.toHaveBeenCalled();
  });

  it('granting a permission the actor lacks → ESCALATION', async () => {
    const { svc } = setup([
      { id: 'r1', name: 'Sales', type: 'CUSTOM', isProtected: false, version: 1, perms: [] },
    ]);
    const err = await svc
      .save(
        actor(['admin.permission.manage']),
        { roles: [{ id: 'r1', version: 1, permissions: ['sales.order.read'] }] },
        {},
      )
      .catch((e: PolicyViolation) => e);
    expect((err as PolicyViolation).code).toBe('ESCALATION');
  });

  it('applies a valid change, bumps the version and audits', async () => {
    const { svc, tx } = setup([
      { id: 'r1', name: 'Sales', type: 'CUSTOM', isProtected: false, version: 4, perms: ['sales.order.read'] },
    ]);
    await svc.save(
      actor(ALL),
      { roles: [{ id: 'r1', version: 4, permissions: ['sales.order.write'] }] },
      {},
    );
    expect(tx.rolePermission.createMany).toHaveBeenCalledWith({
      data: [{ roleId: 'r1', permissionId: 'p-sales.order.write' }],
    });
    expect(tx.role.updateMany).toHaveBeenCalledWith({
      where: { id: 'r1', version: 4 },
      data: { version: { increment: 1 } },
    });
    const actions = (tx.auditLog.create.mock.calls as unknown as [{ data: { action: string } }][]).map(
      (c) => c[0].data.action,
    );
    expect(actions).toEqual(expect.arrayContaining(['role.permissions_added', 'role.permissions_removed']));
  });
});
