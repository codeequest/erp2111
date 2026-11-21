import { ALL_PERMISSIONS, DEFAULT_ROLES, NAVIGATION, PERMISSION_DEFINITIONS } from '@erp/shared';

describe('shared permission model', () => {
  it('has unique permission codes in module.resource.action format', () => {
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
    for (const p of PERMISSION_DEFINITIONS) {
      expect(p.code).toMatch(/^[a-z]+\.[a-z]+\.[a-z]+$/);
      expect(p.code.startsWith(p.module + '.')).toBe(true);
    }
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
