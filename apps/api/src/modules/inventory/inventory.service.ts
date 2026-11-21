import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestUser } from '../../common/types/request-user';
import {
  CreateCategoryDto,
  CreateProductDto,
  CreateUnitDto,
  ImportProductsDto,
  ListProductsQueryDto,
  ProductSort,
  ProductUnitDto,
  UpdateCategoryDto,
  UpdateProductDto,
} from './dto/product.dto';
import { CsvRowError, mapProductRows, parseCsv } from './product-csv';
import { listPrice } from './price-utils';

/** Lots expiring within this many days are flagged "expiring soon". */
export const EXPIRY_WARNING_DAYS = 30;

type Tx = Prisma.TransactionClient;

const PRODUCT_DETAIL_INCLUDE = {
  category: { select: { id: true, name: true, parentId: true } },
  baseUnit: { select: { id: true, code: true, name: true } },
  taxRate: { select: { id: true, name: true, rate: true } },
  units: {
    include: { unit: { select: { id: true, code: true, name: true } } },
    orderBy: { factor: 'asc' },
  },
  stockBalances: {
    include: { warehouse: { select: { id: true, code: true, name: true, isActive: true } } },
  },
  lots: {
    orderBy: [{ expiryDate: { sort: 'asc', nulls: 'last' } }, { lotNumber: 'asc' }],
    include: {
      balances: {
        where: { quantity: { not: 0 } },
        include: { warehouse: { select: { id: true, code: true, name: true } } },
      },
    },
  },
} satisfies Prisma.ProductInclude;

const SORTS: Record<ProductSort, Prisma.ProductOrderByWithRelationInput> = {
  name: { name: 'asc' },
  '-name': { name: 'desc' },
  sku: { sku: 'asc' },
  '-sku': { sku: 'desc' },
  salePrice: { salePrice: 'asc' },
  '-salePrice': { salePrice: 'desc' },
  '-createdAt': { createdAt: 'desc' },
};

/** Removes the purchase cost from a product unless the user may see it. */
export function hideCost<T extends { averageCost?: unknown; purchasePrice?: unknown }>(
  product: T,
  user: Pick<RequestUser, 'permissions'>,
): T {
  if (user.permissions.has('inventory.cost.view')) return product;
  const { averageCost: _avg, purchasePrice: _purchase, ...rest } = product;
  return rest as T;
}

/** Purchase prices are confidential: only users who may see costs may set them. */
function assertCanSetCost(user: RequestUser, purchasePrice: unknown) {
  if (
    purchasePrice !== undefined &&
    purchasePrice !== null &&
    !user.permissions.has('inventory.cost.view')
  ) {
    throw new ForbiddenException(
      'You need the inventory.cost.view permission to set purchase prices',
    );
  }
}

