import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CategoryNode, UnitRow } from '@erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestUser } from '../../common/types/request-user';
import { audit } from '../../common/audit';
import { buildCategoryTree, categoryWithDescendants } from './category-tree';
import {
  CreateCategoryDto,
  CreateUnitDto,
  UpdateCategoryDto,
  UpdateUnitDto,
} from './dto/catalog.dto';

/** Categories and units of measure. Every write is audited in the same transaction. */
@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Categories ─────────────────────────────────────────────────────────────

  async listCategories(includeInactive: boolean): Promise<CategoryNode[]> {
    const rows = await this.prisma.category.findMany({
      include: { _count: { select: { products: true } } },
    });
    const tree = buildCategoryTree(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        parentId: r.parentId,
        isActive: r.isActive,
        productCount: r._count.products,
      })),
    );
    return includeInactive ? tree : tree.filter((c) => c.isActive);
  }

  /** Ids of a category and all its sub-categories, for filtering products. */
  async categoryAndDescendantIds(id: string): Promise<string[]> {
    const rows = await this.prisma.category.findMany({ select: { id: true, parentId: true } });
    return categoryWithDescendants(rows, id);
  }

  async createCategory(dto: CreateCategoryDto, user: RequestUser): Promise<CategoryNode> {
    const parentId = dto.parentId ?? null;
    if (parentId) await this.getCategoryOrThrow(parentId, 'Parent category not found');
    await this.assertSiblingNameFree(dto.name, parentId);

    const created = await this.prisma.$transaction(async (tx) => {
      const c = await tx.category.create({ data: { name: dto.name, parentId } });
      await audit(tx, user, 'create', 'Category', c.id, null, categorySnapshot(c));
      return c;
    });
    return this.findCategoryNode(created.id);
  }

  async updateCategory(
    id: string,
    dto: UpdateCategoryDto,
    user: RequestUser,
  ): Promise<CategoryNode> {
    const existing = await this.getCategoryOrThrow(id);
    const name = dto.name ?? existing.name;
    const parentId = dto.parentId !== undefined ? dto.parentId : existing.parentId;

    if (parentId !== existing.parentId && parentId !== null) {
      await this.getCategoryOrThrow(parentId, 'Parent category not found');
      const subtree = await this.categoryAndDescendantIds(id);
      if (subtree.includes(parentId)) {
        throw new BadRequestException(
          'A category cannot be moved inside itself or its sub-categories',
        );
      }
    }
    if (name.toLowerCase() !== existing.name.toLowerCase() || parentId !== existing.parentId) {
      await this.assertSiblingNameFree(name, parentId, id);
    }

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.category.update({
        where: { id },
        data: { name, parentId, isActive: dto.isActive ?? existing.isActive },
      });
      const before = categorySnapshot(existing);
      const after = categorySnapshot(updated);
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        await audit(tx, user, 'update', 'Category', id, before, after);
      }
    });
    return this.findCategoryNode(id);
  }

  private async findCategoryNode(id: string): Promise<CategoryNode> {
    const all = await this.listCategories(true);
    return all.find((c) => c.id === id)!;
  }

  private async getCategoryOrThrow(id: string, message = 'Category not found') {
    const c = await this.prisma.category.findUnique({ where: { id } });
    if (!c) throw new NotFoundException(message);
    return c;
  }

  /**
   * Names must be unique among siblings. The database index cannot enforce
   * this for top-level categories (NULL parents never clash), so check here.
   */
  private async assertSiblingNameFree(name: string, parentId: string | null, exceptId?: string) {
    const clash = await this.prisma.category.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        parentId,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
    });
    if (clash) {
      throw new ConflictException(
        parentId
          ? `A sub-category named "${clash.name}" already exists here`
          : `A top-level category named "${clash.name}" already exists`,
      );
    }
  }

  // ── Units ──────────────────────────────────────────────────────────────────

  async listUnits(): Promise<UnitRow[]> {
    const rows = await this.prisma.unit.findMany({
      include: { _count: { select: { baseProducts: true, productUnits: true } } },
      orderBy: { code: 'asc' },
    });
    return rows.map((u) => ({
      id: u.id,
      code: u.code,
      name: u.name,
      productCount: u._count.baseProducts + u._count.productUnits,
    }));
  }

  async createUnit(dto: CreateUnitDto, user: RequestUser): Promise<UnitRow> {
    const clash = await this.prisma.unit.findUnique({ where: { code: dto.code } });
    if (clash)
      throw new ConflictException(`Unit code "${dto.code}" already exists (${clash.name})`);
    const unit = await this.prisma.$transaction(async (tx) => {
      const u = await tx.unit.create({ data: { code: dto.code, name: dto.name } });
      await audit(tx, user, 'create', 'Unit', u.id, null, { code: u.code, name: u.name });
      return u;
    });
    return { id: unit.id, code: unit.code, name: unit.name, productCount: 0 };
  }

  /** Only the name can change: the code is printed on documents and used in imports. */
  async updateUnit(id: string, dto: UpdateUnitDto, user: RequestUser): Promise<UnitRow> {
    const existing = await this.prisma.unit.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Unit not found');
    if (existing.name !== dto.name) {
      await this.prisma.$transaction(async (tx) => {
        await tx.unit.update({ where: { id }, data: { name: dto.name } });
        await audit(tx, user, 'update', 'Unit', id, { name: existing.name }, { name: dto.name });
      });
    }
    return (await this.listUnits()).find((u) => u.id === id)!;
  }
}

function categorySnapshot(c: { name: string; parentId: string | null; isActive: boolean }) {
  return { name: c.name, parentId: c.parentId, isActive: c.isActive };
}
