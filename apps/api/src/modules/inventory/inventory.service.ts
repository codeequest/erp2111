import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../core/audit/audit.service';
import { RequestUser } from '../../common/types/request-user';
import { CreateCategoryDto, CreateUnitDto, UpdateCategoryDto } from './dto/product.dto';
import { rethrowPrismaError } from './prisma-errors';

/**
 * Inventory reference data: categories and units.
 * Products live in ProductsService. Remember:
 *  - wrap every operation that touches stock or money in this.prisma.$transaction(...)
 *  - write an AuditLog row for every create / update / status change
 */
@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Categories ──

  async listCategories() {
    const rows = await this.prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { products: { where: { parentId: null } } } } },
    });
    return rows.map(({ _count, ...c }) => ({ ...c, productCount: _count.products }));
  }

  async createCategory(dto: CreateCategoryDto, user: RequestUser) {
    try {
      const created = await this.prisma.category.create({
        data: { name: dto.name.trim(), parentId: dto.parentId ?? null },
      });
      await this.audit.record({
        userId: user.id,
        action: 'create',
        entity: 'Category',
        entityId: created.id,
        after: created,
      });
      return created;
    } catch (e) {
      rethrowPrismaError(e);
    }
  }

  async updateCategory(id: string, dto: UpdateCategoryDto, user: RequestUser) {
    const before = await this.prisma.category.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Category not found');
    if (dto.parentId && (await this.isSelfOrDescendant(id, dto.parentId))) {
      throw new BadRequestException('A category cannot be moved under itself or its children');
    }
    try {
      const after = await this.prisma.category.update({
        where: { id },
        data: {
          name: dto.name?.trim(),
          parentId: dto.parentId === undefined ? undefined : dto.parentId,
          isActive: dto.isActive,
        },
      });
      await this.audit.record({
        userId: user.id,
        action: 'update',
        entity: 'Category',
        entityId: id,
        before,
        after,
      });
      return after;
    } catch (e) {
      rethrowPrismaError(e);
    }
  }

  /** True when `candidateId` is `id` itself or one of its descendants. */
  private async isSelfOrDescendant(id: string, candidateId: string): Promise<boolean> {
    let current: string | null = candidateId;
    for (let depth = 0; current && depth < 50; depth++) {
      if (current === id) return true;
      const row: { parentId: string | null } | null = await this.prisma.category.findUnique({
        where: { id: current },
        select: { parentId: true },
      });
      current = row?.parentId ?? null;
    }
    return false;
  }

  // ── Units ──

  listUnits() {
    return this.prisma.unit.findMany({ orderBy: { code: 'asc' } });
  }

  async createUnit(dto: CreateUnitDto, user: RequestUser) {
    try {
      const created = await this.prisma.unit.create({
        data: { code: dto.code, name: dto.name.trim() },
      });
      await this.audit.record({
        userId: user.id,
        action: 'create',
        entity: 'Unit',
        entityId: created.id,
        after: created,
      });
      return created;
    } catch (e) {
      rethrowPrismaError(e);
    }
  }
}
