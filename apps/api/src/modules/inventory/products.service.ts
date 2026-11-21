import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { barcodeProblem } from '@erp/shared';
import type { PageResult, ProductDetail, ProductListItem } from '@erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../core/audit/audit.service';
import { RequestUser } from '../../common/types/request-user';
import { CreateProductDto, ListProductsQueryDto, UpdateProductDto } from './dto/product.dto';
import {
  applyCostVisibility,
  canChangeBaseUnit,
  canChangeTracking,
  categoryWithDescendants,
  dec,
  emptyToNull,
  isLowStock,
} from './product.rules';
import { ProductCodeService } from './product-code.service';
import { ProductPhotoStorage } from './product-photo.storage';

const listInclude = {
  category: { select: { id: true, name: true } },
  baseUnit: { select: { id: true, code: true } },
} satisfies Prisma.ProductInclude;

const detailInclude = {
  ...listInclude,
  taxRate: true,
  stockBalances: {
    include: { warehouse: { select: { id: true, code: true, name: true } } },
    orderBy: { warehouse: { code: 'asc' } },
  },
} satisfies Prisma.ProductInclude;

type ProductWithList = Prisma.ProductGetPayload<{ include: typeof listInclude }>;
type ProductWithDetail = Prisma.ProductGetPayload<{ include: typeof detailInclude }>;

