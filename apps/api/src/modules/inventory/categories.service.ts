import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Category, Prisma } from '@prisma/client';
import { CATEGORY_PATH_SEPARATOR, CategoryDto } from '@erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { Actor, AuditService } from '../../core/audit/audit.service';
import { SaveCategoryDto } from './catalog.dto';

type Db = Prisma.TransactionClient | PrismaService;

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Flat list sorted by full path ("Boissons", "Boissons › Jus", …). */
  async findAll(): Promise<CategoryDto[]> {
    const rows = await this.prisma.category.findMany({
      include: { _count: { select: { products: true } } },
    });
    const paths = buildPaths(rows);
    return rows
      .map((c) => ({
        id: c.id,
        name: c.name,
        parentId: c.parentId,
        isActive: c.isActive,
        path: paths.get(c.id)!,
        productCount: c._count.products,
      }))
      .sort((a, b) => a.path.localeCompare(b.path, 'fr', { sensitivity: 'base' }));
  }

  async create(dto: SaveCategoryDto, actor: Actor): Promise<CategoryDto> {
    const parentId = dto.parentId ?? null;
    if (parentId) await this.load(parentId);
    await this.assertNameFree(dto.name, parentId);

    const created = await this.prisma.$transaction(async (tx) => {
      const c = await tx.category.create({
        data: { name: dto.name, parentId, isActive: dto.isActive ?? true },
      });
      await this.audit.log(
        actor,
        { action: 'create', entity: 'Category', entityId: c.id, after: snap(c) },
        tx,
      );
      return c;
    });
    return this.dto(created.id);
  }

  async update(id: string, dto: SaveCategoryDto, actor: Actor): Promise<CategoryDto> {
    const before = await this.load(id);
    const parentId = dto.parentId === undefined ? before.parentId : dto.parentId;

    if (parentId) {
      if (parentId === id) throw new BadRequestException('A category cannot be its own parent');
      await this.load(parentId);
      // Moving a category under one of its own sub-categories would create a loop.
      const descendants = await this.descendantIds(id);
      if (descendants.includes(parentId)) {
        throw new BadRequestException('A category cannot be moved under one of its sub-categories');
      }
    }
    if (dto.name !== before.name || parentId !== before.parentId) {
      await this.assertNameFree(dto.name, parentId, id);
    }

    await this.prisma.$transaction(async (tx) => {
      const after = await tx.category.update({
        where: { id },
        data: { name: dto.name, parentId, isActive: dto.isActive },
      });
      await this.audit.log(
        actor,
        {
          action: 'update',
          entity: 'Category',
          entityId: id,
          before: snap(before),
          after: snap(after),
        },
        tx,
      );
    });
    return this.dto(id);
  }

  /** Only empty categories (no product, no sub-category) can be deleted; others are deactivated. */
  async remove(id: string, actor: Actor): Promise<void> {
    const c = await this.prisma.category.findUnique({
      where: { id },
      include: { _count: { select: { products: true, children: true } } },
    });
    if (!c) throw new NotFoundException('Category not found');
    if (c._count.children > 0) {
      throw new BadRequestException('This category has sub-categories. Move or delete them first.');
    }
    if (c._count.products > 0) {
      throw new BadRequestException(
        `This category contains ${c._count.products} product(s). Move them or deactivate the category instead.`,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.category.delete({ where: { id } });
      await this.audit.log(
        actor,
        { action: 'delete', entity: 'Category', entityId: id, before: snap(c) },
        tx,
      );
    });
  }

  /** The category and all its sub-categories, at any depth. */
  async descendantIds(id: string, db: Db = this.prisma): Promise<string[]> {
    const all = await db.category.findMany({ select: { id: true, parentId: true } });
    const children = new Map<string, string[]>();
    for (const c of all) {
      if (!c.parentId) continue;
      children.set(c.parentId, [...(children.get(c.parentId) ?? []), c.id]);
    }
    const out: string[] = [];
    const stack = [...(children.get(id) ?? [])];
    while (stack.length) {
      const next = stack.pop()!;
      out.push(next);
      stack.push(...(children.get(next) ?? []));
    }
    return out;
  }

  /** Full path of every category, e.g. "Boissons › Jus". */
  async pathMap(db: Db = this.prisma): Promise<Map<string, string>> {
    return buildPaths(await db.category.findMany());
  }

  private async dto(id: string): Promise<CategoryDto> {
    const all = await this.findAll();
    return all.find((c) => c.id === id)!;
  }

  private async load(id: string): Promise<Category> {
    const c = await this.prisma.category.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Category not found');
    return c;
  }

  /** Names are unique among siblings (case-insensitive). */
  private async assertNameFree(name: string, parentId: string | null, exceptId?: string) {
    const taken = await this.prisma.category.findFirst({
      where: {
        parentId,
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId && { id: { not: exceptId } }),
      },
    });
    if (taken)
      throw new ConflictException('A category with this name already exists at this level');
  }
}

function snap(c: Category) {
  return { name: c.name, parentId: c.parentId, isActive: c.isActive };
}

export function buildPaths(
  rows: Pick<Category, 'id' | 'name' | 'parentId'>[],
): Map<string, string> {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const cache = new Map<string, string>();
  const path = (id: string, guard = 0): string => {
    const hit = cache.get(id);
    if (hit) return hit;
    const c = byId.get(id)!;
    const p =
      c.parentId && byId.has(c.parentId) && guard < 20
        ? path(c.parentId, guard + 1) + CATEGORY_PATH_SEPARATOR + c.name
        : c.name;
    cache.set(id, p);
    return p;
  };
  for (const r of rows) path(r.id);
  return cache;
}
