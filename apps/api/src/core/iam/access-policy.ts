import { UserStatus } from '@erp/shared';
import { Assignment, activeAssignments } from './permission-resolution';

export type PolicyViolationCode =
  | 'ESCALATION'
  | 'SELF_MODIFICATION'
  | 'SELF_LOCKOUT'
  | 'LAST_ADMIN'
  | 'PROTECTED_ROLE'
  | 'SYSTEM_ROLE';

export class PolicyViolation extends Error {
  constructor(
    public code: PolicyViolationCode,
    message: string,
  ) {
    super(message);
    this.name = 'PolicyViolation';
  }
}

const ADMIN_CAPABILITIES = ['admin.role.update', 'admin.permission.manage', 'admin.user.assign_roles'];

/** An actor may only grant permissions they hold themselves. */
export function assertCanGrant(actorPerms: Set<string>, granted: Iterable<string>): void {
  const missing = [...new Set(granted)].filter((c) => !actorPerms.has(c));
  if (missing.length > 0) {
    throw new PolicyViolation(
      'ESCALATION',
      `You cannot grant permissions you do not hold: ${missing.join(', ')}.`,
    );
  }
}

export function assertNotSelf(actorId: string, targetId: string, what: string): void {
  if (actorId === targetId) {
    throw new PolicyViolation('SELF_MODIFICATION', `You cannot ${what}.`);
  }
}

/** The actor must not lose any admin-management capability they currently have. */
export function assertKeepsOwnAdminAccess(before: Set<string>, after: Set<string>): void {
  const lost = ADMIN_CAPABILITIES.filter((c) => before.has(c) && !after.has(c));
  if (lost.length > 0) {
    throw new PolicyViolation(
      'SELF_LOCKOUT',
      `This change would lock you out of: ${lost.join(', ')}. You cannot lock yourself out of administration.`,
    );
  }
}

/** ACTIVE users holding a permanent (non-expiring) Admin assignment. Temporary lockout is ignored. */
export function countEffectiveAdmins(
  users: { id: string; status: UserStatus; assignments: Assignment[] }[],
  now: Date,
): number {
  return users.filter(
    (u) =>
      u.status === 'ACTIVE' &&
      activeAssignments(u.assignments, now).some((a) => a.isAdminRole && a.expiresAt === null),
  ).length;
}

export function assertAdminsRemain(countAfter: number): void {
  if (countAfter < 1) {
    throw new PolicyViolation('LAST_ADMIN', 'This would leave no active administrator.');
  }
}

export function assertRoleEditable(
  role: { type: 'SYSTEM' | 'CUSTOM'; isProtected: boolean },
  change: { rename?: boolean; permissions?: boolean; delete?: boolean },
): void {
  if (role.isProtected) {
    throw new PolicyViolation('PROTECTED_ROLE', 'The Admin role cannot be changed.');
  }
  if (role.type === 'SYSTEM' && (change.delete || change.rename)) {
    throw new PolicyViolation('SYSTEM_ROLE', 'System roles cannot be deleted or renamed.');
  }
}
