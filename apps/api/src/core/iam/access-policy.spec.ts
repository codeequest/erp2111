import {
  assertAdminsRemain,
  assertCanGrant,
  assertKeepsOwnAdminAccess,
  assertNotSelf,
  assertRoleEditable,
  countEffectiveAdmins,
  PolicyViolation,
} from './access-policy';
import { Assignment } from './permission-resolution';

const now = new Date('2026-11-25T12:00:00Z');
const A = (over: Partial<Assignment>): Assignment => ({
  roleId: 'r',
  roleName: 'R',
  isAdminRole: false,
  expiresAt: null,
  permissions: [],
  ...over,
});

describe('access policy', () => {
  it('blocks granting a permission the actor lacks', () =>
    expect(() => assertCanGrant(new Set(['admin.user.assign_roles']), ['admin.security.manage'])).toThrow(
      /admin.security.manage/,
    ));
  it('allows granting held permissions', () =>
    expect(() => assertCanGrant(new Set(['a.b.c']), ['a.b.c'])).not.toThrow());
  it('blocks self modification', () =>
    expect(() => assertNotSelf('u1', 'u1', 'change your own roles')).toThrow(PolicyViolation));
  it('allows acting on others', () => expect(() => assertNotSelf('u1', 'u2', 'x')).not.toThrow());
  it('blocks removing own admin capabilities', () =>
    expect(() => assertKeepsOwnAdminAccess(new Set(['admin.role.update']), new Set())).toThrow(
      /SELF_LOCKOUT|lock yourself out/,
    ));
  it('allows keeping own admin capabilities', () =>
    expect(() =>
      assertKeepsOwnAdminAccess(new Set(['admin.role.update']), new Set(['admin.role.update'])),
    ).not.toThrow());
  it('counts only ACTIVE users with a permanent Admin assignment', () => {
    const adm = A({ isAdminRole: true });
    expect(
      countEffectiveAdmins(
        [
          { id: '1', status: 'ACTIVE', assignments: [adm] },
          { id: '2', status: 'INACTIVE', assignments: [adm] },
          { id: '3', status: 'ACTIVE', assignments: [A({ isAdminRole: true, expiresAt: new Date('2027-01-01') })] },
        ],
        now,
      ),
    ).toBe(1);
  });
  it('rejects zero admins', () => expect(() => assertAdminsRemain(0)).toThrow(PolicyViolation));
  it('accepts one admin', () => expect(() => assertAdminsRemain(1)).not.toThrow());
  it('protects Admin and system roles', () => {
    expect(() => assertRoleEditable({ type: 'SYSTEM', isProtected: true }, { permissions: true })).toThrow();
    expect(() => assertRoleEditable({ type: 'SYSTEM', isProtected: false }, { delete: true })).toThrow();
    expect(() => assertRoleEditable({ type: 'SYSTEM', isProtected: false }, { rename: true })).toThrow();
    expect(() => assertRoleEditable({ type: 'SYSTEM', isProtected: false }, { permissions: true })).not.toThrow();
    expect(() => assertRoleEditable({ type: 'CUSTOM', isProtected: false }, { delete: true })).not.toThrow();
  });
});
