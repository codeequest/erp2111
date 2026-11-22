import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RequestUser } from '../../common/types/request-user';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateCategoryDto,
  CreateProductDto,
  CreateUnitDto,
  ListProductsQuery,
  UpdateCategoryDto,
  UpdateProductDto,
} from './dto/product.dto';

const PRODUCT_INCLUDE = {
  category: { select: { id: true, name: true } },
  baseUnit: { select: { id: true, code: true, name: true } },
  taxRate: { select: { id: true, name: true, rate: true } },
} satisfies Prisma.ProductInclude;

/** USD → TND rate used to fill the missing price (override with USD_TND_RATE). */
export const usdTndRate = () => Number(process.env.USD_TND_RATE) || 3.1;

/** If only one of the two prices is given, derive the other with the exchange rate. */
export function completePrices<T extends { salePrice?: number; salePriceTnd?: number }>(dto: T): T {
  const rate = usdTndRate();
  const usd = dto.salePrice;
  const tnd = dto.salePriceTnd;
  if (usd && !tnd) return { ...dto, salePriceTnd: Math.round(usd * rate * 1000) / 1000 };
  if (tnd && !usd) return { ...dto, salePrice: Math.round((tnd / rate) * 100) / 100 };
  return dto;
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---------- products (scooters) ----------

  /** Average cost is only visible with inventory.cost.view. */
  private hideCost<T extends { averageCost?: unknown }>(p: T, user: RequestUser) {
    if (user.permissions.has('inventory.cost.view')) return p;
    const { averageCost: _cost, ...rest } = p;
    return rest;
  }

  async listProducts(q: ListProductsQuery, user: RequestUser) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const where: Prisma.ProductWhereInput = {};
    if (q.active !== 'all') where.isActive = q.active !== 'false';
    if (q.categoryId) {
      // a parent category also matches the products of its sub-categories
      const all = await this.prisma.category.findMany({ select: { id: true, parentId: true } });
      const ids = new Set([q.categoryId]);
      for (let grew = true; grew; ) {
        grew = false;
        for (const c of all)
          if (c.parentId && ids.has(c.parentId) && !ids.has(c.id)) ids.add(c.id), (grew = true);
      }
      where.categoryId = { in: [...ids] };
    }
    if (q.brand) where.brand = { equals: q.brand, mode: 'insensitive' };
    if (q.condition) where.condition = q.condition;
    if (q.search?.trim()) {
      const s = q.search.trim();
      where.OR = [
        { name: { contains: s, mode: 'insensitive' } },
        { sku: { contains: s, mode: 'insensitive' } },
        { barcode: { contains: s, mode: 'insensitive' } },
        { brand: { contains: s, mode: 'insensitive' } },
        { model: { contains: s, mode: 'insensitive' } },
        { category: { name: { contains: s, mode: 'insensitive' } } },
      ];
    }
    const [total, items] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include: PRODUCT_INCLUDE,
        orderBy: [{ brand: 'asc' }, { name: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { items: items.map((p) => this.hideCost(p, user)), total, page, pageSize };
  }

  async getProduct(id: string, user: RequestUser) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: PRODUCT_INCLUDE,
    });
    if (!product) throw new NotFoundException('Product not found');
    return this.hideCost(product, user);
  }

  async createProduct(dto: CreateProductDto, user: RequestUser) {
    await this.assertRefs(dto);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const product = await tx.product.create({
          data: { ...completePrices(dto), barcode: dto.barcode || undefined },
          include: PRODUCT_INCLUDE,
        });
        await this.audit.log(
          { userId: user.id, action: 'create', entity: 'Product', entityId: product.id, after: product },
          tx,
        );
        return this.hideCost(product, user);
      });
    } catch (e) {
      throw this.mapUniqueError(e);
    }
  }

  async updateProduct(id: string, dto: UpdateProductDto, user: RequestUser) {
    const before = await this.prisma.product.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Product not found');
    await this.assertRefs(dto);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const product = await tx.product.update({
          where: { id },
          data: { ...completePrices(dto), barcode: dto.barcode === '' ? null : dto.barcode },
          include: PRODUCT_INCLUDE,
        });
        await this.audit.log(
          { userId: user.id, action: 'update', entity: 'Product', entityId: id, before, after: product },
          tx,
        );
        return this.hideCost(product, user);
      });
    } catch (e) {
      throw this.mapUniqueError(e);
    }
  }

  async setProductActive(id: string, isActive: boolean, user: RequestUser) {
    const before = await this.prisma.product.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Product not found');
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.update({
        where: { id },
        data: { isActive },
        include: PRODUCT_INCLUDE,
      });
      await this.audit.log(
        {
          userId: user.id,
          action: isActive ? 'activate' : 'deactivate',
          entity: 'Product',
          entityId: id,
          before: { isActive: before.isActive },
          after: { isActive },
        },
        tx,
      );
      return this.hideCost(product, user);
    });
  }

  private async assertRefs(dto: {
    categoryId?: string | null;
    baseUnitId?: string;
    taxRateId?: string | null;
  }) {
    if (dto.baseUnitId && !(await this.prisma.unit.findUnique({ where: { id: dto.baseUnitId } })))
      throw new BadRequestException('Unknown base unit');
    if (dto.categoryId && !(await this.prisma.category.findUnique({ where: { id: dto.categoryId } })))
      throw new BadRequestException('Unknown category');
    if (dto.taxRateId && !(await this.prisma.taxRate.findUnique({ where: { id: dto.taxRateId } })))
      throw new BadRequestException('Unknown tax rate');
  }

  private mapUniqueError(e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const target = (e.meta?.target as string[] | undefined)?.join(', ') ?? 'value';
      return new ConflictException(`A record with this ${target} already exists`);
    }
    return e;
  }

  // ---------- units ----------

  listUnits() {
    return this.prisma.unit.findMany({ orderBy: { code: 'asc' } });
  }

  async createUnit(dto: CreateUnitDto, user: RequestUser) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const unit = await tx.unit.create({
          data: { code: dto.code.toUpperCase(), name: dto.name },
        });
        await this.audit.log(
          { userId: user.id, action: 'create', entity: 'Unit', entityId: unit.id, after: unit },
          tx,
        );
        return unit;
      });
    } catch (e) {
      throw this.mapUniqueError(e);
    }
  }

  // ---------- categories ----------

  listCategories() {
    return this.prisma.category.findMany({ orderBy: { name: 'asc' } });
  }

  async createCategory(dto: CreateCategoryDto, user: RequestUser) {
    if (dto.parentId && !(await this.prisma.category.findUnique({ where: { id: dto.parentId } })))
      throw new BadRequestException('Unknown parent category');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const cat = await tx.category.create({ data: dto });
        await this.audit.log(
          { userId: user.id, action: 'create', entity: 'Category', entityId: cat.id, after: cat },
          tx,
        );
        return cat;
      });
    } catch (e) {
      throw this.mapUniqueError(e);
    }
  }

  async updateCategory(id: string, dto: UpdateCategoryDto, user: RequestUser) {
    const before = await this.prisma.category.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Category not found');
    if (dto.parentId === id) throw new BadRequestException('A category cannot be its own parent');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const cat = await tx.category.update({ where: { id }, data: dto });
        await this.audit.log(
          { userId: user.id, action: 'update', entity: 'Category', entityId: id, before, after: cat },
          tx,
        );
        return cat;
      });
    } catch (e) {
      throw this.mapUniqueError(e);
    }
  }
}
