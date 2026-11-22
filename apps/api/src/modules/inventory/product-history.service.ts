import { Injectable, NotFoundException } from '@nestjs/common';
import type { HistoryEntry } from '@erp/shared';
import { PrismaService } from '../../prisma/prisma.service';

const MAX_ENTRIES = 100;

/** Fields whose values are ids: shown with the name they point to. */
const REFERENCE_FIELDS = new Set(['categoryId', 'baseUnitId', 'taxRateId']);

type Json = Record<string, unknown> | null;

/**
 * Change history of a product, built from the audit log.
 * Average cost is never audited, so nothing here needs inventory.cost.view.
 */
@Injectable()
export class ProductHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async history(productId: string): Promise<HistoryEntry[]> {
    const exists = await this.prisma.product.count({ where: { id: productId } });
    if (!exists) throw new NotFoundException('Product not found');

    const logs = await this.prisma.auditLog.findMany({
      where: { entity: 'Product', entityId: productId },
      include: { user: { select: { fullName: true } } },
      orderBy: { id: 'desc' },
      take: MAX_ENTRIES,
    });

    const names = await this.referenceNames(logs.map((l) => [l.before, l.after]).flat() as Json[]);

    return logs.map((l) => ({
      id: l.id.toString(),
      action: l.action,
      user: l.user?.fullName ?? null,
      createdAt: l.createdAt.toISOString(),
      changes: diff(l.before as Json, l.after as Json, names),
    }));
  }

  /** Resolves every category / unit / tax id mentioned in the logs, in three queries. */
  private async referenceNames(snapshots: Json[]): Promise<Map<string, string>> {
    const ids = new Set<string>();
    for (const snap of snapshots) {
      if (!snap) continue;
      for (const field of REFERENCE_FIELDS) {
        const v = snap[field];
        if (typeof v === 'string') ids.add(v);
      }
      for (const pack of packList(snap)) ids.add(pack.unitId);
    }
    if (!ids.size) return new Map();
    const list = [...ids];
    const [categories, units, taxes] = await this.prisma.$transaction([
      this.prisma.category.findMany({
        where: { id: { in: list } },
        select: { id: true, name: true },
      }),
      this.prisma.unit.findMany({ where: { id: { in: list } }, select: { id: true, code: true } }),
      this.prisma.taxRate.findMany({
        where: { id: { in: list } },
        select: { id: true, name: true },
      }),
    ]);
    return new Map<string, string>([
      ...categories.map((c) => [c.id, c.name] as [string, string]),
      ...units.map((u) => [u.id, u.code] as [string, string]),
      ...taxes.map((t) => [t.id, t.name] as [string, string]),
    ]);
  }
}

interface PackSnap {
  unitId: string;
  factor: string;
  barcode: string | null;
}

function packList(snap: Json): PackSnap[] {
  const v = snap?.packUnits;
  return Array.isArray(v) ? (v as PackSnap[]) : [];
}

/** Field-by-field differences between two audit snapshots. Exported for tests. */
export function diff(before: Json, after: Json, names: Map<string, string>) {
  const show = (field: string, v: unknown): string | null => {
    if (v === null || v === undefined || v === '') return null;
    if (field === 'packUnits') {
      const packs = v as PackSnap[];
      return packs.length
        ? packs.map((p) => `${names.get(p.unitId) ?? '?'} × ${p.factor}`).join(', ')
        : null;
    }
    if (REFERENCE_FIELDS.has(field)) return names.get(String(v)) ?? '(deleted)';
    if (typeof v === 'boolean') return v ? 'yes' : 'no';
    return String(v);
  };

  const fields = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const changes: HistoryEntry['changes'] = [];
  for (const field of fields) {
    const from = show(field, before?.[field]);
    const to = show(field, after?.[field]);
    if (from !== to) changes.push({ field, from, to });
  }
  return changes;
}
