import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CategoryDto, TaxRateDto, UnitDto } from '@erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../core/audit/audit.service';
import type {
  CreateCategoryDto,
  CreateUnitDto,
  UpdateCategoryDto,
} from './products/dto/product.dto';

interface CategoryRow {
  id: string;
  name: string;
  parentId: string | null;
  isActive: boolean;
}

/** Builds "Parent / Child" paths; robust against (impossible) cycles. */
export function buildCategoryPaths(rows: CategoryRow[]): Map<string, string> {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const paths = new Map<string, string>();
  for (const row of rows) {
    const parts: string[] = [];
    const seen = new Set<string>();
    let cur: CategoryRow | undefined = row;
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      parts.unshift(cur.name);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    paths.set(row.id, parts.join(' / '));
  }
  return paths;
}

/** The category itself plus every sub-category below it. */
export function descendantIds(rows: CategoryRow[], rootId: string): string[] {
  const children = new Map<string, string[]>();
  for (const r of rows) {
    if (r.parentId) children.set(r.parentId, [...(children.get(r.parentId) ?? []), r.id]);
  }
  const out: string[] = [];
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    if (out.includes(id)) continue;
    out.push(id);
    stack.push(...(children.get(id) ?? []));
  }
  return out;
}

/** Categories, units of measure and the tax-rate lookup used by the product screens. */
@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Categories ────────────────────────────────────────────────────────────

  async listCategories(includeInactive: boolean): Promise<CategoryDto[]> {
    const rows = await this.prisma.category.findMany({
      include: { _count: { select: { products: { where: { isActive: true } } } } },
    });
    const paths = buildCategoryPaths(rows);
    return rows
      .filter((r) => includeInactive || r.isActive)
      .map((r) => ({
        id: r.id,
        name: r.name,
        parentId: r.parentId,
        isActive: r.isActive,
        path: paths.get(r.id)!,
        productCount: r._count.products,
      }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  async createCategory(dto: CreateCategoryDto, userId: string): Promise<CategoryDto> {
    const parentId = dto.parentId ?? null;
    if (parentId) await this.requireCategory(parentId, true);
    await this.assertUniqueSiblingName(dto.name, parentId, null);

    const created = await this.prisma.$transaction(async (tx) => {
      const c = await tx.category.create({ data: { name: dto.name, parentId } });
      await this.audit.record(tx, {
        userId,
        action: 'create',
        entity: 'Category',
        entityId: c.id,
        after: c,
      });
      return c;
    });
    return (await this.listCategories(true)).find((c) => c.id === created.id)!;
  }

  async updateCategory(id: string, dto: UpdateCategoryDto, userId: string): Promise<CategoryDto> {
    const current = await this.requireCategory(id, false);
    const name = dto.name ?? current.name;
    const parentId = dto.parentId === undefined ? current.parentId : dto.parentId;

    if (parentId) {
      if (parentId === id) throw new BadRequestException('A category cannot be its own parent');
      await this.requireCategory(parentId, false);
      const all = await this.prisma.category.findMany();
      if (descendantIds(all, id).includes(parentId)) {
        throw new BadRequestException('A category cannot be moved under one of its sub-categories');
      }
    }
    if (name !== current.name || parentId !== current.parentId) {
      await this.assertUniqueSiblingName(name, parentId, id);
    }

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.category.update({
        where: { id },
        data: { name, parentId, isActive: dto.isActive ?? current.isActive },
      });
      await this.audit.record(tx, {
        userId,
        action: 'update',
        entity: 'Category',
        entityId: id,
        before: current,
        after: updated,
      });
    });
    return (await this.listCategories(true)).find((c) => c.id === id)!;
  }

  private async requireCategory(id: string, mustBeActive: boolean) {
    const c = await this.prisma.category.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Category not found');
    if (mustBeActive && !c.isActive)
      throw new BadRequestException(`Category "${c.name}" is inactive`);
    return c;
  }

  /** Postgres treats NULL parents as distinct, so the DB unique index does not cover top level. */
  private async assertUniqueSiblingName(
    name: string,
    parentId: string | null,
    exceptId: string | null,
  ) {
    const clash = await this.prisma.category.findFirst({
      where: {
        parentId,
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
    });
    if (clash) throw new ConflictException(`A category named "${clash.name}" already exists here`);
  }

  // ── Units ─────────────────────────────────────────────────────────────────

  async listUnits(): Promise<UnitDto[]> {
    return this.prisma.unit.findMany({
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    });
  }

  async createUnit(dto: CreateUnitDto, userId: string): Promise<UnitDto> {
    const clash = await this.prisma.unit.findUnique({ where: { code: dto.code } });
    if (clash) throw new ConflictException(`Unit code ${dto.code} already exists`);
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.unit.create({ data: { code: dto.code, name: dto.name } });
      await this.audit.record(tx, {
        userId,
        action: 'create',
        entity: 'Unit',
        entityId: u.id,
        after: u,
      });
      return u;
    });
  }

  // ── Tax rates (read-only lookup for the product form) ─────────────────────

  async listTaxRates(): Promise<TaxRateDto[]> {
    const rates = await this.prisma.taxRate.findMany({
      where: { isActive: true },
      orderBy: { rate: 'asc' },
    });
    return rates.map((r) => ({ id: r.id, name: r.name, rate: r.rate.toString() }));
  }
}
