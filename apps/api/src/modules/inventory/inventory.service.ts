import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestUser } from '../../common/types/request-user';
import {
  CreateCategoryDto,
  CreateProductDto,
  CreateUnitDto,
  ListProductsQueryDto,
  UpdateCategoryDto,
  UpdateProductDto,
} from './dto/product.dto';
import {
  CategoryNode,
  categoryPath,
  descendantIds,
  marginPercent,
  priceInclTax,
  stockStatus,
  wouldCreateCycle,
} from './product-rules';

type Tx = Prisma.TransactionClient;
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const ZERO = D(0);

const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
/** `<product uuid>-<timestamp>.<ext>` — the only file names the image route serves. */
export const IMAGE_FILE_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-\d+\.(jpg|png|webp|gif)$/;

export interface UploadedImage {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

const productInclude = {
  category: { select: { id: true, name: true, parentId: true } },
  baseUnit: { select: { id: true, code: true, name: true } },
  taxRate: { select: { id: true, name: true, rate: true } },
} satisfies Prisma.ProductInclude;

type ProductRow = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

/**
 * Inventory business logic: products, categories and units.
 *  - every create / update / status change writes an AuditLog row in the same transaction
 *  - opening stock is written as a StockMove + StockBalance in one transaction
 *  - purchase price and average cost are only returned with inventory.cost.view
 */
@Injectable()
export class InventoryService {
  private readonly uploadDir: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.uploadDir = join(
      config.get<string>('UPLOAD_DIR') ?? join(process.cwd(), 'uploads'),
      'products',
    );
  }

  // ───────────────────────────── Products ─────────────────────────────

  async listProducts(query: ListProductsQueryDto, user: RequestUser) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const status = query.status ?? 'active';
    const sort = query.sort ?? 'name';
    const order = query.order ?? 'asc';

    const where: Prisma.ProductWhereInput = {};
    if (status !== 'all') where.isActive = status === 'active';
    if (query.search) {
      const contains = query.search;
      where.OR = [
        { name: { contains, mode: 'insensitive' } },
        { sku: { contains, mode: 'insensitive' } },
        { barcode: { contains, mode: 'insensitive' } },
        { description: { contains, mode: 'insensitive' } },
      ];
    }
    const categories = await this.categoryNodes();
    if (query.categoryId) {
      where.categoryId = { in: descendantIds(query.categoryId, categories) };
    }

    // Stock status depends on the summed balances, so filter / sort on the light rows first,
    // then load the full rows of the requested page only.
    const light = await this.prisma.product.findMany({
      where,
      select: { id: true, name: true, sku: true, salePrice: true, minStock: true, updatedAt: true },
    });
    const onHand = await this.onHandByProduct(light.map((p) => p.id));
    const withStock = light.map((p) => {
      const qty = onHand.get(p.id) ?? ZERO;
      return { ...p, onHand: qty, status: stockStatus(qty, p.minStock) };
    });

    const summary = {
      total: withStock.length,
      low: withStock.filter((p) => p.status === 'low').length,
      out: withStock.filter((p) => p.status === 'out').length,
    };

    const stockFilter = query.stock ?? 'all';
    const filtered =
      stockFilter === 'all' ? withStock : withStock.filter((p) => p.status === stockFilter);

    const dir = order === 'asc' ? 1 : -1;
    filtered.sort((a, b) => {
      let c = 0;
      if (sort === 'name') c = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      else if (sort === 'sku') c = a.sku.localeCompare(b.sku);
      else if (sort === 'salePrice') c = a.salePrice.comparedTo(b.salePrice);
      else if (sort === 'onHand') c = a.onHand.comparedTo(b.onHand);
      else c = a.updatedAt.getTime() - b.updatedAt.getTime();
      return c * dir || a.name.localeCompare(b.name);
    });

