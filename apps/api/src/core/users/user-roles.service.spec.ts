import { PermissionCode, SENSITIVE_PERMISSIONS } from '@erp/shared';
import { PolicyViolation } from '../iam/access-policy';
import { UserRolesService } from './user-roles.service';

const SENSITIVE = [...SENSITIVE_PERMISSIONS][0];

const role = (id: string, perms: string[], isProtected = false) => ({
  id,
  name: id,
  color: 'slate',
  isProtected,
  permissions: perms.map((code) => ({ permission: { code } })),
});

function setup(opts: {
  current?: { roleId: string; expiresAt: Date | null; role: ReturnType<typeof role> }[];
  roles?: ReturnType<typeof role>[];
  adminsAfter?: number;
}) {
  const tx = {
    $executeRaw: jest.fn(async () => 0),
    user: {
      findUnique: jest.fn(async () => ({ id: 'target', email: 't@x.com', status: 'ACTIVE', mfaRequired: false })),
      update: jest.fn(async () => ({})),
      count: jest.fn(async () => opts.adminsAfter ?? 1),
    },
    userRole: {
      findMany: jest.fn(async () => opts.current ?? []),
      deleteMany: jest.fn(async () => ({ count: 1 })),
      upsert: jest.fn(async () => ({})),
    },
    role: { findMany: jest.fn(async () => opts.roles ?? []) },
    auditLog: { create: jest.fn(async () => ({})) },
  };
  const prisma = { $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)) };
  const policy = { get: async () => ({ requireMfaForPrivileged: true }) };
  return { svc: new UserRolesService(prisma as never, policy as never), tx };
}

const actor = (perms: string[], id = 'actor') => ({
  id,
  email: 'a@x.com',
  fullName: 'A',
  roles: [],
  permissions: new Set(perms as PermissionCode[]),
  sessionId: 's',
});

const code = async (p: Promise<unknown>) => ((await p.catch((e) => e)) as PolicyViolation).code;

describe('UserRolesService.setRoles', () => {
  it('refuses to let an actor change their own roles', async () => {
    const { svc } = setup({});
    expect(await code(svc.setRoles(actor([], 'me'), 'me', [], {}))).toBe('SELF_MODIFICATION');
  });

  it('refuses granting a role holding permissions the actor lacks', async () => {
    const { svc, tx } = setup({ roles: [role('sales', ['sales.order.read', 'sales.order.write'])] });
    const err = await code(
      svc.setRoles(actor(['sales.order.read']), 'target', [{ roleId: 'sales' }], {}),
    );
    expect(err).toBe('ESCALATION');
    expect(tx.userRole.upsert).not.toHaveBeenCalled();
  });

  it('refuses removing Admin from the last active admin', async () => {
    const admin = role('admin', [SENSITIVE], true);
    const { svc, tx } = setup({
      current: [{ roleId: 'admin', expiresAt: null, role: admin }],
      adminsAfter: 0,
    });
    expect(await code(svc.setRoles(actor([SENSITIVE]), 'target', [], {}))).toBe('LAST_ADMIN');
    // The advisory lock is taken before anything is counted.
    expect(tx.$executeRaw).toHaveBeenCalled();
  });

  it('sets mfaRequired when a privileged role is granted and the policy requires it', async () => {
    const { svc, tx } = setup({ roles: [role('ops', [SENSITIVE])] });
    await svc.setRoles(actor([SENSITIVE]), 'target', [{ roleId: 'ops' }], {});
    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { mfaRequired: true } }),
    );
    const actions = (tx.auditLog.create.mock.calls as unknown as [{ data: { action: string } }][]).map(
      (c) => c[0].data.action,
    );
    expect(actions).toContain('user.roles_assigned');
  });

  it('rejects an expiry in the past', async () => {
    const { svc } = setup({ roles: [role('ops', ['sales.order.read'])] });
    await expect(
      svc.setRoles(
        actor(['sales.order.read']),
        'target',
        [{ roleId: 'ops', expiresAt: '2001-01-01T00:00:00Z' }],
        {},
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects an unknown role id', async () => {
    const { svc } = setup({ roles: [] });
    await expect(
      svc.setRoles(actor([]), 'target', [{ roleId: 'ghost' }], {}),
    ).rejects.toMatchObject({ status: 400 });
  });
});
