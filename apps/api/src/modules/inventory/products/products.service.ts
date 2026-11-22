import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  BulkResult,
  DeactivationCheck,
  Paginated,
  ProductDetail,
  ProductHistoryEntry,
  ProductListItem,
  ProductStockDto,
  ProductType,
} from '@erp/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../../core/audit/audit.service';
import type { RequestUser } from '../../../common/types/request-user';
import { buildCategoryPaths, descendantIds } from '../catalog.service';
import { toCsv } from './csv';
import {
  AUTO_SKU_PREFIX,
  changedFields,
  computeMarginPct,
  computeStockStatus,
  nextAutoSku,
} from './product-rules';
import type {
  BulkProductActionDto,
  CreateProductDto,
  ProductQueryDto,
  ProductUnitInput,
  UpdateProductDto,
} from './dto/product.dto';

const Decimal = Prisma.Decimal;
type Decimal = Prisma.Decimal;

const ZERO = new Decimal(0);
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_EXPORT_ROWS = 50_000;

const detailInclude = {
  category: true,
  baseUnit: true,
  taxRate: true,
  image: { select: { productId: true } },
  units: { include: { unit: true }, orderBy: { factor: 'asc' } },
} satisfies Prisma.ProductInclude;
type ProductWithDetail = Prisma.ProductGetPayload<{ include: typeof detailInclude }>;

const listInclude = {
  category: true,
  baseUnit: true,
  image: { select: { productId: true } },
} satisfies Prisma.ProductInclude;
type ProductWithList = Prisma.ProductGetPayload<{ include: typeof listInclude }>;

export interface UploadedImage {
  buffer: Buffer;
  size: number;
}

/** Detects the real image type from the first bytes (never trust the file name). */
export function sniffImageType(buf: Buffer): string | null {
  if (
    buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  )
    return 'image/webp';
  if (buf.length >= 6 && /^GIF8[79]a$/.test(buf.toString('ascii', 0, 6))) return 'image/gif';
  return null;
}