    const pageIds = filtered.slice((page - 1) * pageSize, page * pageSize).map((p) => p.id);
    const rows = await this.prisma.product.findMany({
      where: { id: { in: pageIds } },
      include: productInclude,
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const catById = new Map(categories.map((c) => [c.id, c]));

    return {
      items: pageIds.map((id) =>
        this.toProduct(byId.get(id)!, onHand.get(id) ?? ZERO, user, catById),
      ),
      total: filtered.length,
      page,
      pageSize,
      summary,
    };
  }

  async getProduct(id: string, user: RequestUser) {
    const row = await this.prisma.product.findUnique({ where: { id }, include: productInclude });
    if (!row) throw new NotFoundException('Product not found');

    const [balances, moves, categories] = await Promise.all([
      this.prisma.stockBalance.findMany({
        where: { productId: id },
        include: { warehouse: { select: { id: true, code: true, name: true } } },
        orderBy: { warehouse: { code: 'asc' } },
      }),
      user.permissions.has('inventory.stock.read')
        ? this.prisma.stockMove.findMany({
            where: { productId: id },
            include: { warehouse: { select: { code: true } } },
            orderBy: { createdAt: 'desc' },
            take: 10,
          })
        : Promise.resolve([]),
      this.categoryNodes(),
    ]);
    const onHand = balances.reduce((sum, b) => sum.add(b.quantity), ZERO);
    const canSeeCost = user.permissions.has('inventory.cost.view');

    return {
      ...this.toProduct(row, onHand, user, new Map(categories.map((c) => [c.id, c]))),
      stockByWarehouse: balances.map((b) => ({
        warehouse: b.warehouse,
        quantity: b.quantity.toString(),
      })),
      recentMoves: moves.map((m) => ({
        id: m.id,
        type: m.type,
        warehouse: m.warehouse.code,
        quantity: m.quantity.toString(),
        unitCost: canSeeCost ? m.unitCost.toString() : undefined,
        reference: m.reference,
        reason: m.reason,
        createdAt: m.createdAt,
      })),
    };
  }

  /** Everything the product form needs in one call. */
  async productFormOptions(user: RequestUser) {
    const canPickWarehouse =
      user.permissions.has('inventory.stock.adjust') ||
      user.permissions.has('inventory.stock.read');
    const [categories, units, taxRates, warehouses] = await Promise.all([
      this.listCategories(false),
      this.prisma.unit.findMany({ orderBy: { code: 'asc' } }),
      this.prisma.taxRate.findMany({ where: { isActive: true }, orderBy: { rate: 'asc' } }),
      canPickWarehouse
        ? this.prisma.warehouse.findMany({
            where: { isActive: true },
            select: { id: true, code: true, name: true },
            orderBy: { code: 'asc' },
          })
        : Promise.resolve([]),
    ]);
    return {
      categories,
      units,
      taxRates: taxRates.map((t) => ({ id: t.id, name: t.name, rate: t.rate.toString() })),
      warehouses,
    };
  }

  async createProduct(dto: CreateProductDto, user: RequestUser) {
    const canSeeCost = user.permissions.has('inventory.cost.view');
    if (dto.purchasePrice !== undefined && !canSeeCost) {
      throw new ForbiddenException('Setting the purchase price requires inventory.cost.view');
    }
    const initialStock = dto.initialStock ? D(dto.initialStock) : ZERO;
    if (initialStock.gt(0) && !user.permissions.has('inventory.stock.adjust')) {
      throw new ForbiddenException('Setting an opening stock requires inventory.stock.adjust');
    }

    const baseUnitId = dto.baseUnitId ?? (await this.defaultUnitId());
    await this.assertReferences({ ...dto, baseUnitId });
    const purchasePrice = D(dto.purchasePrice ?? 0);

    const id = await this.prisma.$transaction(async (tx) => {
      const warehouseId = initialStock.gt(0)
        ? await this.resolveWarehouse(tx, dto.warehouseId)
        : null;

      const product = await tx.product
        .create({
          data: {
            name: dto.name,
            sku: dto.sku,
            barcode: dto.barcode ?? null,
            description: dto.description ?? null,
            imageUrl: dto.imageUrl ?? null,
            categoryId: dto.categoryId ?? null,
            baseUnitId,
            taxRateId: dto.taxRateId ?? null,
            purchasePrice,
            salePrice: D(dto.salePrice ?? 0),
            minStock: D(dto.minStock ?? 0),
            // The opening stock is valued at the purchase price.
            averageCost: initialStock.gt(0) ? purchasePrice : ZERO,
          },
        })
        .catch((e) => this.rethrowUnique(e));

      if (warehouseId) {
        await tx.stockMove.create({
          data: {
            productId: product.id,
            warehouseId,
            type: 'OPENING',
            quantity: initialStock,
            unitCost: purchasePrice,
            sourceType: 'Product',
            sourceId: product.id,
            reference: `Opening stock ${product.sku}`,
            reason: 'Opening stock on product creation',
            createdById: user.id,
          },
        });
        await tx.stockBalance.upsert({
          where: { productId_warehouseId: { productId: product.id, warehouseId } },
          create: { productId: product.id, warehouseId, quantity: initialStock },
          update: { quantity: { increment: initialStock } },
        });
      }

      await this.audit(tx, user, 'create', 'Product', product.id, null, product);
      return product.id;
    });

    return this.getProduct(id, user);
  }

  async updateProduct(id: string, dto: UpdateProductDto, user: RequestUser) {
    if (dto.initialStock !== undefined || dto.warehouseId !== undefined) {
      throw new BadRequestException(
        'Stock cannot be changed from the product form — post a stock adjustment instead',
      );
    }
    if (dto.purchasePrice !== undefined && !user.permissions.has('inventory.cost.view')) {
      throw new ForbiddenException('Changing the purchase price requires inventory.cost.view');
    }
    const before = await this.prisma.product.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Product not found');
    await this.assertReferences(dto);

    const data: Prisma.ProductUncheckedUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.sku !== undefined) data.sku = dto.sku;
    if (dto.barcode !== undefined) data.barcode = dto.barcode;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.imageUrl !== undefined) data.imageUrl = dto.imageUrl;
    if (dto.categoryId !== undefined) data.categoryId = dto.categoryId;
    if (dto.baseUnitId !== undefined) data.baseUnitId = dto.baseUnitId;
    if (dto.taxRateId !== undefined) data.taxRateId = dto.taxRateId;
    if (dto.purchasePrice !== undefined) data.purchasePrice = D(dto.purchasePrice);
    if (dto.salePrice !== undefined) data.salePrice = D(dto.salePrice);
    if (dto.minStock !== undefined) data.minStock = D(dto.minStock);

