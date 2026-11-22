import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CategoryDto, ProductFormOptions, UnitDto } from '@erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestUser } from '../../common/types/request-user';
import { CreateCategoryDto, CreateUnitDto, UpdateCategoryDto } from './dto/catalog.dto';
import { rethrowPrismaError, toAuditJson } from './prisma-errors';

const categorySelect = { id: true, name: true, parentId: true, isActive: true } as const;
const unitSelect = { id: true, code: true, name: true } as const;

/** Units of measure, product categories and the lookups the product form needs. */
@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  listUnits(): Promise<UnitDto[]> {
    return this.prisma.unit.findMany({ select: unitSelect, orderBy: { code: 'asc' } });
  }

  async createUnit(dto: CreateUnitDto, user: RequestUser): Promise<UnitDto> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const unit = await tx.unit.create({ data: dto, select: unitSelect });
        await tx.auditLog.create({
          data: {
            userId: user.id,
            action: 'create',
            entity: 'Unit',
            entityId: unit.id,
            after: toAuditJson(unit),
          },
        });
        return unit;
      });
    } catch (err) {
      rethrowPrismaError(err, 'Unit');
    }
  }

  /** Flat list, sorted by name; the client builds the tree from parentId. */
  listCategories(includeInactive = false): Promise<CategoryDto[]> {
    return this.prisma.category.findMany({
      where: includeInactive ? {} : { isActive: true },
      select: categorySelect,
      orderBy: { name: 'asc' },
    });
  }

  async createCategory(dto: CreateCategoryDto, user: RequestUser): Promise<CategoryDto> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Postgres treats NULLs as distinct, so @@unique([parentId, name]) does not
        // catch duplicate top-level names: check them here.
        await assertNameFree(tx, dto.name, dto.parentId ?? null);
        const category = await tx.category.create({
          data: { name: dto.name, parentId: dto.parentId ?? null },
          select: categorySelect,
        });
        await tx.auditLog.create({
          data: {
            userId: user.id,
            action: 'create',
            entity: 'Category',
            entityId: category.id,
            after: toAuditJson(category),
          },
        });
        return category;
      });
    } catch (err) {
      rethrowPrismaError(err, 'Category');
    }
  }

  async updateCategory(
    id: string,
    dto: UpdateCategoryDto,
    user: RequestUser,
  ): Promise<CategoryDto> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const before = await tx.category.findUnique({ where: { id }, select: categorySelect });
        if (!before) throw new NotFoundException('Category not found');

        const parentId = dto.parentId !== undefined ? dto.parentId : before.parentId;
        if (parentId) await assertNoCycle(tx, id, parentId);
        const name = dto.name ?? before.name;
        if (name !== before.name || parentId !== before.parentId) {
          await assertNameFree(tx, name, parentId, id);
        }

        const after = await tx.category.update({
          where: { id },
          data: { name: dto.name, parentId: dto.parentId, isActive: dto.isActive },
          select: categorySelect,
        });
        await tx.auditLog.create({
          data: {
            userId: user.id,
            action: 'update',
            entity: 'Category',
            entityId: id,
            before: toAuditJson(before),
            after: toAuditJson(after),
          },
        });
        return after;
      });
    } catch (err) {
      rethrowPrismaError(err, 'Category');
    }
  }

  async formOptions(): Promise<ProductFormOptions> {
    const [units, categories, taxRates] = await Promise.all([
      this.listUnits(),
      this.listCategories(),
      this.prisma.taxRate.findMany({
        where: { isActive: true },
        select: { id: true, name: true, rate: true },
        orderBy: { rate: 'asc' },
      }),
    ]);
    return {
      units,
      categories,
      taxRates: taxRates.map((t) => ({ ...t, rate: t.rate.toFixed(2) })),
    };
  }
}

type Tx = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

async function assertNameFree(tx: Tx, name: string, parentId: string | null, exceptId?: string) {
  const clash = await tx.category.findFirst({
    where: {
      name: { equals: name, mode: 'insensitive' },
      parentId,
      ...(exceptId && { id: { not: exceptId } }),
    },
    select: { id: true },
  });
  if (clash) throw new ConflictException('A category with this name already exists here');
}

/** A category cannot be moved under itself or one of its descendants. */
async function assertNoCycle(tx: Tx, id: string, newParentId: string) {
  let current: string | null = newParentId;
  for (let depth = 0; current && depth < 100; depth++) {
    if (current === id) {
      throw new BadRequestException('A category cannot be placed under itself');
    }
    const parent: { parentId: string | null } | null = await tx.category.findUnique({
      where: { id: current },
      select: { parentId: true },
    });
    if (!parent) throw new BadRequestException('Unknown parent category');
    current = parent.parentId;
  }
}
