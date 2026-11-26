import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import {
  ERP_MODULE_KEYS,
  MatrixSaveRequest,
  NAVIGATION,
  PERMISSION_DEFINITIONS,
  PermissionMatrix,
  RoleColor,
} from '@erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ClientInfo } from '../../common/client-info';
import { RequestUser } from '../../common/types/request-user';
import { assertRoleEditable } from '../iam/access-policy';
import { withAdminLock } from '../iam/admin-lock';
import { computeImpact, PermissionDiff } from './role-impact';
import {
  assertKnownCodes,
  assertSafeRoleChanges,
  permissionIdMap,
  STALE_ROLE,
  writeRolePermissions,
} from './role-permissions';

const MODULE_LABELS = new Map<string, string>(NAVIGATION.map((m) => [m.key, m.label]));

/** Permission catalogue grouped by module, in catalogue order. */
export function catalogueByModule(): PermissionMatrix['modules'] {
  return ERP_MODULE_KEYS.map((key) => ({
    key,
    label: MODULE_LABELS.get(key) ?? key,
    permissions: PERMISSION_DEFINITIONS.filter((p) => p.module === key).map((p) => ({ ...p })),
  })).filter((m) => m.permissions.length > 0);
}

@Injectable()
export class MatrixService {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<PermissionMatrix> {
    const roles = await this.prisma.role.findMany({
      include: { permissions: { include: { permission: true } } },
      orderBy: [{ isProtected: 'desc' }, { type: 'asc' }, { name: 'asc' }],
    });
    return {
      modules: catalogueByModule(),
      roles: roles.map((r) => ({
        id: r.id,
        name: r.name,
        color: r.color as RoleColor,
        type: r.type,
        isProtected: r.isProtected,
        version: r.version,
        permissions: r.permissions.map((p) => p.permission.code).sort(),
      })),
    };
  }

  /** All-or-nothing: every version is checked before anything is written. */
  async save(
    actor: RequestUser,
    req: MatrixSaveRequest,
    client: ClientInfo,
  ): Promise<PermissionMatrix> {
    const ids = req.roles.map((r) => r.id);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('A role appears twice.');
    req.roles.forEach((r) => assertKnownCodes(r.permissions));

    await this.prisma.$transaction(async (tx) => {
      await withAdminLock(tx);
      const rows = await tx.role.findMany({
        where: { id: { in: ids } },
        include: { permissions: { include: { permission: true } } },
      });
      if (rows.length !== ids.length) throw new BadRequestException('Unknown role.');
      const byId = new Map(rows.map((r) => [r.id, r]));

      for (const r of req.roles) {
        if (byId.get(r.id)!.version !== r.version) throw new ConflictException(STALE_ROLE);
      }

      const changes = new Map<string, { before: string[]; after: string[] }>();
      const diffs = new Map<string, PermissionDiff>();
      for (const r of req.roles) {
        const row = byId.get(r.id)!;
        const before = row.permissions.map((p) => p.permission.code);
        const diff = computeImpact(before, r.permissions);
        if (!diff.added.length && !diff.removed.length) continue;
        assertRoleEditable(row, { permissions: true });
        changes.set(r.id, { before, after: [...new Set(r.permissions)] });
        diffs.set(r.id, diff);
      }
      if (changes.size === 0) return;

      await assertSafeRoleChanges(tx, actor, changes);
      const permIds = await permissionIdMap(tx);
      for (const [id, diff] of diffs) {
        const row = byId.get(id)!;
        await writeRolePermissions(tx, actor, row, diff, permIds, client);
      }
    });
    return this.get();
  }
}
