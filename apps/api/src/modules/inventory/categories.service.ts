import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CategoryNode } from '@erp/shared';
import { Db } from '../../common/db';
import { isUniqueViolation } from '../../common/prisma-errors';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { buildCategoryTree, FlatCategory, wouldCreateCycle } from './category-tree';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

/**
 * Product categories, as a tree. Categories are never deleted, only deactivated
 * (soft delete), so products and history keep pointing at them.
 */
@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findTree(): Promise<CategoryNode[]> {
    return buildCategoryTree(await this.loadFlat(this.prisma));
  }

  async create(dto: CreateCategoryDto, userId: string) {
    const parentId = dto.parentId ?? null;
    return this.write(dto.name, async () =>
      this.prisma.$transaction(async (tx) => {
        if (parentId) await this.requireParent(tx, parentId);
        await this.assertNameFree(tx, dto.name, parentId);

        const created = await tx.category.create({ data: { name: dto.name, parentId } });
        await this.audit.log(tx, {
          userId,
          action: 'create',
          entity: 'Category',
          entityId: created.id,
          after: created,
        });
        return created;
      }),
    );
  }

  async update(id: string, dto: UpdateCategoryDto, userId: string) {
    return this.write(dto.name ?? '', async () =>
      this.prisma.$transaction(async (tx) => {
        const before = await tx.category.findUnique({ where: { id } });
        if (!before) throw new NotFoundException('Category not found');

        const name = dto.name ?? before.name;
        // undefined = keep the current parent; null = move to top level
        const parentId = dto.parentId === undefined ? before.parentId : dto.parentId;

        if (parentId && parentId !== before.parentId) {
          await this.requireParent(tx, parentId);
          const all = await tx.category.findMany({ select: { id: true, parentId: true } });
          if (wouldCreateCycle(all, id, parentId)) {
            throw new BadRequestException(
              'A category cannot be moved under itself or one of its sub-categories',
            );
          }
        }
        if (name !== before.name || parentId !== before.parentId) {
          await this.assertNameFree(tx, name, parentId, id);
        }

        const after = await tx.category.update({
          where: { id },
          data: { name, parentId, isActive: dto.isActive ?? before.isActive },
        });
        await this.audit.log(tx, {
          userId,
          action:
            after.isActive !== before.isActive
              ? after.isActive
                ? 'activate'
                : 'deactivate'
              : 'update',
          entity: 'Category',
          entityId: id,
          before,
          after,
        });
        return after;
      }),
    );
  }

  private async loadFlat(db: Db): Promise<FlatCategory[]> {
    const rows = await db.category.findMany({
      include: { _count: { select: { products: true } } },
    });
    return rows.map(({ _count, ...c }) => ({ ...c, productCount: _count.products }));
  }

  private async requireParent(db: Db, parentId: string) {
    const parent = await db.category.findUnique({ where: { id: parentId } });
    if (!parent) throw new BadRequestException('Parent category not found');
    if (!parent.isActive) throw new BadRequestException('Parent category is inactive');
  }

  /**
   * Sibling names must be unique (case-insensitive). Checked here because the DB
   * unique index on (parent_id, name) does not apply when parent_id is NULL.
   */
  private async assertNameFree(db: Db, name: string, parentId: string | null, exceptId?: string) {
    const clash = await db.category.findFirst({
      where: {
        parentId,
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
    });
    if (clash) throw new ConflictException(`A category named "${clash.name}" already exists here`);
  }

  /** Turns a race on the DB unique index into the same 409 as the explicit check. */
  private async write<T>(name: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (isUniqueViolation(e))
        throw new ConflictException(`A category named "${name}" already exists here`);
      throw e;
    }
  }
}