function isUniqueViolation(e: unknown): e is Prisma.PrismaClientKnownRequestError {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Read ──────────────────────────────────────────────────────────────────

  async findAll(query: ProductQueryDto, user: RequestUser): Promise<Paginated<ProductListItem>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const where = await this.buildWhere(query);
    const sort = query.sort ?? 'name';
    const dir = query.dir ?? 'asc';

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include: listInclude,
        orderBy: [{ [sort]: dir }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    const onHand = await this.stockOnHand(rows.map((r) => r.id));
    const canSeeCost = user.permissions.has('inventory.cost.view');
    return {
      items: rows.map((r) => this.toListItem(r, onHand.get(r.id) ?? ZERO, canSeeCost)),
      total,
      page,
      pageSize,
    };
  }

  async findOne(id: string, user: RequestUser): Promise<ProductDetail> {
    const p = await this.prisma.product.findUnique({ where: { id }, include: detailInclude });
    if (!p) throw new NotFoundException('Product not found');
    const onHand = (await this.stockOnHand([id])).get(id) ?? ZERO;
    return this.toDetail(
      p,
      onHand,
      await this.isUsed(id),
      user.permissions.has('inventory.cost.view'),
    );
  }

  async getStock(id: string): Promise<ProductStockDto> {
    await this.requireProduct(id);
    const [balances, moves] = await Promise.all([
      this.prisma.stockBalance.findMany({
        where: { productId: id },
        include: { warehouse: true },
        orderBy: { warehouse: { code: 'asc' } },
      }),
      this.prisma.stockMove.findMany({
        where: { productId: id },
        include: { warehouse: true, createdBy: { select: { fullName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);
    return {
      balances: balances.map((b) => ({
        warehouseId: b.warehouseId,
        warehouseCode: b.warehouse.code,
        warehouseName: b.warehouse.name,
        quantity: b.quantity.toString(),
      })),
      moves: moves.map((m) => ({
        id: m.id,
        date: m.createdAt.toISOString(),
        type: m.type,
        warehouseCode: m.warehouse.code,
        quantity: m.quantity.toString(),
        reference: m.reference,
        userName: m.createdBy.fullName,
      })),
    };
  }

  async getHistory(id: string): Promise<ProductHistoryEntry[]> {
    await this.requireProduct(id);
    const logs = await this.prisma.auditLog.findMany({
      where: { entity: 'Product', entityId: id },
      include: { user: { select: { fullName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return logs.map((l) => ({
      id: l.id.toString(),
      date: l.createdAt.toISOString(),
      action: l.action,
      userName: l.user?.fullName ?? null,
      changedFields: l.action === 'update' ? changedFields(l.before, l.after) : [],
    }));
  }

  async deactivationCheck(id: string): Promise<DeactivationCheck> {
    await this.requireProduct(id);
    const [onHand, openPurchaseOrders, openSalesOrders] = await Promise.all([
      this.stockOnHand([id]),
      this.prisma.purchaseOrder.count({
        where: {
          status: { in: ['DRAFT', 'CONFIRMED', 'PARTIALLY_RECEIVED'] },
          lines: { some: { productId: id } },
        },
      }),
      this.prisma.salesOrder.count({
        where: {
          status: { in: ['QUOTATION', 'CONFIRMED', 'PARTIALLY_DELIVERED'] },
          lines: { some: { productId: id } },
        },
      }),
    ]);
    return {
      stockOnHand: (onHand.get(id) ?? ZERO).toString(),
      openPurchaseOrders,
      openSalesOrders,
    };
  }

  // ── Create / update ───────────────────────────────────────────────────────

  async create(dto: CreateProductDto, user: RequestUser): Promise<ProductDetail> {
    this.assertCostAccess(dto, user);
    await this.validateReferences(dto, null);
    this.validateUnits(dto.units ?? [], dto.baseUnitId);
    if (dto.sku) await this.assertSkuFree(dto.sku, null);
    await this.assertBarcodesFree(this.collectBarcodes(dto.barcode, dto.units), null);

    for (let attempt = 0; ; attempt++) {
      const sku = dto.sku ?? (await this.generateSku());
      try {
        const id = await this.prisma.$transaction(async (tx) => {
          const p = await tx.product.create({
            data: {
              sku,
              name: dto.name,
              barcode: dto.barcode ?? null,
              description: dto.description ?? null,
              type: dto.type ?? 'STOCKABLE',
              categoryId: dto.categoryId ?? null,
              baseUnitId: dto.baseUnitId,
              taxRateId: dto.taxRateId ?? null,
              salePrice: dto.salePrice ?? '0',
              purchasePrice: dto.purchasePrice ?? '0',
              minStock: dto.minStock ?? '0',
              units: { create: (dto.units ?? []).map((u) => this.unitData(u)) },
            },
            include: { units: true },
          });
          await this.audit.record(tx, {
            userId: user.id,
            action: 'create',
            entity: 'Product',
            entityId: p.id,
            after: p,
          });
          return p.id;
        });
        return this.findOne(id, user);
      } catch (e) {
        // Two users generating an automatic SKU at the same moment: take the next number.
        if (isUniqueViolation(e) && !dto.sku && attempt < 3 && this.violatedField(e) === 'sku')
          continue;
        throw this.mapUniqueViolation(e);
      }
    }
  }

  async update(id: string, dto: UpdateProductDto, user: RequestUser): Promise<ProductDetail> {
    this.assertCostAccess(dto, user);
    const current = await this.prisma.product.findUnique({
      where: { id },
      include: { units: true },
    });
    if (!current) throw new NotFoundException('Product not found');

    if (
      dto.expectedUpdatedAt &&
      new Date(dto.expectedUpdatedAt).getTime() !== current.updatedAt.getTime()
    ) {
      throw new ConflictException(
        'This product was changed by someone else since you opened it. Reload to see the latest version.',
      );
    }

    const baseUnitId = dto.baseUnitId ?? current.baseUnitId;
    const typeChanges = dto.type !== undefined && dto.type !== current.type;
    if (baseUnitId !== current.baseUnitId || (typeChanges && current.type === 'STOCKABLE')) {
      const moves = await this.prisma.stockMove.count({ where: { productId: id } });
      const used = baseUnitId !== current.baseUnitId ? await this.isUsed(id) : moves > 0;
      if (baseUnitId !== current.baseUnitId && used) {
        throw new BadRequestException(
          'The base unit cannot be changed: this product already has stock movements or documents. ' +
            'Add the new unit as an extra unit instead.',
        );
      }
      if (typeChanges && current.type === 'STOCKABLE' && moves > 0) {
        throw new BadRequestException(
          'This product has stock movements, so it must stay a stockable product.',
        );
      }
    }

    await this.validateReferences(dto, current);
    const units = dto.units;
    if (units) this.validateUnits(units, baseUnitId);
    else if (
      baseUnitId !== current.baseUnitId &&
      current.units.some((u) => u.unitId === baseUnitId)
    ) {
      throw new BadRequestException(
        'The new base unit is already one of the extra units — remove it there first',
      );
    }
    const sku = dto.sku ?? current.sku;
    if (sku !== current.sku) await this.assertSkuFree(sku, id);
    const barcode = dto.barcode === undefined ? current.barcode : dto.barcode;
    await this.assertBarcodesFree(this.collectBarcodes(barcode, units ?? current.units), id);

    try {
      await this.prisma.$transaction(async (tx) => {
        // `updatedAt` in the filter = optimistic lock against a save that happened in between.
        const updated = await tx.product.update({
          where: { id, updatedAt: current.updatedAt },
          data: {
            sku,
            name: dto.name,
            barcode,
            description: dto.description,
            type: dto.type,
            categoryId: dto.categoryId,
            baseUnitId,
            taxRateId: dto.taxRateId,
            salePrice: dto.salePrice,
            purchasePrice: dto.purchasePrice,
            minStock: dto.minStock,
          },
        });
        if (units) {
          // Clear barcodes first so swapping barcodes between two units does not hit the unique index.
          await tx.productUnit.updateMany({ where: { productId: id }, data: { barcode: null } });
          await tx.productUnit.deleteMany({
            where: { productId: id, unitId: { notIn: units.map((u) => u.unitId) } },
          });
          for (const u of units) {
            await tx.productUnit.upsert({
              where: { productId_unitId: { productId: id, unitId: u.unitId } },
              create: { productId: id, ...this.unitData(u) },
              update: this.unitData(u),
            });
          }
        }
        const after = await tx.product.findUniqueOrThrow({
          where: { id },
          include: { units: true },
        });
        await this.audit.record(tx, {
          userId: user.id,
          action: 'update',
          entity: 'Product',
          entityId: id,
          before: current,
          after: { ...after, updatedAt: updated.updatedAt },
        });
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new ConflictException(
          'This product was changed by someone else while you were editing. Reload and try again.',
        );
      }
      throw this.mapUniqueViolation(e);
    }
    return this.findOne(id, user);
  }

  // ── Status ────────────────────────────────────────────────────────────────

  async setActive(id: string, isActive: boolean, user: RequestUser): Promise<ProductDetail> {
    const current = await this.requireProduct(id);
    if (current.isActive !== isActive) {
      await this.prisma.$transaction(async (tx) => {
        await tx.product.update({ where: { id }, data: { isActive } });
        await this.audit.record(tx, {
          userId: user.id,
          action: isActive ? 'activate' : 'deactivate',
          entity: 'Product',
          entityId: id,
          before: { isActive: current.isActive },
          after: { isActive },
        });
      });
    }
    return this.findOne(id, user);
  }

  async bulk(dto: BulkProductActionDto, user: RequestUser): Promise<BulkResult> {
    const ids = [...new Set(dto.ids)];
    const products = await this.prisma.product.findMany({ where: { id: { in: ids } } });
    const found = new Map(products.map((p) => [p.id, p]));
    const result: BulkResult = { succeeded: [], failed: [] };
    for (const id of ids) {
      if (!found.has(id)) result.failed.push({ id, sku: '', reason: 'Product not found' });
    }

    let categoryId: string | null = null;
    if (dto.action === 'set-category') {
      categoryId = dto.categoryId ?? null;
      if (categoryId) {
        const c = await this.prisma.category.findUnique({ where: { id: categoryId } });
        if (!c) throw new BadRequestException('Category not found');
        if (!c.isActive) throw new BadRequestException(`Category "${c.name}" is inactive`);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      const entries = [];
      for (const p of products) {
        if (dto.action === 'set-category') {
          if (p.categoryId !== categoryId) {
            await tx.product.update({ where: { id: p.id }, data: { categoryId } });
            entries.push({
              userId: user.id,
              action: 'update',
              entity: 'Product',
              entityId: p.id,
              before: { categoryId: p.categoryId },
              after: { categoryId },
            });
          }
        } else {
          const isActive = dto.action === 'activate';
          if (p.isActive !== isActive) {
            await tx.product.update({ where: { id: p.id }, data: { isActive } });
            entries.push({
              userId: user.id,
              action: dto.action,
              entity: 'Product',
              entityId: p.id,
              before: { isActive: p.isActive },
              after: { isActive },
            });
          }
        }
        result.succeeded.push(p.id);
      }
      await this.audit.recordMany(tx, entries);
    });
    return result;
  }

  // ── Image ─────────────────────────────────────────────────────────────────

  async setImage(id: string, file: UploadedImage | undefined, user: RequestUser): Promise<void> {
    await this.requireProduct(id);
    if (!file || file.size === 0) throw new BadRequestException('Choose an image file');
    if (file.size > MAX_IMAGE_BYTES)
      throw new BadRequestException('The image must be 2 MB or smaller');
    const mimeType = sniffImageType(file.buffer);
    if (!mimeType) throw new BadRequestException('Only PNG, JPEG, WebP or GIF images are accepted');

    const data = new Uint8Array(file.buffer);
    await this.prisma.$transaction(async (tx) => {
      await tx.productImage.upsert({
        where: { productId: id },
        create: { productId: id, mimeType, data },
        update: { mimeType, data },
      });
      await this.audit.record(tx, {
        userId: user.id,
        action: 'image-update',
        entity: 'Product',
        entityId: id,
        after: { mimeType, size: file.size },
      });
    });
  }

  async getImage(id: string): Promise<{ mimeType: string; data: Buffer }> {
    const img = await this.prisma.productImage.findUnique({ where: { productId: id } });
    if (!img) throw new NotFoundException('This product has no image');
    return { mimeType: img.mimeType, data: Buffer.from(img.data) };
  }

  async removeImage(id: string, user: RequestUser): Promise<void> {
    await this.requireProduct(id);
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.productImage.deleteMany({ where: { productId: id } });
      if (count > 0) {
        await this.audit.record(tx, {
          userId: user.id,
          action: 'image-remove',
          entity: 'Product',
          entityId: id,
        });
      }
    });
  }

  // ── Export ────────────────────────────────────────────────────────────────

  async exportCsv(query: ProductQueryDto, user: RequestUser): Promise<string> {
    const canSeeCost = user.permissions.has('inventory.cost.view');
    const where = await this.buildWhere(query);
    const [rows, categories] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: { category: true, baseUnit: true, taxRate: true },
        orderBy: [{ [query.sort ?? 'name']: query.dir ?? 'asc' }, { id: 'asc' }],
        take: MAX_EXPORT_ROWS,
      }),
      this.prisma.category.findMany(),
    ]);
    const paths = buildCategoryPaths(categories);
    const header = [
      'sku',
      'name',
      'barcode',
      'type',
      'category',
      'base_unit',
      'tax_rate',
      'sale_price',
      ...(canSeeCost ? ['purchase_price'] : []),
      'min_stock',
      'description',
      'active',
    ];
    return toCsv(
      header,
      rows.map((p) => [
        p.sku,
        p.name,
        p.barcode,
        p.type,
        p.categoryId ? paths.get(p.categoryId) : '',
        p.baseUnit.code,
        p.taxRate?.name,
        p.salePrice.toString(),
        ...(canSeeCost ? [p.purchasePrice.toString()] : []),
        p.minStock.toString(),
        p.description,
        p.isActive ? 'yes' : 'no',
      ]),
    );
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  async isUsed(id: string): Promise<boolean> {
    const p = await this.prisma.product.findUnique({
      where: { id },
      select: {
        _count: {
          select: {
            stockMoves: true,
            purchaseOrderLines: true,
            goodsReceiptLines: true,
            salesOrderLines: true,
            deliveryLines: true,
            customerReturnLines: true,
            invoiceLines: true,
          },
        },
      },
    });
    return !!p && Object.values(p._count).some((n) => n > 0);
  }

  /** Sum of on-hand quantity over all warehouses, per product. */
  async stockOnHand(ids: string[]): Promise<Map<string, Decimal>> {
    if (ids.length === 0) return new Map();
    const sums = await this.prisma.stockBalance.groupBy({
      by: ['productId'],
      where: { productId: { in: ids } },
      _sum: { quantity: true },
    });
    return new Map(sums.map((s) => [s.productId, s._sum.quantity ?? ZERO]));
  }

  async buildWhere(query: ProductQueryDto): Promise<Prisma.ProductWhereInput> {
    const and: Prisma.ProductWhereInput[] = [];
    const status = query.status ?? 'active';
    if (status !== 'all') and.push({ isActive: status === 'active' });
    if (query.type) and.push({ type: query.type });
    if (query.search) {
      const s = query.search;
      and.push({
        OR: [
          { name: { contains: s, mode: 'insensitive' } },
          { sku: { contains: s, mode: 'insensitive' } },
          { barcode: { contains: s, mode: 'insensitive' } },
          { units: { some: { barcode: s } } },
        ],
      });
    }
    if (query.categoryId) {
      const all = await this.prisma.category.findMany({
        select: { id: true, name: true, parentId: true, isActive: true },
      });
      and.push({ categoryId: { in: descendantIds(all, query.categoryId) } });
    }
    if (query.stock) {
      const condition =
        query.stock === 'out'
          ? Prisma.sql`COALESCE(b.qty, 0) <= 0`
          : Prisma.sql`COALESCE(b.qty, 0) > 0 AND p.min_stock > 0 AND COALESCE(b.qty, 0) <= p.min_stock`;
      const rows = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT p.id FROM products p
        LEFT JOIN (SELECT product_id, SUM(quantity) AS qty FROM stock_balances GROUP BY product_id) b
          ON b.product_id = p.id
        WHERE p.type = 'STOCKABLE'::"ProductType" AND ${condition}`;
      and.push({ id: { in: rows.map((r) => r.id) } });
    }
    return { AND: and };
  }

  private async requireProduct(id: string) {
    const p = await this.prisma.product.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Product not found');
    return p;
  }

  private assertCostAccess(dto: { purchasePrice?: string }, user: RequestUser) {
    if (dto.purchasePrice !== undefined && !user.permissions.has('inventory.cost.view')) {
      throw new ForbiddenException('You need inventory.cost.view to set the purchase price');
    }
  }

  /** Checks category / unit / tax rate exist. New links must point to active records. */
  private async validateReferences(
    dto: {
      categoryId?: string | null;
      baseUnitId?: string;
      taxRateId?: string | null;
      units?: ProductUnitInput[];
    },
    current: { categoryId: string | null; taxRateId: string | null } | null,
  ) {
    if (dto.categoryId && dto.categoryId !== current?.categoryId) {
      const c = await this.prisma.category.findUnique({ where: { id: dto.categoryId } });
      if (!c) throw new BadRequestException('Category not found');
      if (!c.isActive) throw new BadRequestException(`Category "${c.name}" is inactive`);
    }
    if (dto.taxRateId && dto.taxRateId !== current?.taxRateId) {
      const t = await this.prisma.taxRate.findUnique({ where: { id: dto.taxRateId } });
      if (!t) throw new BadRequestException('Tax rate not found');
      if (!t.isActive) throw new BadRequestException(`Tax rate "${t.name}" is inactive`);
    }
    const unitIds = [
      ...new Set([dto.baseUnitId, ...(dto.units ?? []).map((u) => u.unitId)].filter(Boolean)),
    ] as string[];
    if (unitIds.length) {
      const found = await this.prisma.unit.count({ where: { id: { in: unitIds } } });
      if (found !== unitIds.length) throw new BadRequestException('Unit not found');
    }
  }

  private validateUnits(units: ProductUnitInput[], baseUnitId: string) {
    const seen = new Set<string>();
    for (const u of units) {
      if (u.unitId === baseUnitId) {
        throw new BadRequestException('The base unit cannot also be an extra unit');
      }
      if (seen.has(u.unitId)) throw new BadRequestException('The same extra unit is listed twice');
      seen.add(u.unitId);
      if (new Decimal(u.factor).lte(0))
        throw new BadRequestException('Unit factor must be greater than 0');
    }
  }

  private collectBarcodes(
    productBarcode: string | null | undefined,
    units: { barcode?: string | null }[] | undefined,
  ): string[] {
    const codes = [productBarcode, ...(units ?? []).map((u) => u.barcode)].filter(
      (b): b is string => !!b,
    );
    const dup = codes.find((c, i) => codes.indexOf(c) !== i);
    if (dup) throw new BadRequestException(`Barcode ${dup} is used twice on this product`);
    return codes;
  }

  private async assertSkuFree(sku: string, exceptId: string | null) {
    const clash = await this.prisma.product.findFirst({
      where: {
        sku: { equals: sku, mode: 'insensitive' },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
    });
    if (clash) throw new ConflictException(`SKU ${clash.sku} is already used by "${clash.name}"`);
  }

  /** A barcode must be unique across product barcodes AND unit barcodes of other products. */
  private async assertBarcodesFree(codes: string[], exceptProductId: string | null) {
    if (codes.length === 0) return;
    const not = exceptProductId ? { not: exceptProductId } : undefined;
    const [p, u] = await Promise.all([
      this.prisma.product.findFirst({ where: { barcode: { in: codes }, id: not } }),
      this.prisma.productUnit.findFirst({
        where: { barcode: { in: codes }, productId: not },
        include: { product: true },
      }),
    ]);
    if (p)
      throw new ConflictException(`Barcode ${p.barcode} is already used by "${p.name}" (${p.sku})`);
    if (u)
      throw new ConflictException(
        `Barcode ${u.barcode} is already used by "${u.product.name}" (${u.product.sku})`,
      );
  }

  /** Highest SKU of the automatic PRD-00001 series, or null. */
  async lastAutoSku(): Promise<string | null> {
    const last = await this.prisma.product.findFirst({
      where: { sku: { startsWith: AUTO_SKU_PREFIX } },
      orderBy: { sku: 'desc' },
      select: { sku: true },
    });
    return last?.sku ?? null;
  }

  private async generateSku(): Promise<string> {
    return nextAutoSku(await this.lastAutoSku());
  }

  private unitData(u: ProductUnitInput) {
    return {
      unitId: u.unitId,
      factor: u.factor,
      forPurchase: u.forPurchase ?? true,
      forSale: u.forSale ?? true,
      barcode: u.barcode ?? null,
    };
  }

  private violatedField(e: Prisma.PrismaClientKnownRequestError): string {
    const target = e.meta?.target;
    return Array.isArray(target) ? target.join(',') : String(target ?? '');
  }

  /** Last line of defence if two users save the same SKU / barcode at the same instant. */
  private mapUniqueViolation(e: unknown): unknown {
    if (!isUniqueViolation(e)) return e;
    const field = this.violatedField(e);
    if (field.includes('sku'))
      return new ConflictException('This SKU is already used by another product');
    if (field.includes('barcode'))
      return new ConflictException('This barcode is already used by another product');
    return new ConflictException('This value is already used by another record');
  }

  private toListItem(p: ProductWithList, onHand: Decimal, canSeeCost: boolean): ProductListItem {
    return {
      id: p.id,
      sku: p.sku,
      barcode: p.barcode,
      name: p.name,
      type: p.type as ProductType,
      categoryId: p.categoryId,
      categoryName: p.category?.name ?? null,
      baseUnitCode: p.baseUnit.code,
      salePrice: p.salePrice.toString(),
      ...(canSeeCost
        ? {
            purchasePrice: p.purchasePrice.toString(),
            averageCost: p.averageCost.toString(),
            marginPct: computeMarginPct(p.salePrice, p.averageCost, p.purchasePrice),
          }
        : {}),
      minStock: p.minStock.toString(),
      stockOnHand: onHand.toString(),
      stockStatus: computeStockStatus(p.type as ProductType, onHand, p.minStock),
      isActive: p.isActive,
      hasImage: !!p.image,
      updatedAt: p.updatedAt.toISOString(),
    };
  }

  private toDetail(
    p: ProductWithDetail,
    onHand: Decimal,
    isUsed: boolean,
    canSeeCost: boolean,
  ): ProductDetail {
    return {
      ...this.toListItem(p, onHand, canSeeCost),
      description: p.description,
      baseUnitId: p.baseUnitId,
      baseUnitName: p.baseUnit.name,
      taxRateId: p.taxRateId,
      taxRateName: p.taxRate ? `${p.taxRate.name} (${p.taxRate.rate.toString()}%)` : null,
      units: p.units.map((u) => ({
        id: u.id,
        unitId: u.unitId,
        unitCode: u.unit.code,
        unitName: u.unit.name,
        factor: u.factor.toString(),
        forPurchase: u.forPurchase,
        forSale: u.forSale,
        barcode: u.barcode,
      })),
      createdAt: p.createdAt.toISOString(),
      isUsed,
    };
  }
}
