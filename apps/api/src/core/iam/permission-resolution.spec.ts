import { Assignment, explainPermissions, resolvePermissions } from './permission-resolution';

const now = new Date('2026-11-25T12:00:00Z');
const A = (over: Partial<Assignment>): Assignment => ({
  roleId: 'r',
  roleName: 'R',
  isAdminRole: false,
  expiresAt: null,
  permissions: [],
  ...over,
});

describe('permission resolution', () => {
  it('unions permissions across roles', () =>
    expect(
      resolvePermissions(
        { status: 'ACTIVE' },
        [A({ permissions: ['sales.order.read'] }), A({ permissions: ['inventory.product.read'] })],
        now,
      ),
    ).toEqual(new Set(['sales.order.read', 'inventory.product.read'])));

  it('drops expired assignments exactly at expiry', () =>
    expect(
      resolvePermissions({ status: 'ACTIVE' }, [A({ permissions: ['sales.order.read'], expiresAt: now })], now).size,
    ).toBe(0));

  it('keeps assignments expiring in the future', () =>
    expect(
      resolvePermissions(
        { status: 'ACTIVE' },
        [A({ permissions: ['sales.order.read'], expiresAt: new Date('2026-11-25T12:00:01Z') })],
        now,
      ).size,
    ).toBe(1));

  it('grants nothing to INACTIVE or PENDING users', () => {
    for (const status of ['INACTIVE', 'PENDING'] as const)
      expect(resolvePermissions({ status }, [A({ permissions: ['sales.order.read'] })], now).size).toBe(0);
  });

  it('ignores unknown codes (default deny)', () =>
    expect(resolvePermissions({ status: 'ACTIVE' }, [A({ permissions: ['made.up.code'] })], now).size).toBe(0));

  it('explains sources', () =>
    expect(
      explainPermissions(
        [
          A({ roleName: 'X', permissions: ['sales.order.read'] }),
          A({ roleName: 'Y', roleId: 'y', permissions: ['sales.order.read'] }),
        ],
        now,
      )
        .get('sales.order.read')!
        .map((s) => s.roleName),
    ).toEqual(['X', 'Y']));
});
