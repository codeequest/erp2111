import { isPermissionCode, PermissionCode, UserStatus } from '@erp/shared';

export type Assignment = {
  roleId: string;
  roleName: string;
  isAdminRole: boolean;
  expiresAt: Date | null;
  permissions: string[];
};

/** Assignments still in force. Expiry is exclusive: `expiresAt <= now` is expired. */
export function activeAssignments(assignments: Assignment[], now: Date): Assignment[] {
  return assignments.filter((a) => a.expiresAt === null || a.expiresAt.getTime() > now.getTime());
}

/** Effective permissions: union over active assignments; empty unless the user is ACTIVE. Unknown codes are dropped. */
export function resolvePermissions(
  user: { status: UserStatus },
  assignments: Assignment[],
  now: Date,
): Set<PermissionCode> {
  const result = new Set<PermissionCode>();
  if (user.status !== 'ACTIVE') return result;
  for (const a of activeAssignments(assignments, now)) {
    for (const code of a.permissions) {
      if (isPermissionCode(code)) result.add(code);
    }
  }
  return result;
}

/** Which active roles contribute each permission. */
export function explainPermissions(
  assignments: Assignment[],
  now: Date,
): Map<PermissionCode, { roleId: string; roleName: string }[]> {
  const result = new Map<PermissionCode, { roleId: string; roleName: string }[]>();
  for (const a of activeAssignments(assignments, now)) {
    for (const code of a.permissions) {
      if (!isPermissionCode(code)) continue;
      const sources = result.get(code) ?? [];
      sources.push({ roleId: a.roleId, roleName: a.roleName });
      result.set(code, sources);
    }
  }
  return result;
}
