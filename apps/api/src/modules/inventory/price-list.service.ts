import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestUser } from '../../common/types/request-user';
import {
  CreatePriceListDto,
  ImportPricesDto,
  ListPriceItemsQueryDto,
  SetProductPricesDto,
  UpdatePriceListDto,
} from './dto/price-list.dto';
import { CsvRowError, parseCsv, parseDecimal } from './product-csv';
import { listPrice } from './price-utils';

type Tx = Prisma.TransactionClient;

const json = (v: unknown) =>
  v === null ? Prisma.JsonNull : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue);

/**
 * Price lists (Wholesale, Reseller…). Product.salePrice is the base "Retail" price;
 * each list has a % rule and optional fixed prices per product.
 */
@Injectable()
export class PriceListService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const lists = await this.prisma.priceList.findMany({
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { prices: true, customers: true } } },
    });
    return lists.map(({ _count, ...l }) => ({
      ...l,
      fixedPriceCount: _count.prices,
      customerCount: _count.customers,
    }));
  }

  async get(id: string) {
    const list = await this.prisma.priceList.findUnique({ where: { id } });
    if (!list) throw new NotFoundException('Price list not found');
    return list;
  }

  async create(dto: CreatePriceListDto, user: RequestUser) {
    return this.prisma.$transaction(async (tx) => {
      await this.checkUnique(tx, dto.code, dto.name, null);
      const list = await tx.priceList.create({
        data: {
          code: dto.code,
          name: dto.name,
          adjustmentPct: new Prisma.Decimal(dto.adjustmentPct ?? 0),
        },
      });
      await this.audit(tx, user, 'create', list.id, null, list);
      return list;
    });
  }

  async update(id: string, dto: UpdatePriceListDto, user: RequestUser) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.priceList.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Price list not found');
      await this.checkUnique(tx, dto.code, dto.name, id);
      const after = await tx.priceList.update({
        where: { id },
        data: {
          code: dto.code,
          name: dto.name,
          adjustmentPct:
            dto.adjustmentPct !== undefined ? new Prisma.Decimal(dto.adjustmentPct) : undefined,
          isActive: dto.isActive,
        },
      });
      await this.audit(tx, user, 'update', id, before, after);
      return after;
    });
  }

  /** Every active product with its retail price, fixed price (if any) and price in this list. */
  async items(id: string, query: ListPriceItemsQueryDto) {
    const list = await this.get(id);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const where: Prisma.ProductWhereInput = { isActive: true };
    if (query.q) {
      where.OR = [
        { sku: { contains: query.q, mode: 'insensitive' } },
        { name: { contains: query.q, mode: 'insensitive' } },
        { barcode: { contains: query.q } },
      ];
    }
    const [total, products] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          sku: true,
          name: true,
          salePrice: true,
          baseUnit: { select: { code: true } },
          prices: { where: { priceListId: id }, select: { price: true } },
        },
      }),
    ]);
    return {
      priceList: list,
      total,
      page,
      pageSize,
      items: products.map(({ prices, ...p }) => {
        const fixed = prices[0]?.price ?? null;
        return {
          ...p,
          fixedPrice: fixed,
          price: listPrice(p.salePrice, list.adjustmentPct, fixed),
        };
      }),
    };
  }

  /** Prices of one product in every active list (for the product page). */
  async productPrices(productId: string) {
    const [product, lists] = await Promise.all([
      this.prisma.product.findUnique({
        where: { id: productId },
        select: { salePrice: true, prices: true },
      }),
      this.prisma.priceList.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    ]);
    if (!product) throw new NotFoundException('Product not found');
    const fixedBy = new Map(product.prices.map((p) => [p.priceListId, p.price]));
    return lists.map((l) => ({
      priceListId: l.id,
      code: l.code,
      name: l.name,
      adjustmentPct: l.adjustmentPct,
      fixedPrice: fixedBy.get(l.id) ?? null,
      price: listPrice(product.salePrice, l.adjustmentPct, fixedBy.get(l.id)),
    }));
  }

  /** Sets or clears (price = null) fixed prices of one product. */
  async setProductPrices(productId: string, dto: SetProductPricesDto, user: RequestUser) {
    await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: productId },
        include: { prices: true },
      });
      if (!product) throw new NotFoundException('Product not found');
      const ids = [...new Set(dto.prices.map((p) => p.priceListId))];
      if (ids.length !== dto.prices.length) {
        throw new BadRequestException('Each price list may appear only once');
      }
      if ((await tx.priceList.count({ where: { id: { in: ids } } })) !== ids.length) {
        throw new BadRequestException('A price list was not found');
      }
      for (const p of dto.prices) {
        const key = { productId_priceListId: { productId, priceListId: p.priceListId } };
        if (p.price === null) {
          await tx.productPrice.deleteMany({ where: { productId, priceListId: p.priceListId } });
        } else {
          await tx.productPrice.upsert({
            where: key,
            create: { productId, priceListId: p.priceListId, price: new Prisma.Decimal(p.price) },
            update: { price: new Prisma.Decimal(p.price) },
          });
        }
      }
      const after = await tx.productPrice.findMany({ where: { productId } });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'update-prices',
          entity: 'Product',
          entityId: productId,
          before: json(product.prices),
          after: json(after),
        },
      });
    });
    return this.productPrices(productId);
  }

  /** CSV import of fixed prices into one list: sku, price. Empty price clears the fixed price. */
  async importPrices(id: string, dto: ImportPricesDto, user: RequestUser) {
    await this.get(id);
    const table = parseCsv(dto.csv);
    const errors: CsvRowError[] = [];
    const header = (table[0] ?? []).map((h) => h.trim().toLowerCase());
    const skuCol = header.findIndex((h) =>
      ['sku', 'reference', 'référence', 'ref', 'code'].includes(h),
    );
    const priceCol = header.findIndex((h) => ['price', 'prix'].includes(h));
    if (skuCol < 0 || priceCol < 0) {
      throw new BadRequestException('The header must contain the columns sku and price');
    }
    const rows = table.slice(1).map((cells, i) => ({
      line: i + 2,
      sku: (cells[skuCol] ?? '').trim(),
      raw: (cells[priceCol] ?? '').trim(),
    }));
    const products = await this.prisma.product.findMany({
      where: { sku: { in: rows.map((r) => r.sku), mode: 'insensitive' } },
      select: { id: true, sku: true },
    });
    const bySku = new Map(products.map((p) => [p.sku.toUpperCase(), p]));
    const seen = new Map<string, number>();
    const changes: { productId: string; price: number | null }[] = [];
    for (const r of rows) {
      const product = bySku.get(r.sku.toUpperCase());
      if (!r.sku) errors.push({ line: r.line, message: 'sku is required' });
      else if (!product) errors.push({ line: r.line, message: `product ${r.sku} does not exist` });
      const first = seen.get(r.sku.toUpperCase());
      if (r.sku && first)
        errors.push({ line: r.line, message: `${r.sku} already on line ${first}` });
      else seen.set(r.sku.toUpperCase(), r.line);
      const price = r.raw === '' ? null : parseDecimal(r.raw);
      if (price !== null && (Number.isNaN(price) || price < 0)) {
        errors.push({ line: r.line, message: `price "${r.raw}" must be a number ≥ 0` });
      }
      if (product && (price === null || !Number.isNaN(price))) {
        changes.push({ productId: product.id, price });
      }
    }
    if (rows.length === 0) errors.push({ line: 2, message: 'The file has no data rows' });

    const report = {
      dryRun: dto.dryRun ?? false,
      totalRows: rows.length,
      fixed: changes.filter((c) => c.price !== null).length,
      cleared: changes.filter((c) => c.price === null).length,
      errors,
      saved: false,
    };
    if (errors.length > 0 || report.dryRun) return report;

    await this.prisma.$transaction(
      async (tx) => {
        for (const c of changes) {
          if (c.price === null) {
            await tx.productPrice.deleteMany({
              where: { productId: c.productId, priceListId: id },
            });
          } else {
            const price = new Prisma.Decimal(c.price);
            await tx.productPrice.upsert({
              where: { productId_priceListId: { productId: c.productId, priceListId: id } },
              create: { productId: c.productId, priceListId: id, price },
              update: { price },
            });
          }
        }
        await this.audit(tx, user, 'import-prices', id, null, {
          fixed: report.fixed,
          cleared: report.cleared,
        });
      },
      { timeout: 120_000 },
    );
    return { ...report, saved: true };
  }

  private async checkUnique(
    tx: Tx,
    code: string | undefined,
    name: string | undefined,
    exceptId: string | null,
  ) {
    const notThis = exceptId ? { not: exceptId } : undefined;
    if (code && (await tx.priceList.findFirst({ where: { code, id: notThis } }))) {
      throw new ConflictException(`Price list code ${code} is already used`);
    }
    if (
      name &&
      (await tx.priceList.findFirst({
        where: { name: { equals: name, mode: 'insensitive' }, id: notThis },
      }))
    ) {
      throw new ConflictException(`A price list named "${name}" already exists`);
    }
  }

  private audit(
    tx: Tx,
    user: RequestUser,
    action: string,
    id: string,
    before: unknown,
    after: unknown,
  ) {
    return tx.auditLog.create({
      data: {
        userId: user.id,
        action,
        entity: 'PriceList',
        entityId: id,
        before: json(before),
        after: json(after),
      },
    });
  }
}