    if (
      dto.baseUnitId !== undefined &&
      dto.baseUnitId !== before.baseUnitId &&
      (await this.prisma.stockMove.count({ where: { productId: id } })) > 0
    ) {
      throw new BadRequestException(
        'The base unit cannot change once the product has stock movements',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const after = await tx.product
        .update({ where: { id }, data })
        .catch((e) => this.rethrowUnique(e));
      await this.audit(tx, user, 'update', 'Product', id, before, after);
    });
    return this.getProduct(id, user);
  }

  async setProductActive(id: string, isActive: boolean, user: RequestUser) {
    const before = await this.prisma.product.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Product not found');
    if (before.isActive !== isActive) {
      await this.prisma.$transaction(async (tx) => {
        const after = await tx.product.update({ where: { id }, data: { isActive } });
        await this.audit(
          tx,
          user,
          isActive ? 'activate' : 'deactivate',
          'Product',
          id,
          before,
          after,
        );
      });
    }
    return this.getProduct(id, user);
  }

  async saveProductImage(id: string, file: UploadedImage | undefined, user: RequestUser) {
    if (!file) throw new BadRequestException('Attach an image in the "file" field');
    const ext = IMAGE_TYPES[file.mimetype];
    if (!ext) throw new BadRequestException('The image must be a JPEG, PNG, WebP or GIF file');
    if (file.size > MAX_IMAGE_BYTES)
      throw new BadRequestException('The image must be 2 MB or less');
    if (!looksLikeImage(file.buffer, ext)) {
      throw new BadRequestException('The file content is not a valid image');
    }

    const before = await this.prisma.product.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Product not found');

    const fileName = `${id}-${Date.now()}.${ext}`;
    await fs.mkdir(this.uploadDir, { recursive: true });
    await fs.writeFile(join(this.uploadDir, fileName), file.buffer);

    const imageUrl = `/api/v1/inventory/products/${id}/image/${fileName}`;
    await this.prisma.$transaction(async (tx) => {
      const after = await tx.product.update({ where: { id }, data: { imageUrl } });
      await this.audit(tx, user, 'update', 'Product', id, before, after);
    });
    return this.getProduct(id, user);
  }

  async removeProductImage(id: string, user: RequestUser) {
    return this.updateProduct(id, { imageUrl: null }, user);
  }

  /** Absolute path of an uploaded image, or 404. */
  async productImagePath(id: string, fileName: string): Promise<string> {
    if (!IMAGE_FILE_RE.test(fileName) || !fileName.startsWith(`${id}-`)) {
      throw new NotFoundException('Image not found');
    }
    const path = join(this.uploadDir, fileName);
    try {
      await fs.access(path);
    } catch {
      throw new NotFoundException('Image not found');
    }
    return path;
  }

  // ──────────────────────────── Categories ────────────────────────────

  /** Flat list in tree order (parents before children) with depth and full path. */
  async listCategories(includeInactive: boolean) {
    const [rows, counts] = await Promise.all([
      this.prisma.category.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.product.groupBy({
        by: ['categoryId'],
        where: { isActive: true },
        _count: { _all: true },
      }),
    ]);
    const countBy = new Map(counts.map((c) => [c.categoryId, c._count._all]));
    const byId = new Map(rows.map((r) => [r.id, r]));
    const children = new Map<string | null, typeof rows>();
    for (const r of rows) {
      const key = r.parentId && byId.has(r.parentId) ? r.parentId : null;
      children.set(key, [...(children.get(key) ?? []), r]);
    }

    const result: {
      id: string;
      name: string;
      parentId: string | null;
      isActive: boolean;
      depth: number;
      path: string;
      productCount: number;
      childCount: number;
    }[] = [];
    const visit = (parentId: string | null, depth: number, parentActive: boolean) => {
      for (const c of children.get(parentId) ?? []) {
        const active = parentActive && c.isActive;
        if (active || includeInactive) {
          result.push({
            id: c.id,
            name: c.name,
            parentId: c.parentId,
            isActive: c.isActive,
            depth,
            path: categoryPath(c.id, byId),
            productCount: countBy.get(c.id) ?? 0,
            childCount: children.get(c.id)?.length ?? 0,
          });
        }
        visit(c.id, depth + 1, active);
      }
    };
    visit(null, 0, true);
    return result;
  }

  async createCategory(dto: CreateCategoryDto, user: RequestUser) {
    const parentId = dto.parentId ?? null;
    if (parentId) await this.findCategoryOrFail(parentId);
    await this.assertCategoryNameFree(dto.name, parentId, null);

    const category = await this.prisma.$transaction(async (tx) => {
      const created = await tx.category.create({ data: { name: dto.name, parentId } });
      await this.audit(tx, user, 'create', 'Category', created.id, null, created);
      return created;
    });
    return category;
  }

  async updateCategory(id: string, dto: UpdateCategoryDto, user: RequestUser) {
    const before = await this.findCategoryOrFail(id);
    const parentId = dto.parentId === undefined ? before.parentId : dto.parentId;
    const name = dto.name ?? before.name;

    if (dto.parentId !== undefined && parentId) {
      await this.findCategoryOrFail(parentId);
      const byId = new Map((await this.categoryNodes()).map((c) => [c.id, c]));
      if (wouldCreateCycle(id, parentId, byId)) {
        throw new BadRequestException(
          'A category cannot be moved under itself or its subcategories',
        );
      }
    }
    if (name !== before.name || parentId !== before.parentId) {
      await this.assertCategoryNameFree(name, parentId, id);
    }

    return this.prisma.$transaction(async (tx) => {
      const after = await tx.category.update({
        where: { id },
        data: { name, parentId, isActive: dto.isActive ?? before.isActive },
      });
      await this.audit(tx, user, 'update', 'Category', id, before, after);
      return after;
    });
  }

  // ─────────────────────────────── Units ──────────────────────────────

  listUnits() {
    return this.prisma.unit.findMany({ orderBy: { code: 'asc' } });
  }

  async createUnit(dto: CreateUnitDto, user: RequestUser) {
    return this.prisma.$transaction(async (tx) => {
      const unit = await tx.unit
        .create({ data: { code: dto.code, name: dto.name } })
        .catch((e) => this.rethrowUnique(e));
      await this.audit(tx, user, 'create', 'Unit', unit.id, null, unit);
      return unit;
    });
  }

  // ────────────────────────────── Helpers ─────────────────────────────

  private toProduct(
    p: ProductRow,
    onHand: Prisma.Decimal,
    user: RequestUser,
    categories: Map<string, CategoryNode>,
  ) {
    const canSeeCost = user.permissions.has('inventory.cost.view');
    const rate = p.taxRate?.rate ?? null;
    const margin = marginPercent(p.salePrice, p.purchasePrice);
    return {
      id: p.id,
      sku: p.sku,
      barcode: p.barcode,
      name: p.name,
      description: p.description,
      imageUrl: p.imageUrl,
      category: p.category
        ? {
            id: p.category.id,
            name: p.category.name,
            path: categoryPath(p.category.id, categories),
          }
        : null,
      baseUnit: p.baseUnit,
      taxRate: p.taxRate
        ? { id: p.taxRate.id, name: p.taxRate.name, rate: p.taxRate.rate.toString() }
        : null,
      salePrice: p.salePrice.toString(),
      salePriceInclTax: priceInclTax(p.salePrice, rate).toString(),
      ...(canSeeCost
        ? {
            purchasePrice: p.purchasePrice.toString(),
            averageCost: p.averageCost.toString(),
            marginPercent: margin?.toString() ?? null,
          }
        : {}),
      minStock: p.minStock.toString(),
      onHand: onHand.toString(),
      stockStatus: stockStatus(onHand, p.minStock),
      isActive: p.isActive,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }

  private async onHandByProduct(ids: string[]) {
    if (ids.length === 0) return new Map<string, Prisma.Decimal>();
    const sums = await this.prisma.stockBalance.groupBy({
      by: ['productId'],
      where: { productId: { in: ids } },
      _sum: { quantity: true },
    });
    return new Map(sums.map((s) => [s.productId, s._sum.quantity ?? ZERO]));
  }

  private categoryNodes(): Promise<CategoryNode[]> {
    return this.prisma.category.findMany({ select: { id: true, name: true, parentId: true } });
  }

  private async findCategoryOrFail(id: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  /** The DB unique index does not cover top-level categories (parent_id NULL), so check here. */
  private async assertCategoryNameFree(
    name: string,
    parentId: string | null,
    exceptId: string | null,
  ) {
    const clash = await this.prisma.category.findFirst({
      where: {
        parentId,
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId ? { NOT: { id: exceptId } } : {}),
      },
    });
    if (clash) throw new ConflictException(`A category named "${name}" already exists here`);
  }

  private async assertReferences(dto: {
    categoryId?: string | null;
    baseUnitId?: string;
    taxRateId?: string | null;
  }) {
    if (dto.categoryId) {
      const c = await this.prisma.category.findUnique({ where: { id: dto.categoryId } });
      if (!c) throw new BadRequestException('Unknown category');
      if (!c.isActive) throw new BadRequestException('This category is inactive');
    }
    if (dto.baseUnitId && !(await this.prisma.unit.findUnique({ where: { id: dto.baseUnitId } }))) {
      throw new BadRequestException('Unknown unit');
    }
    if (dto.taxRateId) {
      const t = await this.prisma.taxRate.findUnique({ where: { id: dto.taxRateId } });
      if (!t || !t.isActive) throw new BadRequestException('Unknown or inactive VAT rate');
    }
  }

  private async defaultUnitId(): Promise<string> {
    const unit =
      (await this.prisma.unit.findUnique({ where: { code: 'PCS' } })) ??
      (await this.prisma.unit.findFirst({ orderBy: { code: 'asc' } }));
    if (!unit) throw new BadRequestException('Create a unit of measure first');
    return unit.id;
  }

  private async resolveWarehouse(tx: Tx, warehouseId: string | undefined): Promise<string> {
    const warehouse = warehouseId
      ? await tx.warehouse.findUnique({ where: { id: warehouseId } })
      : await tx.warehouse.findFirst({ where: { isActive: true }, orderBy: { code: 'asc' } });
    if (!warehouse || !warehouse.isActive) {
      throw new BadRequestException('Unknown or inactive warehouse for the opening stock');
    }
    return warehouse.id;
  }

  private rethrowUnique(e: unknown): never {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const target = (e.meta?.target as string[] | string | undefined) ?? '';
      const field = Array.isArray(target) ? target.join(', ') : target;
      if (field.includes('barcode')) throw new ConflictException('This barcode is already used');
      if (field.includes('sku')) throw new ConflictException('This SKU is already used');
      if (field.includes('code')) throw new ConflictException('This code is already used');
      throw new ConflictException('This value is already used');
    }
    throw e;
  }

  private async audit(
    tx: Tx,
    user: RequestUser,
    action: string,
    entity: string,
    entityId: string,
    before: unknown,
    after: unknown,
  ) {
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action,
        entity,
        entityId,
        before: toJson(before),
        after: toJson(after),
      },
    });
  }
}

/** Decimal and Date become strings, as they would in an API response. */
function toJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === null || value === undefined) return Prisma.JsonNull;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/** Checks the file signature so a renamed non-image is rejected. */
export function looksLikeImage(buf: Buffer, ext: string): boolean {
  if (buf.length < 12) return false;
  switch (ext) {
    case 'jpg':
      return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    case 'png':
      return buf
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case 'gif':
      return buf.subarray(0, 4).toString('ascii') === 'GIF8';
    case 'webp':
      return (
        buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buf.subarray(8, 12).toString('ascii') === 'WEBP'
      );
    default:
      return false;
  }
}
