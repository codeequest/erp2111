import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isPermissionCode } from '@erp/shared';
import { recordAudit } from '../../common/audit';
import { ClientInfo } from '../../common/client-info';
import { RequestUser } from '../../common/types/request-user';
import { assertCanGrant, assertKeepsOwnAdminAccess } from '../iam/access-policy';
import { computeImpact, PermissionDiff } from './role-impact';

type Tx = Prisma.TransactionClient;

export const STALE_ROLE = 'This role was changed by someone else. Reload to see the latest version.';

export function assertKnownCodes(codes: string[]): void {
  const unknown = codes.filter((c) => !isPermissionCode(c));
  if (unknown.length) throw new BadRequestException(`Unknown permission: ${unknown.join(', ')}`);
}

/** The actor's effective permissions if the given roles had the given permission sets. */
export async function actorPermsWith(
  tx: Tx,
  actor: RequestUser,
  overrides: Map<string, string[] | null>,
): Promise<Set<string>> {
  const now = Date.now();
  const assignments = await tx.userRole.findMany({
    where: { userId: actor.id },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });
  const perms = new Set<string>();
  for (const a of assignments) {
    if (a.expiresAt && a.expiresAt.getTime() <= now) continue;
    const override = overrides.get(a.roleId);
    if (override === null) continue; // role removed (deleted)
    const codes = override ?? a.role.permissions.map((p) => p.permission.code);
    codes.forEach((c) => perms.add(c));
  }
  return perms;
}

/**
 * Checks escalation and self-lockout for a set of role permission changes.
 * `changes` maps roleId → new permission list (null = role goes away).
 */
export async function assertSafeRoleChanges(
  tx: Tx,
  actor: RequestUser,
  changes: Map<string, { before: string[]; after: string[] | null }>,
): Promise<void> {
  const added = [...changes.values()].flatMap((c) =>
    c.after ? computeImpact(c.before, c.after).added : [],
  );
  assertCanGrant(actor.permissions, added);
  // Both sides from the same source (this transaction), so only the change itself counts.
  const before = await actorPermsWith(tx, actor, new Map());
  const overrides = new Map([...changes].map(([id, c]) => [id, c.after]));
  const after = await actorPermsWith(tx, actor, overrides);
  assertKeepsOwnAdminAccess(before, after);
}

/**
 * Writes the new permission set of one role with an optimistic version check,
 * bumps the version, and audits what was added / removed.
 */
export async function writeRolePermissions(
  tx: Tx,
  actor: RequestUser,
  role: { id: string; name: string; version: number },
  diff: PermissionDiff,
  permissionIds: Map<string, string>,
  client: ClientInfo,
): Promise<void> {
  const bumped = await tx.role.updateMany({
    where: { id: role.id, version: role.version },
    data: { version: { increment: 1 } },
  });
  if (bumped.count === 0) throw new ConflictException(STALE_ROLE);

  if (diff.removed.length) {
    await tx.rolePermission.deleteMany({
      where: {
        roleId: role.id,
        permissionId: { in: diff.removed.map((c) => permissionIds.get(c)!).filter(Boolean) },
      },
    });
  }
  if (diff.added.length) {
    await tx.rolePermission.createMany({
      data: diff.added.map((c) => ({ roleId: role.id, permissionId: permissionIds.get(c)! })),
    });
  }
  const base = {
    actorId: actor.id,
    targetType: 'Role',
    targetId: role.id,
    targetLabel: role.name,
    ip: client.ip,
    userAgent: client.userAgent,
  };
  if (diff.added.length) {
    await recordAudit(tx, {
      ...base,
      action: 'role.permissions_added',
      after: { permissions: diff.added, sensitive: diff.sensitiveAdded },
    });
  }
  if (diff.removed.length) {
    await recordAudit(tx, {
      ...base,
      action: 'role.permissions_removed',
      before: { permissions: diff.removed, sensitive: diff.sensitiveRemoved },
    });
  }
}

export async function permissionIdMap(tx: Tx): Promise<Map<string, string>> {
  const rows = await tx.permission.findMany({ select: { id: true, code: true } });
  return new Map(rows.map((r) => [r.code, r.id]));
}
