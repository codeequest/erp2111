import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CategoryDto, TaxRateDto, UnitDto } from '@erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../core/audit/audit.service';
import { RequestUser } from '../../common/types/request-user';
import { CreateCategoryDto, CreateUnitDto, UpdateCategoryDto } from './dto/reference.dto';
import { emptyToNull, wouldCreateCategoryCycle } from './product.rules';

/**
 * Inventory reference data: units of measure, categories, tax-rate lookup.
 * Products live in ProductsService; stock, warehouses and transfers come next.
 *
 * Remember:
 *  - wrap every operation that touches stock or money in this.prisma.$transaction(...)
 *  - write an AuditLog row for every create / update / status change
 */
@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ─────────────── Units ───────────────

  listUnits(): Promise<UnitDto[]> {
    return this.prisma.unit.findMany({
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    });
  }

  async createUnit(dto: CreateUnitDto, user: RequestUser): Promise<UnitDto> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const unit = await tx.unit.create({
          data: { code: dto.code, name: dto.name },
          select: { id: true, code: true, name: true },
        });
        await this.audit.log(
          { userId: user.id, action: 'create', entity: 'Unit', entityId: unit.id, after: unit },
          tx,
        );
        return unit;
      });
    } catch (e) {
      throw this.uniqueToConflict(e, `Unit code ${dto.code} already exists`);
    }
  }

  // ─────────────── Categories ───────────────

  /** Flat list ordered by name; the client builds the tree from parentId. */
  listCategories(includeInactive = false): Promise<CategoryDto[]> {
    return this.prisma.category.findMany({
      where: includeInactive ? {} : { isActive: true },
      select: { id: true, name: true, parentId: true, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async createCategory(dto: CreateCategoryDto, user: RequestUser): Promise<CategoryDto> {
    const parentId = emptyToNull(dto.parentId) ?? null;
    if (parentId) await this.assertCategoryExists(parentId);
    await this.assertCategoryNameFree(dto.name, parentId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const category = await tx.category.create({
          data: { name: dto.name, parentId },
          select: { id: true, name: true, parentId: true, isActive: true },
        });
        await this.audit.log(
          {
            userId: user.id,
            action: 'create',
            entity: 'Category',
            entityId: category.id,
            after: category,
          },
          tx,
        );
        return category;
      });
    } catch (e) {
      throw this.uniqueToConflict(e, `A category named "${dto.name}" already exists at this level`);
    }
  }

  async updateCategory(
    id: string,
    dto: UpdateCategoryDto,
    user: RequestUser,
  ): Promise<CategoryDto> {
    const existing = await this.prisma.category.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Category not found');

    const parentId = dto.parentId === undefined ? undefined : (emptyToNull(dto.parentId) ?? null);
    if (parentId) {
      await this.assertCategoryExists(parentId);
      const all = await this.prisma.category.findMany({ select: { id: true, parentId: true } });
      const parentOf = new Map(all.map((c) => [c.id, c.parentId]));
      if (wouldCreateCategoryCycle(id, parentId, parentOf)) {
        throw new BadRequestException(
          'A category cannot be moved under itself or one of its sub-categories',
        );
      }
    }
    if (dto.name !== undefined || parentId !== undefined) {
      await this.assertCategoryNameFree(
        dto.name ?? existing.name,
        parentId === undefined ? existing.parentId : parentId,
        id,
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.category.update({
          where: { id },
          data: { name: dto.name, parentId, isActive: dto.isActive },
          select: { id: true, name: true, parentId: true, isActive: true },
        });
        await this.audit.log(
          {
            userId: user.id,
            action: 'update',
            entity: 'Category',
            entityId: id,
            before: existing,
            after: updated,
          },
          tx,
        );
        return updated;
      });
    } catch (e) {
      throw this.uniqueToConflict(e, 'A category with this name already exists at this level');
    }
  }

  // ─────────────── Tax rates (read-only lookup for product forms) ───────────────

  async listActiveTaxRates(): Promise<TaxRateDto[]> {
    const rates = await this.prisma.taxRate.findMany({
      where: { isActive: true },
      orderBy: { rate: 'asc' },
    });
    return rates.map((r) => ({ id: r.id, name: r.name, rate: r.rate.toFixed(2) }));
  }

  // ─────────────── Helpers ───────────────

  private async assertCategoryExists(id: string) {
    const parent = await this.prisma.category.findUnique({ where: { id } });
    if (!parent) throw new BadRequestException('parentId: category not found');
  }

  /**
   * The DB unique index (parentId, name) does not catch duplicates at the top level,
   * because PostgreSQL treats NULL parentIds as distinct. Check explicitly (case-insensitive).
   */
  private async assertCategoryNameFree(name: string, parentId: string | null, exceptId?: string) {
    const clash = await this.prisma.category.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        parentId,
        ...(exceptId && { id: { not: exceptId } }),
      },
      select: { id: true },
    });
    if (clash)
      throw new ConflictException(`A category named "${name}" already exists at this level`);
  }

  private uniqueToConflict(e: unknown, message: string): unknown {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return new ConflictException(message);
    }
    return e;
  }
}