/** JSON-safe copy (Decimal → string, Date → ISO) for the audit log. */
function snapshot(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/**
 * Inventory business logic: products, categories and units.
 *  - every create / update / status change writes an AuditLog row in the same transaction
 *  - stock is never edited here: it only changes through stock moves
 */
@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  // ───────────────────────────── Products ─────────────────────────────

  async listProducts(query: ListProductsQueryDto, user: RequestUser) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const where: Prisma.ProductWhereInput = {};

    const status = query.status ?? 'active';
    if (status !== 'all') where.isActive = status === 'active';

    if (query.q) {
      const q = query.q;
      where.OR = [
        { sku: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
        { barcode: { contains: q } },
        { units: { some: { barcode: { contains: q } } } },
      ];
    }

    if (query.categoryId) {
      where.categoryId = { in: await this.categoryWithDescendants(query.categoryId) };
    }

    if (query.lowStock) {
      const rows = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT p.id
        FROM products p
        LEFT JOIN stock_balances b ON b.product_id = p.id
        WHERE p.min_stock > 0
        GROUP BY p.id, p.min_stock
        HAVING COALESCE(SUM(b.quantity), 0) <= p.min_stock`;
      where.id = { in: rows.map((r) => r.id) };
    }

    if (query.expiring) {
      where.lots = {
        some: {
          expiryDate: { lte: new Date(Date.now() + EXPIRY_WARNING_DAYS * 86_400_000) },
          balances: { some: { quantity: { gt: 0 } } },
        },
      };
    }

    const priceList = query.priceListId
      ? await this.prisma.priceList.findUnique({ where: { id: query.priceListId } })
      : null;
    if (query.priceListId && !priceList) throw new NotFoundException('Price list not found');

    const [total, products] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        orderBy: [SORTS[query.sort ?? 'name'], { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          category: { select: { id: true, name: true } },
          baseUnit: { select: { id: true, code: true, name: true } },
          taxRate: { select: { id: true, name: true, rate: true } },
          stockBalances: { select: { quantity: true } },
          prices: priceList
            ? { where: { priceListId: priceList.id }, select: { price: true } }
            : false,
        },
      }),
    ]);

    const items = products.map(({ stockBalances, prices, ...p }) => {
      const onHand = stockBalances.reduce((sum, b) => sum.plus(b.quantity), new Prisma.Decimal(0));
      return hideCost(
        {
          ...p,
          onHand,
          isLowStock: p.minStock.gt(0) && onHand.lte(p.minStock),
          /** Price in the requested price list (only when priceListId was given) */
          listPrice: priceList
            ? listPrice(p.salePrice, priceList.adjustmentPct, prices?.[0]?.price)
            : undefined,
        },
        user,
      );
    });

    return { items, total, page, pageSize };
  }

  /**
   * Exact lookup for barcode scanners: matches the product barcode, a packaging
   * barcode (e.g. the carton) or the SKU. Returns null when nothing matches.
   */
  async findByCode(code: string, user: RequestUser) {
    const value = code.trim();
    const product = await this.prisma.product.findFirst({
      where: {
        OR: [
          { barcode: value },
          { units: { some: { barcode: value } } },
          { sku: { equals: value, mode: 'insensitive' } },
        ],
      },
      include: PRODUCT_DETAIL_INCLUDE,
      orderBy: { isActive: 'desc' },
    });
    if (!product) return { product: null, matchedUnit: null };
    const unit = product.units.find((u) => u.barcode === value);
    return {
      product: hideCost(this.withStock(product), user),
      /** Set when the code is a packaging barcode, e.g. { code: 'CTN', factor: '24' } */
      matchedUnit: unit ? { code: unit.unit.code, factor: unit.factor } : null,
    };
  }

  async getProduct(id: string, user: RequestUser) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: PRODUCT_DETAIL_INCLUDE,
    });
    if (!product) throw new NotFoundException('Product not found');
    return hideCost(this.withStock(product), user);
  }

  async createProduct(dto: CreateProductDto, user: RequestUser) {
    assertCanSetCost(user, dto.purchasePrice);
    const created = await this.prisma.$transaction(async (tx) => {
      await this.checkProductRefs(tx, dto);
      await this.checkUniqueCodes(tx, dto, null);

      const product = await tx.product.create({
        data: {
          sku: dto.sku,
          barcode: dto.barcode ?? null,
          name: dto.name,
          description: dto.description ?? null,
          categoryId: dto.categoryId ?? null,
          baseUnitId: dto.baseUnitId,
          taxRateId: dto.taxRateId ?? null,
          salePrice: new Prisma.Decimal(dto.salePrice ?? 0),
          purchasePrice: new Prisma.Decimal(dto.purchasePrice ?? 0),
          minStock: new Prisma.Decimal(dto.minStock ?? 0),
          trackLots: dto.trackLots ?? false,
          units: { create: this.unitRows(dto.units, dto.baseUnitId) },
        },
        include: PRODUCT_DETAIL_INCLUDE,
      });
      await this.audit(tx, user, 'create', 'Product', product.id, null, product);
      return product;
    });
    return hideCost(this.withStock(created), user);
  }

  async updateProduct(id: string, dto: UpdateProductDto, user: RequestUser) {
    assertCanSetCost(user, dto.purchasePrice);
    const updated = await this.prisma.$transaction(async (tx) => {
      const before = await tx.product.findUnique({
        where: { id },
        include: { units: true },
      });
      if (!before) throw new NotFoundException('Product not found');

      const baseUnitId = dto.baseUnitId ?? before.baseUnitId;
      const changesBaseUnit = !!dto.baseUnitId && dto.baseUnitId !== before.baseUnitId;
      const changesLots = dto.trackLots !== undefined && dto.trackLots !== before.trackLots;
      if (changesBaseUnit || changesLots) {
        const moves = await tx.stockMove.count({ where: { productId: id } });
        if (moves > 0) {
          throw new BadRequestException(
            changesBaseUnit
              ? 'The base unit cannot be changed: this product already has stock movements'
              : 'Lot tracking cannot be switched on or off: this product already has stock movements',
          );
        }
      }

      await this.checkProductRefs(tx, { ...dto, baseUnitId });
      await this.checkUniqueCodes(tx, dto, id);

      if (dto.units !== undefined) {
        await tx.productUnit.deleteMany({ where: { productId: id } });
      }

      const product = await tx.product.update({
        where: { id },
        data: {
          sku: dto.sku,
          barcode: dto.barcode,
          name: dto.name,
          description: dto.description,
          categoryId: dto.categoryId,
          baseUnitId: dto.baseUnitId,
          taxRateId: dto.taxRateId,
          salePrice: dto.salePrice !== undefined ? new Prisma.Decimal(dto.salePrice) : undefined,
          purchasePrice:
            dto.purchasePrice !== undefined ? new Prisma.Decimal(dto.purchasePrice) : undefined,
          minStock: dto.minStock !== undefined ? new Prisma.Decimal(dto.minStock) : undefined,
          trackLots: dto.trackLots,
          units:
            dto.units !== undefined ? { create: this.unitRows(dto.units, baseUnitId) } : undefined,
        },
        include: PRODUCT_DETAIL_INCLUDE,
      });
      await this.audit(tx, user, 'update', 'Product', id, before, product);
      return product;
    });
    return hideCost(this.withStock(updated), user);
  }

  async setProductActive(id: string, isActive: boolean, user: RequestUser) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const before = await tx.product.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Product not found');
      const product = await tx.product.update({
        where: { id },
        data: { isActive },
        include: PRODUCT_DETAIL_INCLUDE,
      });
      if (before.isActive !== isActive) {
        await this.audit(
          tx,
          user,
          isActive ? 'activate' : 'deactivate',
          'Product',
          id,
          { isActive: before.isActive },
          { isActive },
        );
      }
      return product;
    });
    return hideCost(this.withStock(updated), user);
  }

  /**
   * CSV import. Rows are matched by SKU: existing products are updated, new ones created.
   * All-or-nothing: if any row has an error nothing is saved. Unknown categories are created
   * (top level); unknown units are an error. Empty cells leave the existing value unchanged.
   */
  async importProducts(dto: ImportProductsDto, user: RequestUser) {
    const { rows, errors } = mapProductRows(parseCsv(dto.csv));
    if (rows.some((r) => r.purchasePrice !== null)) assertCanSetCost(user, 0);
    if (rows.length > 5000) {
      throw new BadRequestException('At most 5000 products per import');
    }

    const [units, categories, existing] = await Promise.all([
      this.prisma.unit.findMany(),
      this.prisma.category.findMany({ where: { parentId: null } }),
      this.prisma.product.findMany({
        where: { sku: { in: rows.map((r) => r.sku), mode: 'insensitive' } },
        select: { id: true, sku: true, barcode: true },
      }),
    ]);
    const unitByCode = new Map(units.map((u) => [u.code.toUpperCase(), u]));
    const categoryByName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));
    const existingBySku = new Map(existing.map((p) => [p.sku.toUpperCase(), p]));
    const defaultUnit = unitByCode.get('PCS') ?? units[0];

    // Barcodes must stay unique across products.
    const barcodes = rows.map((r) => r.barcode).filter((b): b is string => !!b);
    const barcodeOwners = await this.prisma.product.findMany({
      where: { barcode: { in: barcodes } },
      select: { sku: true, barcode: true },
    });
    const ownerByBarcode = new Map(barcodeOwners.map((p) => [p.barcode!, p.sku.toUpperCase()]));
    const seenBarcodes = new Map<string, number>();

    for (const row of rows) {
      const isNew = !existingBySku.has(row.sku.toUpperCase());
      if (row.unit && !unitByCode.has(row.unit)) {
        errors.push({ line: row.line, message: `unit "${row.unit}" does not exist` });
      }
      if (isNew && !row.unit && !defaultUnit) {
        errors.push({ line: row.line, message: 'unit is required (no default unit exists)' });
      }
      if (row.barcode) {
        const owner = ownerByBarcode.get(row.barcode);
        if (owner && owner !== row.sku.toUpperCase()) {
          errors.push({
            line: row.line,
            message: `barcode ${row.barcode} already belongs to product ${owner}`,
          });
        }
        const firstLine = seenBarcodes.get(row.barcode);
        if (firstLine) {
          errors.push({
            line: row.line,
            message: `barcode ${row.barcode} already appears on line ${firstLine}`,
          });
        } else seenBarcodes.set(row.barcode, row.line);
      }
    }

    errors.sort((a, b) => a.line - b.line);
    const toCreate = rows.filter((r) => !existingBySku.has(r.sku.toUpperCase())).length;
    const report = {
      dryRun: dto.dryRun ?? false,
      totalRows: rows.length,
      created: toCreate,
      updated: rows.length - toCreate,
      newCategories: [
        ...new Set(
          rows
            .map((r) => r.category)
            .filter((c): c is string => !!c && !categoryByName.has(c.toLowerCase())),
        ),
      ],
      errors: errors as CsvRowError[],
      saved: false,
    };
    if (errors.length > 0 || report.dryRun) return report;

    await this.prisma.$transaction(
      async (tx) => {
        for (const row of rows) {
          let categoryId: string | null | undefined = undefined;
          if (row.category) {
            const key = row.category.toLowerCase();
            let category = categoryByName.get(key);
            if (!category) {
              category = await tx.category.create({ data: { name: row.category } });
              categoryByName.set(key, category);
              await this.audit(tx, user, 'create', 'Category', category.id, null, category);
            }
            categoryId = category.id;
          }

          const current = existingBySku.get(row.sku.toUpperCase());
          if (current) {
            const before = await tx.product.findUniqueOrThrow({ where: { id: current.id } });
            const after = await tx.product.update({
              where: { id: current.id },
              data: {
                name: row.name,
                barcode: row.barcode ?? undefined,
                description: row.description ?? undefined,
                categoryId,
                salePrice: row.salePrice !== null ? new Prisma.Decimal(row.salePrice) : undefined,
                purchasePrice:
                  row.purchasePrice !== null ? new Prisma.Decimal(row.purchasePrice) : undefined,
                minStock: row.minStock !== null ? new Prisma.Decimal(row.minStock) : undefined,
              },
            });
            await this.audit(tx, user, 'import', 'Product', current.id, before, after);
          } else {
            const unit = row.unit ? unitByCode.get(row.unit)! : defaultUnit;
            const product = await tx.product.create({
              data: {
                sku: row.sku,
                name: row.name,
                barcode: row.barcode,
                description: row.description,
                categoryId: categoryId ?? null,
                baseUnitId: unit.id,
                salePrice: new Prisma.Decimal(row.salePrice ?? 0),
                purchasePrice: new Prisma.Decimal(row.purchasePrice ?? 0),
                minStock: new Prisma.Decimal(row.minStock ?? 0),
              },
            });
            await this.audit(tx, user, 'import', 'Product', product.id, null, product);
          }
        }
      },
      { timeout: 120_000 },
    );

    return { ...report, saved: true };
  }

  // ──────────────────────────── Categories ────────────────────────────

  /** All categories as a tree, with the number of products directly in each one. */
  async listCategories() {
    const categories = await this.prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { products: true } } },
    });
    type Node = {
      id: string;
      name: string;
      parentId: string | null;
      isActive: boolean;
      productCount: number;
      children: Node[];
    };
    const nodes = new Map<string, Node>(
      categories.map((c) => [
        c.id,
        {
          id: c.id,
          name: c.name,
          parentId: c.parentId,
          isActive: c.isActive,
          productCount: c._count.products,
          children: [],
        },
      ]),
    );
    const roots: Node[] = [];
    for (const node of nodes.values()) {
      const parent = node.parentId ? nodes.get(node.parentId) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    return roots;
  }

  async createCategory(dto: CreateCategoryDto, user: RequestUser) {
    return this.prisma.$transaction(async (tx) => {
      const parentId = dto.parentId ?? null;
      if (parentId && !(await tx.category.findUnique({ where: { id: parentId } }))) {
        throw new BadRequestException('Parent category not found');
      }
      await this.checkCategoryName(tx, dto.name, parentId, null);
      const category = await tx.category.create({ data: { name: dto.name, parentId } });
      await this.audit(tx, user, 'create', 'Category', category.id, null, category);
      return category;
    });
  }

  async updateCategory(id: string, dto: UpdateCategoryDto, user: RequestUser) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.category.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Category not found');

      const parentId = dto.parentId !== undefined ? dto.parentId : before.parentId;
      if (dto.parentId) {
        if (dto.parentId === id)
          throw new BadRequestException('A category cannot be its own parent');
        const descendants = await this.categoryWithDescendants(id, tx);
        if (descendants.includes(dto.parentId)) {
          throw new BadRequestException(
            'A category cannot be moved under one of its sub-categories',
          );
        }
        if (!(await tx.category.findUnique({ where: { id: dto.parentId } }))) {
          throw new BadRequestException('Parent category not found');
        }
      }
      const name = dto.name ?? before.name;
      if (dto.name !== undefined || dto.parentId !== undefined) {
        await this.checkCategoryName(tx, name, parentId, id);
      }

      const category = await tx.category.update({
        where: { id },
        data: { name: dto.name, parentId: dto.parentId, isActive: dto.isActive },
      });
      await this.audit(tx, user, 'update', 'Category', id, before, category);
      return category;
    });
  }

  // ─────────────────────────────── Units ──────────────────────────────

  listUnits() {
    return this.prisma.unit.findMany({
      orderBy: { code: 'asc' },
      include: { _count: { select: { baseProducts: true, productUnits: true } } },
    });
  }

  async createUnit(dto: CreateUnitDto, user: RequestUser) {
    return this.prisma.$transaction(async (tx) => {
      if (await tx.unit.findUnique({ where: { code: dto.code } })) {
        throw new ConflictException(`Unit ${dto.code} already exists`);
      }
      const unit = await tx.unit.create({ data: dto });
      await this.audit(tx, user, 'create', 'Unit', unit.id, null, unit);
      return unit;
    });
  }

  /** Active tax rates, for the product form. */
  async listTaxRates() {
    const [rates, company] = await Promise.all([
      this.prisma.taxRate.findMany({ where: { isActive: true }, orderBy: { rate: 'asc' } }),
      this.prisma.companySettings.findUnique({
        where: { id: 1 },
        select: { defaultTaxRateId: true },
      }),
    ]);
    return rates.map((r) => ({ ...r, isDefault: r.id === company?.defaultTaxRateId }));
  }

  // ────────────────────────────── Helpers ─────────────────────────────

  private withStock<
    T extends {
      minStock: Prisma.Decimal;
      stockBalances: { quantity: Prisma.Decimal }[];
    },
  >(product: T) {
    const onHand = product.stockBalances.reduce(
      (sum, b) => sum.plus(b.quantity),
      new Prisma.Decimal(0),
    );
    return {
      ...product,
      onHand,
      isLowStock: product.minStock.gt(0) && onHand.lte(product.minStock),
    };
  }

  private unitRows(units: ProductUnitDto[] | undefined, baseUnitId: string) {
    if (!units) return [];
    const seen = new Set<string>();
    for (const u of units) {
      if (u.unitId === baseUnitId) {
        throw new BadRequestException(
          'The base unit cannot also be an alternative unit (its factor is always 1)',
        );
      }
      if (seen.has(u.unitId))
        throw new BadRequestException('Each alternative unit can appear only once');
      seen.add(u.unitId);
    }
    return units.map((u) => ({
      unitId: u.unitId,
      factor: new Prisma.Decimal(u.factor),
      forPurchase: u.forPurchase ?? true,
      forSale: u.forSale ?? true,
      barcode: u.barcode ?? null,
    }));
  }

  private async checkProductRefs(
    tx: Tx,
    dto: Pick<UpdateProductDto, 'categoryId' | 'taxRateId' | 'units'> & { baseUnitId?: string },
  ) {
    if (dto.baseUnitId && !(await tx.unit.findUnique({ where: { id: dto.baseUnitId } }))) {
      throw new BadRequestException('Base unit not found');
    }
    if (dto.categoryId && !(await tx.category.findUnique({ where: { id: dto.categoryId } }))) {
      throw new BadRequestException('Category not found');
    }
    if (dto.taxRateId && !(await tx.taxRate.findUnique({ where: { id: dto.taxRateId } }))) {
      throw new BadRequestException('Tax rate not found');
    }
    if (dto.units?.length) {
      const ids = [...new Set(dto.units.map((u) => u.unitId))];
      const found = await tx.unit.count({ where: { id: { in: ids } } });
      if (found !== ids.length) throw new BadRequestException('An alternative unit was not found');
    }
  }

  /** SKU and barcodes (product + alternative units) must be unique across all products. */
  private async checkUniqueCodes(tx: Tx, dto: UpdateProductDto, productId: string | null) {
    const notThis = productId ? { not: productId } : undefined;
    if (dto.sku) {
      const clash = await tx.product.findFirst({
        where: { sku: { equals: dto.sku, mode: 'insensitive' }, id: notThis },
        select: { sku: true },
      });
      if (clash) throw new ConflictException(`SKU ${clash.sku} is already used by another product`);
    }

    const barcodes = [dto.barcode, ...(dto.units ?? []).map((u) => u.barcode)].filter(
      (b): b is string => !!b,
    );
    if (new Set(barcodes).size !== barcodes.length) {
      throw new BadRequestException('The same barcode is entered twice');
    }
    if (barcodes.length === 0) return;

    const [onProduct, onUnit] = await Promise.all([
      tx.product.findFirst({
        where: { barcode: { in: barcodes }, id: notThis },
        select: { sku: true, barcode: true },
      }),
      tx.productUnit.findFirst({
        where: { barcode: { in: barcodes }, productId: notThis },
        select: { barcode: true, product: { select: { sku: true } } },
      }),
    ]);
    if (onProduct) {
      throw new ConflictException(
        `Barcode ${onProduct.barcode} is already used by ${onProduct.sku}`,
      );
    }
    if (onUnit) {
      throw new ConflictException(
        `Barcode ${onUnit.barcode} is already used by ${onUnit.product.sku}`,
      );
    }
  }

  private async checkCategoryName(
    tx: Tx,
    name: string,
    parentId: string | null,
    exceptId: string | null,
  ) {
    const clash = await tx.category.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        parentId,
        id: exceptId ? { not: exceptId } : undefined,
      },
    });
    if (clash) throw new ConflictException(`A category named "${name}" already exists here`);
  }

  private async categoryWithDescendants(rootId: string, client: Tx | PrismaService = this.prisma) {
    const all = await client.category.findMany({ select: { id: true, parentId: true } });
    const ids = [rootId];
    for (let i = 0; i < ids.length; i++) {
      for (const c of all) if (c.parentId === ids[i]) ids.push(c.id);
    }
    return ids;
  }

  private audit(
    tx: Tx,
    user: RequestUser,
    action: string,
    entity: string,
    entityId: string,
    before: unknown,
    after: unknown,
  ) {
    return tx.auditLog.create({
      data: {
        userId: user.id,
        action,
        entity,
        entityId,
        before: before === null ? Prisma.JsonNull : snapshot(before),
        after: after === null ? Prisma.JsonNull : snapshot(after),
      },
    });
  }
}
