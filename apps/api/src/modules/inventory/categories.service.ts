import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CategoryNode, UnitOption } from '@erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestUser } from '../../common/types/request-user';
import { wouldCreateCycle } from './category-tree';
import { CreateCategoryDto, CreateUnitDto, UpdateCategoryDto } from './dto/category.dto';
import { snapshot, uniqueViolationField } from './inventory-audit';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Flat list; the client builds the tree from parentId. */
  async list(): Promise<CategoryNode[]> {
    const [rows, counts] = await Promise.all([
      this.prisma.category.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.product.groupBy({ by: ['categoryId'], _count: { _all: true } }),
    ]);
    const countBy = new Map(counts.map((c) => [c.categoryId, c._count._all]));
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      parentId: c.parentId,
      isActive: c.isActive,
      productCount: countBy.get(c.id) ?? 0,
    }));
  }

  async create(dto: CreateCategoryDto, user: RequestUser): Promise<CategoryNode> {
    const parentId = dto.parentId ?? null;
    return this.prisma.$transaction(async (tx) => {
      if (parentId) {
        const parent = await tx.category.findUnique({ where: { id: parentId } });
        if (!parent) throw new BadRequestException('Parent category not found');
        if (!parent.isActive)
          throw new BadRequestException('Cannot add a category under an archived one');
      }
      await this.assertNameFree(tx, dto.name, parentId);
      const created = await tx.category.create({ data: { name: dto.name, parentId } });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'create',
          entity: 'Category',
          entityId: created.id,
          after: snapshot(created),
        },
      });
      return { ...this.toNode(created), productCount: 0 };
    });
  }

  async update(id: string, dto: UpdateCategoryDto, user: RequestUser): Promise<CategoryNode> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.category.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Category not found');

      const parentId = dto.parentId === undefined ? before.parentId : dto.parentId;
      const name = dto.name ?? before.name;

      if (parentId !== before.parentId && parentId) {
        const nodes = await tx.category.findMany({ select: { id: true, parentId: true } });
        if (wouldCreateCycle(nodes, id, parentId)) {
          throw new BadRequestException('A category cannot be moved under itself or its children');
        }
        const parent = await tx.category.findUnique({ where: { id: parentId } });
        if (!parent) throw new BadRequestException('Parent category not found');
        if (!parent.isActive)
          throw new BadRequestException('Cannot move a category under an archived one');
      }
      if (name.toLowerCase() !== before.name.toLowerCase() || parentId !== before.parentId) {
        await this.assertNameFree(tx, name, parentId, id);
      }

      if (dto.isActive === false && before.isActive) {
        const [children, products] = await Promise.all([
          tx.category.count({ where: { parentId: id, isActive: true } }),
          tx.product.count({ where: { categoryId: id, isActive: true } }),
        ]);
        if (children > 0) {
          throw new BadRequestException(
            `Archive or move its ${children} active sub-categor${children === 1 ? 'y' : 'ies'} first`,
          );
        }
        if (products > 0) {
          throw new BadRequestException(
            `Move or archive its ${products} active product${products === 1 ? '' : 's'} first`,
          );
        }
      }
      if (dto.isActive === true && !before.isActive && parentId) {
        const parent = await tx.category.findUnique({ where: { id: parentId } });
        if (parent && !parent.isActive) throw new BadRequestException('Restore the parent first');
      }

      const updated = await tx.category.update({
        where: { id },
        data: { name, parentId, isActive: dto.isActive },
      });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action:
            dto.isActive === false ? 'deactivate' : dto.isActive === true ? 'activate' : 'update',
          entity: 'Category',
          entityId: id,
          before: snapshot(before),
          after: snapshot(updated),
        },
      });
      const productCount = await tx.product.count({ where: { categoryId: id } });
      return { ...this.toNode(updated), productCount };
    });
  }

  async listUnits(): Promise<UnitOption[]> {
    const units = await this.prisma.unit.findMany({ orderBy: { code: 'asc' } });
    return units.map((u) => ({ id: u.id, code: u.code, name: u.name }));
  }

  async createUnit(dto: CreateUnitDto, user: RequestUser): Promise<UnitOption> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const unit = await tx.unit.create({ data: { code: dto.code, name: dto.name } });
        await tx.auditLog.create({
          data: {
            userId: user.id,
            action: 'create',
            entity: 'Unit',
            entityId: unit.id,
            after: snapshot(unit),
          },
        });
        return { id: unit.id, code: unit.code, name: unit.name };
      });
    } catch (err) {
      if (uniqueViolationField(err)) throw new ConflictException('A unit with this code exists');
      throw err;
    }
  }

  /** Case-insensitive; also covers top-level names, which the DB unique index does not (NULL parent). */
  private async assertNameFree(
    tx: Prisma.TransactionClient,
    name: string,
    parentId: string | null,
    exceptId?: string,
  ) {
    const clash = await tx.category.findFirst({
      where: {
        parentId,
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
    });
    if (clash) throw new ConflictException(`A category named "${clash.name}" already exists here`);
  }

  private toNode(c: { id: string; name: string; parentId: string | null; isActive: boolean }) {
    return { id: c.id, name: c.name, parentId: c.parentId, isActive: c.isActive };
  }
}