const ZERO = new Prisma.Decimal(0);

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly codes: ProductCodeService,
    private readonly photos: ProductPhotoStorage,
  ) {}

  // ───────────────────────────── Queries ─────────────────────────────

  async findAll(
    query: ListProductsQueryDto,
    user: RequestUser,
  ): Promise<PageResult<ProductListItem>> {
    const where: Prisma.ProductWhereInput = {};

    if (query.status === 'active') where.isActive = true;
    if (query.status === 'inactive') where.isActive = false;
    if (query.categoryId === 'none') {
      where.categoryId = null;
    } else if (query.categoryId) {
      // A category includes everything filed under its sub-categories.
      const all = await this.prisma.category.findMany({ select: { id: true, parentId: true } });
      where.categoryId = { in: categoryWithDescendants(query.categoryId, all) };
    }

    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { barcode: { equals: search } },
        { units: { some: { barcode: { equals: search } } } },
      ];
    }

    if (query.lowStock) {
      where.id = { in: await this.lowStockProductIds() };
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include: listInclude,
        orderBy: [{ [query.sort]: query.order }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    const onHand = await this.onHandFor(rows.map((r) => r.id));
    const canViewCost = user.permissions.has('inventory.cost.view');

    return {
      items: rows.map((p) =>
        applyCostVisibility(this.toListItem(p, onHand.get(p.id) ?? ZERO), canViewCost),
      ),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async findOne(id: string, user: RequestUser): Promise<ProductDetail> {
    const product = await this.prisma.product.findUnique({ where: { id }, include: detailInclude });
    if (!product) throw new NotFoundException('Product not found');
    const moves = await this.prisma.stockMove.count({ where: { productId: id } });
    return applyCostVisibility(
      this.toDetail(product, moves > 0),
      user.permissions.has('inventory.cost.view'),
    );
  }

  // ───────────────────────────── Commands ─────────────────────────────

  async create(dto: CreateProductDto, user: RequestUser): Promise<ProductDetail> {
    const data = this.normalize(dto);
    await this.assertReferences(data);
    if (data.barcode) {
      this.assertBarcodeValid(data.barcode);
      await this.assertBarcodeFree(data.barcode);
    }

    const created = await this.withUniqueErrors(() =>
      this.prisma.$transaction(async (tx) => {
        // No code typed → take the next automatic one, in this same transaction,
        // so two people creating products at once never get the same code.
        const sku = data.sku || (await this.codes.takeNext(tx));
        const product = await tx.product.create({
          data: {
            sku,
            tracking: data.tracking ?? 'NONE',
            barcode: data.barcode ?? null,
            name: data.name!,
            description: data.description ?? null,
            categoryId: data.categoryId ?? null,
            baseUnitId: data.baseUnitId!,
            taxRateId: data.taxRateId ?? null,
            salePrice: new Prisma.Decimal(data.salePrice!),
            minStock: new Prisma.Decimal(data.minStock ?? '0'),
          },
        });
        await this.audit.log(
          {
            userId: user.id,
            action: 'create',
            entity: 'Product',
            entityId: product.id,
            after: product,
          },
          tx,
        );
        return product;
      }),
    );
    return this.findOne(created.id, user);
  }

  async update(id: string, dto: UpdateProductDto, user: RequestUser): Promise<ProductDetail> {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Product not found');

    const data = this.normalize(dto);
    if (dto.sku !== undefined && !data.sku) {
      throw new BadRequestException('sku: a product must keep a code');
    }
    await this.assertReferences(data);
    // Only a new / changed barcode is checked, so older records can still be edited.
    if (data.barcode && data.barcode !== existing.barcode) {
      this.assertBarcodeValid(data.barcode);
      await this.assertBarcodeFree(data.barcode, id);
    }

    const unitChanges = data.baseUnitId !== undefined && data.baseUnitId !== existing.baseUnitId;
    const trackingChanges = data.tracking !== undefined && data.tracking !== existing.tracking;
    if (unitChanges || trackingChanges) {
      const moves = await this.prisma.stockMove.count({ where: { productId: id } });
      if (!canChangeBaseUnit(existing.baseUnitId, data.baseUnitId, moves)) {
        throw new ConflictException(
          'The base unit cannot be changed: this product already has stock movements recorded in it',
        );
      }
      if (!canChangeTracking(existing.tracking, data.tracking, moves)) {
        throw new ConflictException(
          'Lot / serial tracking cannot be changed: this product already has stock movements',
        );
      }
    }

    await this.withUniqueErrors(() =>
      this.prisma.$transaction(async (tx) => {
        const updated = await tx.product.update({
          where: { id },
          data: {
            sku: data.sku ?? undefined,
            tracking: data.tracking,
            barcode: data.barcode,
            name: data.name,
            description: data.description,
            categoryId: data.categoryId,
            baseUnitId: data.baseUnitId,
            taxRateId: data.taxRateId,
            salePrice:
              data.salePrice !== undefined ? new Prisma.Decimal(data.salePrice) : undefined,
            minStock: data.minStock !== undefined ? new Prisma.Decimal(data.minStock) : undefined,
          },
        });
        await this.audit.log(
          {
            userId: user.id,
            action: 'update',
            entity: 'Product',
            entityId: id,
            before: existing,
            after: updated,
          },
          tx,
        );
      }),
    );
    return this.findOne(id, user);
  }

  /** Soft-delete: the product stays in history but can no longer be picked on new documents. */
  setActive(id: string, isActive: boolean, user: RequestUser): Promise<ProductDetail> {
    return this.prisma
      .$transaction(async (tx) => {
        const existing = await tx.product.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException('Product not found');
        if (existing.isActive === isActive) return; // idempotent, nothing to audit
        const updated = await tx.product.update({ where: { id }, data: { isActive } });
        await this.audit.log(
          {
            userId: user.id,
            action: isActive ? 'activate' : 'deactivate',
            entity: 'Product',
            entityId: id,
            before: { isActive: existing.isActive },
            after: { isActive: updated.isActive },
          },
          tx,
        );
      })
      .then(() => this.findOne(id, user));
  }

  // ───────────────────────────── Photo ─────────────────────────────

  /** Replaces the product photo. The file is checked by content, not by its name. */
  async setPhoto(id: string, file: Buffer, user: RequestUser): Promise<ProductDetail> {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Product not found');

    const fileName = await this.photos.save(id, file); // throws 400 if not an image
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.product.update({ where: { id }, data: { photoPath: fileName } });
        await this.audit.log(
          {
            userId: user.id,
            action: 'photo.update',
            entity: 'Product',
            entityId: id,
            before: { photoPath: existing.photoPath },
            after: { photoPath: fileName },
          },
          tx,
        );
      });
    } catch (e) {
      await this.photos.remove(fileName); // don't leave an orphan file behind
      throw e;
    }
    if (existing.photoPath) await this.photos.remove(existing.photoPath);
    return this.findOne(id, user);
  }

  async removePhoto(id: string, user: RequestUser): Promise<ProductDetail> {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Product not found');
    if (existing.photoPath) {
      await this.prisma.$transaction(async (tx) => {
        await tx.product.update({ where: { id }, data: { photoPath: null } });
        await this.audit.log(
          {
            userId: user.id,
            action: 'photo.remove',
            entity: 'Product',
            entityId: id,
            before: { photoPath: existing.photoPath },
            after: { photoPath: null },
          },
          tx,
        );
      });
      await this.photos.remove(existing.photoPath);
    }
    return this.findOne(id, user);
  }

  async getPhoto(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: { photoPath: true },
    });
    if (!product?.photoPath) throw new NotFoundException('This product has no photo');
    return this.photos.open(product.photoPath);
  }

  // ───────────────────────────── Helpers ─────────────────────────────

  private normalize<T extends Partial<CreateProductDto>>(dto: T): T {
    return {
      ...dto,
      sku: emptyToNull(dto.sku),
      barcode: emptyToNull(dto.barcode),
      description: emptyToNull(dto.description),
      categoryId: emptyToNull(dto.categoryId),
      taxRateId: emptyToNull(dto.taxRateId),
    };
  }

  /** Clear 400s instead of foreign-key errors, and no linking to inactive records. */
  private async assertReferences(data: Partial<CreateProductDto>) {
    if (data.baseUnitId) {
      const unit = await this.prisma.unit.findUnique({ where: { id: data.baseUnitId } });
      if (!unit) throw new BadRequestException('baseUnitId: unit not found');
    }
    if (data.categoryId) {
      const category = await this.prisma.category.findUnique({ where: { id: data.categoryId } });
      if (!category) throw new BadRequestException('categoryId: category not found');
      if (!category.isActive) throw new BadRequestException('categoryId: category is inactive');
    }
    if (data.taxRateId) {
      const tax = await this.prisma.taxRate.findUnique({ where: { id: data.taxRateId } });
      if (!tax) throw new BadRequestException('taxRateId: tax rate not found');
      if (!tax.isActive) throw new BadRequestException('taxRateId: tax rate is inactive');
    }
  }

  /** EAN / UPC barcodes must have a correct check digit (same rule as the web form). */
  private assertBarcodeValid(barcode: string) {
    const problem = barcodeProblem(barcode);
    if (problem) throw new BadRequestException(`barcode: ${problem}`);
  }

  /** A barcode must be unique across products AND their packaging units (scanner lookups). */
  private async assertBarcodeFree(barcode: string, exceptProductId?: string) {
    const [product, packaging] = await Promise.all([
      this.prisma.product.findFirst({
        where: { barcode, ...(exceptProductId && { id: { not: exceptProductId } }) },
        select: { sku: true },
      }),
      this.prisma.productUnit.findFirst({
        where: { barcode },
        select: { product: { select: { sku: true } } },
      }),
    ]);
    const owner = product?.sku ?? packaging?.product.sku;
    if (owner)
      throw new ConflictException(`Barcode ${barcode} is already used by product ${owner}`);
  }

  /** Turns unique-constraint violations (race conditions included) into 409s. */
  private async withUniqueErrors<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const target = String((e.meta?.target as string[] | undefined)?.join(', ') ?? 'field');
        throw new ConflictException(
          target.includes('sku')
            ? 'This SKU is already used by another product'
            : `Duplicate value: ${target}`,
        );
      }
      throw e;
    }
  }

  private async onHandFor(productIds: string[]): Promise<Map<string, Prisma.Decimal>> {
    if (productIds.length === 0) return new Map();
    const sums = await this.prisma.stockBalance.groupBy({
      by: ['productId'],
      where: { productId: { in: productIds } },
      _sum: { quantity: true },
    });
    return new Map(sums.map((s) => [s.productId, s._sum.quantity ?? ZERO]));
  }

  /** Same rule as isLowStock(): below a set minimum, or negative. Keep the two in sync. */
  private async lowStockProductIds(): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT p.id
      FROM products p
      LEFT JOIN stock_balances b ON b.product_id = p.id
      GROUP BY p.id, p.min_stock
      HAVING COALESCE(SUM(b.quantity), 0) < 0
          OR (p.min_stock > 0 AND COALESCE(SUM(b.quantity), 0) < p.min_stock)`;
    return rows.map((r) => r.id);
  }

  private toListItem(p: ProductWithList, onHand: Prisma.Decimal): ProductListItem {
    return {
      id: p.id,
      sku: p.sku,
      barcode: p.barcode,
      name: p.name,
      category: p.category,
      baseUnit: p.baseUnit,
      salePrice: dec(p.salePrice),
      averageCost: dec(p.averageCost),
      minStock: dec(p.minStock),
      onHand: dec(onHand),
      isLowStock: isLowStock(onHand, p.minStock),
      tracking: p.tracking,
      // The version query string changes when the photo changes, so browsers never show a stale one.
      photoUrl: p.photoPath
        ? `/inventory/products/${p.id}/photo?v=${encodeURIComponent(p.photoPath)}`
        : null,
      isActive: p.isActive,
    };
  }

  private toDetail(p: ProductWithDetail, hasStockHistory: boolean): ProductDetail {
    const onHand = p.stockBalances.reduce((sum, b) => sum.plus(b.quantity), ZERO);
    return {
      ...this.toListItem(p, onHand),
      description: p.description,
      taxRate: p.taxRate
        ? { id: p.taxRate.id, name: p.taxRate.name, rate: p.taxRate.rate.toFixed(2) }
        : null,
      stock: p.stockBalances.map((b) => ({ warehouse: b.warehouse, quantity: dec(b.quantity) })),
      hasStockHistory,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  }
}
