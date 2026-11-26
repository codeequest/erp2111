import {
  ALL_PERMISSIONS,
  DEFAULT_ROLES,
  isPrivileged,
  LEGACY_PERMISSION_MAP,
  NAVIGATION,
  PERMISSION_DEFINITIONS,
  PermissionCode,
  ROLE_COLORS,
  ROLE_TEMPLATES,
  SENSITIVE_PERMISSIONS,
} from '@erp/shared';

describe('shared permission model', () => {
  it('has unique codes in module.resource.action format', () => {
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
    for (const p of PERMISSION_DEFINITIONS) {
      expect(p.code).toMatch(/^[a-z]+\.[a-z]+\.[a-z_]+$/);
      expect(p.code).toBe(`${p.module}.${p.resource}.${p.action}`);
      expect(p.label.length).toBeGreaterThan(0);
    }
  });

  it('maps every legacy admin code onto existing codes', () => {
    for (const targets of Object.values(LEGACY_PERMISSION_MAP))
      targets.forEach((t) => expect(ALL_PERMISSIONS).toContain(t));
    expect(ALL_PERMISSIONS).not.toContain('admin.users.manage');
    expect(ALL_PERMISSIONS).not.toContain('admin.roles.manage');
  });

  it('marks the privileged admin actions sensitive', () => {
    for (const c of [
      'admin.user.deactivate',
      'admin.user.assign_roles',
      'admin.permission.manage',
      'admin.security.manage',
    ])
      expect(SENSITIVE_PERMISSIONS.has(c as PermissionCode)).toBe(true);
    expect(isPrivileged(['admin.user.view'])).toBe(false);
    expect(isPrivileged(['admin.user.view', 'admin.session.revoke'])).toBe(true);
  });

  it('lists the exact codes each legacy admin code expands to', () => {
    expect(new Set(LEGACY_PERMISSION_MAP['admin.users.manage'])).toEqual(
      new Set([
        ...ALL_PERMISSIONS.filter((p) => p.startsWith('admin.user.')),
        'admin.session.revoke',
      ]),
    );
    expect(new Set(LEGACY_PERMISSION_MAP['admin.roles.manage'])).toEqual(
      new Set([
        ...ALL_PERMISSIONS.filter((p) => p.startsWith('admin.role.')),
        'admin.permission.manage',
      ]),
    );
    expect(LEGACY_PERMISSION_MAP['admin.audit.read']).toEqual([
      'admin.audit.read',
      'admin.security.view',
    ]);
  });

  it('keeps business permissions non-sensitive so only Admin is privileged', () => {
    for (const p of PERMISSION_DEFINITIONS.filter((d) => d.module !== 'admin'))
      expect(p.sensitive).toBe(false);
    expect(DEFAULT_ROLES.filter((r) => isPrivileged(r.permissions)).map((r) => r.name)).toEqual([
      'Admin',
    ]);
  });

  it('exposes the security overview in navigation', () => {
    const item = NAVIGATION.flatMap((m) => m.items).find((i) => i.key === 'security');
    expect(item).toMatchObject({ href: '/admin/security', permission: 'admin.security.view' });
  });

  it('protects only the Admin role and uses palette colours', () => {
    expect(DEFAULT_ROLES.filter((r) => r.isProtected).map((r) => r.name)).toEqual(['Admin']);
    for (const r of DEFAULT_ROLES) expect(ROLE_COLORS).toContain(r.color);
  });

  it('uses only known permissions in templates', () => {
    ROLE_TEMPLATES.forEach((t) =>
      t.permissions.forEach((p) => expect(ALL_PERMISSIONS).toContain(p)),
    );
    const userManager = ROLE_TEMPLATES.find((t) => t.key === 'user-manager')!;
    expect(userManager.permissions.some((p) => /^admin\.(role|permission)\./.test(p))).toBe(false);
  });

  it('gives the Admin role every permission', () => {
    const admin = DEFAULT_ROLES.find((r) => r.name === 'Admin')!;
    expect(new Set(admin.permissions)).toEqual(new Set(ALL_PERMISSIONS));
  });

  it('keeps inventory.cost.view away from Sales clerk, Storekeeper and Viewer', () => {
    for (const name of ['Sales clerk', 'Storekeeper', 'Viewer']) {
      const role = DEFAULT_ROLES.find((r) => r.name === name)!;
      expect(role.permissions).not.toContain('inventory.cost.view');
    }
  });

  it('only uses known permissions in roles and navigation', () => {
    const known = new Set<string>(ALL_PERMISSIONS);
    for (const role of DEFAULT_ROLES) role.permissions.forEach((p) => expect(known).toContain(p));
    for (const m of NAVIGATION) m.items.forEach((i) => expect(known).toContain(i.permission));
  });

  it('has unique navigation paths', () => {
    const hrefs = NAVIGATION.flatMap((m) => m.items.map((i) => i.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
