import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  Paginated,
  PRODUCT_CSV_COLUMNS,
  ProductDetail,
  PackagingDetail,
  ProductLabelItem,
  ProductListItem,
  ProductStats,
} from '@erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { Actor, AuditService } from '../../core/audit/audit.service';
import { SettingsService } from '../../core/settings/settings.service';
import { pageArgs, paginated } from '../../common/pagination';
import { CategoriesService } from './categories.service';
import { PackagingDto, ProductsQueryDto, SaveProductDto } from './catalog.dto';
import { currencyDecimals, inclTax, parseDecimal, plain } from './decimal';
import { toCsv } from './csv';

type Db = Prisma.TransactionClient | PrismaService;

export const productInclude = {
  baseUnit: true,
  taxRate: true,
  units: { include: { unit: true }, orderBy: { factor: 'asc' } },
} satisfies Prisma.ProductInclude;
type ProductRow = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

/** What the caller is allowed to see. */
export interface Viewer extends Actor {
  canSeeCost: boolean;
}

/** Public URL of a product photo (the web app proxies /api/* to the API). */
export function photoUrl(file: string | null): string | null {
  return file ? `/api/v1/products/photos/${file}` : null;
}

const SKU_PREFIX = 'PRD-';
const SKU_PADDING = 5;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly categories: CategoriesService,
  ) {}

  // ── Read ───────────────────────────────────────────────────────────────────

  async findAll(q: ProductsQueryDto, viewer: Viewer): Promise<Paginated<ProductListItem>> {
    const where = await this.whereFor(q);
    const direction = q.order ?? 'asc';
    const orderBy: Prisma.ProductOrderByWithRelationInput[] = [
      { [q.sort ?? 'name']: direction },
      { id: 'asc' }, // stable order across pages
    ];

    const [rows, total, ctx] = await Promise.all([
      this.prisma.product.findMany({ where, include: productInclude, orderBy, ...pageArgs(q) }),
      this.prisma.product.count({ where }),
      this.context(),
    ]);
    return paginated(
      rows.map((p) => this.toListItem(p, ctx, viewer)),
      total,
      q,
    );
  }

  async findOne(id: string, viewer: Viewer): Promise<ProductDetail> {
    const p = await this.prisma.product.findUnique({ where: { id }, include: productInclude });
    if (!p) throw new NotFoundException('Product not found');
    return this.toDetail(p, await this.context(), viewer);
  }

  async stats(): Promise<ProductStats> {
    const [active, inactive, categories, withoutBarcode, withoutCategory] = await Promise.all([
      this.prisma.product.count({ where: { isActive: true } }),
      this.prisma.product.count({ where: { isActive: false } }),
      this.prisma.category.count({ where: { isActive: true } }),
      this.prisma.product.count({ where: { isActive: true, barcode: null } }),
      this.prisma.product.count({ where: { isActive: true, categoryId: null } }),
    ]);
    return { active, inactive, categories, withoutBarcode, withoutCategory };
  }

  // ── Write ──────────────────────────────────────────────────────────────────

  async create(dto: SaveProductDto, viewer: Viewer): Promise<ProductDetail> {
    const data = await this.validate(dto, null, viewer);
    const id = await this.withUniqueErrors(() =>
      this.prisma.$transaction(async (tx) => {
        const sku = dto.sku ?? (await this.nextSku(tx));
        await this.assertSkuFree(sku, null, tx);
        const created = await tx.product.create({
          data: {
            ...data.fields,
            sku,
            taxRateId:
              dto.taxRateId === undefined
                ? await this.settings.defaultTaxRateId()
                : data.fields.taxRateId,
            units: { create: data.packagings },
          },
          include: productInclude,
        });
        await this.audit.log(
          viewer,
          { action: 'create', entity: 'Product', entityId: created.id, after: snapshot(created) },
          tx,
        );
        return created.id;
      }),
    );
    return this.findOne(id, viewer);
  }

  async update(id: string, dto: SaveProductDto, viewer: Viewer): Promise<ProductDetail> {
    const before = await this.prisma.product.findUnique({ where: { id }, include: productInclude });
    if (!before) throw new NotFoundException('Product not found');
    const data = await this.validate(dto, id, viewer);

    await this.withUniqueErrors(() =>
      this.prisma.$transaction(async (tx) => {
        const sku = dto.sku ?? before.sku;
        if (sku !== before.sku) await this.assertSkuFree(sku, id, tx);
        if (dto.packagings) await tx.productUnit.deleteMany({ where: { productId: id } });
        const after = await tx.product.update({
          where: { id },
          data: {
            ...data.fields,
            sku,
            ...(dto.packagings && { units: { create: data.packagings } }),
          },
          include: productInclude,
        });
        await this.audit.log(
          viewer,
          {
            action: 'update',
            entity: 'Product',
            entityId: id,
            before: snapshot(before),
            after: snapshot(after),
          },
          tx,
        );
      }),
    );
    return this.findOne(id, viewer);
  }

  /** Products are never deleted (history); they are deactivated. */
  async setActive(id: string, isActive: boolean, viewer: Viewer): Promise<ProductDetail> {
    const p = await this.prisma.product.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Product not found');
    if (p.isActive !== isActive) {
      await this.prisma.$transaction(async (tx) => {
        await tx.product.update({ where: { id }, data: { isActive } });
        await this.audit.log(
          viewer,
          {
            action: isActive ? 'activate' : 'deactivate',
            entity: 'Product',
            entityId: id,
            after: { sku: p.sku, name: p.name },
          },
          tx,
        );
      });
    }
    return this.findOne(id, viewer);
  }

  // ── CSV export ─────────────────────────────────────────────────────────────

  async exportCsv(q: ProductsQueryDto, viewer: Viewer): Promise<string> {
    const where = await this.whereFor(q);
    const rows = await this.prisma.product.findMany({
      where,
      include: productInclude,
      orderBy: { name: 'asc' },
    });
    const ctx = await this.context();
    const columns = PRODUCT_CSV_COLUMNS.filter((c) => c !== 'purchase_price' || viewer.canSeeCost);
    // Amounts use a decimal comma: that is what French Excel expects.
    const num = (d: Prisma.Decimal) => plain(d).replace('.', ',');

    const lines = rows.map((p) => {
      const values: Record<(typeof PRODUCT_CSV_COLUMNS)[number], string> = {
        sku: p.sku,
        name: p.name,
        barcode: p.barcode ?? '',
        category: p.categoryId ? (ctx.paths.get(p.categoryId) ?? '') : '',
        unit: p.baseUnit.code,
        sale_price: num(p.salePrice),
        purchase_price: num(p.purchasePrice),
        vat_rate: p.taxRate ? num(p.taxRate.rate) : '',
        description: p.description ?? '',
        active: p.isActive ? '1' : '0',
      };
      return columns.map((c) => values[c]);
    });
    return toCsv([columns as unknown as string[], ...lines]);
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private async whereFor(q: ProductsQueryDto): Promise<Prisma.ProductWhereInput> {
    const and: Prisma.ProductWhereInput[] = [];
    if (q.active !== undefined) and.push({ isActive: q.active === 'true' });
    if (q.categoryId === 'none') {
      and.push({ categoryId: null });
    } else if (q.categoryId) {
      const ids = [q.categoryId, ...(await this.categories.descendantIds(q.categoryId))];
      and.push({ categoryId: { in: ids } });
    }
    const s = q.search?.trim();
    if (s) {
      and.push({
        OR: [
          { name: { contains: s, mode: 'insensitive' } },
          { sku: { contains: s, mode: 'insensitive' } },
          { barcode: { equals: s } },
          { units: { some: { barcode: { equals: s } } } },
        ],
      });
    }
    return and.length ? { AND: and } : {};
  }

  private async context() {
    const [paths, company] = await Promise.all([
      this.categories.pathMap(),
      this.settings.company(),
    ]);
    return { paths, decimals: currencyDecimals(company.currency) };
  }

  private toListItem(
    p: ProductRow,
    ctx: { paths: Map<string, string>; decimals: number },
    viewer: Viewer,
  ): ProductListItem {
    return {
      id: p.id,
      sku: p.sku,
      barcode: p.barcode,
      name: p.name,
      category: p.categoryId ? { id: p.categoryId, path: ctx.paths.get(p.categoryId) ?? '' } : null,
      baseUnit: { id: p.baseUnit.id, code: p.baseUnit.code },
      taxRate: p.taxRate
        ? { id: p.taxRate.id, name: p.taxRate.name, rate: p.taxRate.rate.toFixed(2) }
        : null,
      salePrice: p.salePrice.toFixed(ctx.decimals),
      salePriceInclTax: inclTax(p.salePrice, p.taxRate?.rate ?? null, ctx.decimals).toFixed(
        ctx.decimals,
      ),
      ...(viewer.canSeeCost && { purchasePrice: p.purchasePrice.toFixed(ctx.decimals) }),
      photoUrl: photoUrl(p.photoFile),
      isActive: p.isActive,
      updatedAt: p.updatedAt.toISOString(),
    };
  }

  private toDetail(
    p: ProductRow,
    ctx: { paths: Map<string, string>; decimals: number },
    viewer: Viewer,
  ): ProductDetail {
    return {
      ...this.toListItem(p, ctx, viewer),
      description: p.description,
      createdAt: p.createdAt.toISOString(),
      packagings: p.units.map((u) => this.toPackaging(p, u, ctx.decimals)),
    };
  }

  private toPackaging(
    p: ProductRow,
    u: ProductRow['units'][number],
    decimals: number,
  ): PackagingDetail {
    const price = packagingPrice(p, u, decimals);
    return {
      id: u.id,
      unitId: u.unitId,
      unit: { id: u.unit.id, code: u.unit.code, name: u.unit.name },
      factor: plain(u.factor),
      barcode: u.barcode,
      forPurchase: u.forPurchase,
      forSale: u.forSale,
      salePrice: u.salePrice ? u.salePrice.toFixed(decimals) : null,
      effectivePrice: price.toFixed(decimals),
      effectivePriceInclTax: inclTax(price, p.taxRate?.rate ?? null, decimals).toFixed(decimals),
    };
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  /**
   * One label line per product, plus one per packaging sold (with its own
   * barcode and price). Order follows the ids given.
   */
  async labels(ids: string[]): Promise<ProductLabelItem[]> {
    const rows = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      include: productInclude,
    });
    const { decimals } = await this.context();
    const byId = new Map(rows.map((r) => [r.id, r]));
    const out: ProductLabelItem[] = [];
    for (const id of ids) {
      const p = byId.get(id);
      if (!p) continue;
      out.push({
        productId: p.id,
        name: p.name,
        sku: p.sku,
        barcode: p.barcode,
        unitCode: p.baseUnit.code,
        priceInclTax: inclTax(p.salePrice, p.taxRate?.rate ?? null, decimals).toFixed(decimals),
      });
      for (const u of p.units.filter((x) => x.forSale)) {
        const price = packagingPrice(p, u, decimals);
        out.push({
          productId: p.id,
          name: p.name,
          sku: p.sku,
          barcode: u.barcode,
          unitCode: u.unit.code,
          priceInclTax: inclTax(price, p.taxRate?.rate ?? null, decimals).toFixed(decimals),
        });
      }
    }
    return out;
  }

  /** Checks references and business rules, returns the data to write. */
  private async validate(dto: SaveProductDto, productId: string | null, viewer: Viewer) {
    const salePrice = parseDecimal(dto.salePrice);
    if (!salePrice) throw new BadRequestException('Invalid sale price');
    const purchasePrice =
      viewer.canSeeCost && dto.purchasePrice !== undefined
        ? parseDecimal(dto.purchasePrice)
        : undefined;
    if (purchasePrice === null) throw new BadRequestException('Invalid purchase price');

    const unit = await this.prisma.unit.findUnique({ where: { id: dto.baseUnitId } });
    if (!unit) throw new BadRequestException('Unit not found');
    if (dto.categoryId) {
      const cat = await this.prisma.category.findUnique({ where: { id: dto.categoryId } });
      if (!cat) throw new BadRequestException('Category not found');
    }
    if (dto.taxRateId) {
      const rate = await this.prisma.taxRate.findUnique({ where: { id: dto.taxRateId } });
      if (!rate) throw new BadRequestException('VAT rate not found');
    }

    const packagings = this.validatePackagings(
      dto.packagings ?? [],
      dto.baseUnitId,
      dto.barcode ?? null,
    );
    const unitCount = await this.prisma.unit.count({
      where: { id: { in: packagings.map((p) => p.unitId) } },
    });
    if (unitCount !== packagings.length) throw new BadRequestException('Unit not found');

    // A barcode identifies exactly one product or packaging.
    const barcodes = [dto.barcode, ...packagings.map((p) => p.barcode)].filter(
      (b): b is string => !!b,
    );
    await this.assertBarcodesFree(barcodes, productId);

    return {
      fields: {
        barcode: dto.barcode ?? null,
        name: dto.name,
        description: dto.description ?? null,
        categoryId: dto.categoryId ?? null,
        baseUnitId: dto.baseUnitId,
        taxRateId: dto.taxRateId ?? null,
        salePrice,
        ...(purchasePrice !== undefined && { purchasePrice }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      packagings,
    };
  }

  private validatePackagings(
    list: PackagingDto[],
    baseUnitId: string,
    productBarcode: string | null,
  ) {
    const seenBarcodes = new Set<string>(productBarcode ? [productBarcode] : []);
    return list.map((p) => {
      if (p.unitId === baseUnitId) {
        throw new BadRequestException('A packaging cannot use the base unit of the product');
      }
      const factor = parseDecimal(p.factor);
      if (!factor || factor.lte(0))
        throw new BadRequestException('Packaging quantity must be greater than 0');
      let salePrice: Prisma.Decimal | null = null;
      if (p.salePrice !== undefined && p.salePrice !== null && p.salePrice !== '') {
        salePrice = parseDecimal(p.salePrice);
        if (!salePrice) throw new BadRequestException('Invalid packaging price');
      }
      if (p.barcode) {
        if (seenBarcodes.has(p.barcode))
          throw new ConflictException(`Barcode ${p.barcode} is used twice`);
        seenBarcodes.add(p.barcode);
      }
      return {
        unitId: p.unitId,
        factor,
        barcode: p.barcode ?? null,
        forPurchase: p.forPurchase ?? true,
        forSale: p.forSale ?? true,
        salePrice,
      };
    });
  }

  async assertBarcodesFree(barcodes: string[], productId: string | null, db: Db = this.prisma) {
    if (barcodes.length === 0) return;
    const notSelf = productId ? { not: productId } : undefined;
    const [onProduct, onPackaging] = await Promise.all([
      db.product.findFirst({
        where: { barcode: { in: barcodes }, id: notSelf },
        select: { barcode: true, name: true },
      }),
      db.productUnit.findFirst({
        where: { barcode: { in: barcodes }, productId: notSelf },
        select: { barcode: true, product: { select: { name: true } } },
      }),
    ]);
    const hit = onProduct
      ? { barcode: onProduct.barcode, name: onProduct.name }
      : onPackaging && { barcode: onPackaging.barcode, name: onPackaging.product.name };
    if (hit) throw new ConflictException(`Barcode ${hit.barcode} is already used by "${hit.name}"`);
  }

  private async assertSkuFree(sku: string, productId: string | null, db: Db) {
    const taken = await db.product.findUnique({ where: { sku } });
    if (taken && taken.id !== productId) {
      throw new ConflictException(`Reference ${sku} is already used by "${taken.name}"`);
    }
  }

  /** Next automatic reference: PRD-00001, PRD-00002… */
  async nextSku(db: Db = this.prisma, offset = 0): Promise<string> {
    const last = await db.product.findFirst({
      where: { sku: { startsWith: SKU_PREFIX } },
      orderBy: { sku: 'desc' },
      select: { sku: true },
    });
    const n = last ? Number(last.sku.slice(SKU_PREFIX.length)) || 0 : 0;
    return SKU_PREFIX + String(n + 1 + offset).padStart(SKU_PADDING, '0');
  }

  /** Turns a race on a unique column into a clear 409 instead of a 500. */
  private async withUniqueErrors<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('This reference or barcode is already used by another product');
      }
      throw err;
    }
  }
}

/** Audit snapshot. */
export function snapshot(p: ProductRow) {
  return {
    sku: p.sku,
    name: p.name,
    barcode: p.barcode,
    description: p.description,
    categoryId: p.categoryId,
    baseUnit: p.baseUnit.code,
    taxRate: p.taxRate?.name ?? null,
    salePrice: p.salePrice.toString(),
    purchasePrice: p.purchasePrice.toString(),
    isActive: p.isActive,
    photo: p.photoFile,
    packagings: p.units.map(
      (u) =>
        `${u.unit.code}×${plain(u.factor)}${u.salePrice ? ` @${u.salePrice.toString()}` : ''}${u.barcode ? ` (${u.barcode})` : ''}`,
    ),
  };
}

/** Sale price excl. VAT of one packaging: its own price, or base price × factor. */
export function packagingPrice(
  p: { salePrice: Prisma.Decimal },
  u: { salePrice: Prisma.Decimal | null; factor: Prisma.Decimal },
  decimals: number,
): Prisma.Decimal {
  return (u.salePrice ?? p.salePrice.mul(u.factor)).toDecimalPlaces(
    decimals,
    Prisma.Decimal.ROUND_HALF_UP,
  );
}
