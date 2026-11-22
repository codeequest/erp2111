import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  Paginated,
  PriceLine,
  PriceListProductRow,
  PriceListRow,
  ProductLabel,
  ProductListPrices,
} from '@erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestUser } from '../../common/types/request-user';
import { audit } from '../../common/audit';
import {
  CreatePriceListDto,
  LabelsQueryDto,
  PriceListProductsQueryDto,
  SetProductPricesDto,
  UpdatePriceListDto,
} from './dto/price-list.dto';
import { listPrice, standardPrice } from './pricing';
import { productImageUrl } from './products.service';

/** A product with what is needed to price each of its selling units. */
const PRICING_INCLUDE = {
  baseUnit: { select: { id: true, code: true, name: true } },
  units: {
    where: { forSale: true },
    include: { unit: { select: { id: true, code: true, name: true } } },
    orderBy: { factor: 'asc' },
  },
} satisfies Prisma.ProductInclude;

type PricedProduct = Prisma.ProductGetPayload<{ include: typeof PRICING_INCLUDE }>;

/** Price lists (Wholesale, Retail…) and the prices they charge. */
@Injectable()
export class PriceListsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Lists ──────────────────────────────────────────────────────────────────

  async list(includeInactive: boolean): Promise<PriceListRow[]> {
    const rows = await this.prisma.priceList.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: { _count: { select: { items: true } } },
      orderBy: { name: 'asc' },
    });
    return rows.map(toRow);
  }

  async get(id: string): Promise<PriceListRow> {
    const row = await this.prisma.priceList.findUnique({
      where: { id },
      include: { _count: { select: { items: true } } },
    });
    if (!row) throw new NotFoundException('Price list not found');
    return toRow(row);
  }

  async create(dto: CreatePriceListDto, user: RequestUser): Promise<PriceListRow> {
    assertPercent(dto.adjustPercent);
    await this.assertNameFree(dto.name);
    const created = await this.prisma.$transaction(async (tx) => {
      const pl = await tx.priceList.create({
        data: {
          name: dto.name,
          description: dto.description ?? null,
          adjustPercent: dto.adjustPercent,
        },
      });
      await audit(tx, user, 'create', 'PriceList', pl.id, null, snapshot(pl));
      return pl;
    });
    return this.get(created.id);
  }

  async update(id: string, dto: UpdatePriceListDto, user: RequestUser): Promise<PriceListRow> {
    const existing = await this.prisma.priceList.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Price list not found');
    if (dto.adjustPercent !== undefined) assertPercent(dto.adjustPercent);
    if (dto.name && dto.name.toLowerCase() !== existing.name.toLowerCase()) {
      await this.assertNameFree(dto.name, id);
    }
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.priceList.update({
        where: { id },
        data: {
          name: dto.name,
          description: dto.description,
          adjustPercent: dto.adjustPercent,
          isActive: dto.isActive,
        },
      });
      const before = snapshot(existing);
      const after = snapshot(updated);
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        await audit(tx, user, 'update', 'PriceList', id, before, after);
      }
    });
    return this.get(id);
  }

  // ── Prices ─────────────────────────────────────────────────────────────────

  /** Products with their prices in one list (the price list editor). */
  async products(
    id: string,
    query: PriceListProductsQueryDto,
  ): Promise<Paginated<PriceListProductRow>> {
    const list = await this.prisma.priceList.findUnique({ where: { id } });
    if (!list) throw new NotFoundException('Price list not found');

    const where: Prisma.ProductWhereInput = { isActive: true };
    if (query.search) {
      const contains = { contains: query.search, mode: 'insensitive' as const };
      where.OR = [{ name: contains }, { sku: contains }, { barcode: contains }];
    }
    if (query.onlyFixed) where.priceListItems = { some: { priceListId: id } };

    const [total, products] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include: PRICING_INCLUDE,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    const fixed = await this.fixedPrices(
      [id],
      products.map((p) => p.id),
    );

    return {
      items: products.map((p) => ({
        product: { id: p.id, sku: p.sku, name: p.name, imageUrl: productImageUrl(p.imageFile) },
        lines: priceLines(p, list.adjustPercent, fixed.get(`${id}|${p.id}`)),
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** Sets or removes the fixed prices of one product in one list. */
  async setProductPrices(
    listId: string,
    productId: string,
    dto: SetProductPricesDto,
    user: RequestUser,
  ): Promise<PriceListProductRow> {
    const list = await this.prisma.priceList.findUnique({ where: { id: listId } });
    if (!list) throw new NotFoundException('Price list not found');
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: PRICING_INCLUDE,
    });
    if (!product) throw new NotFoundException('Product not found');

    const sellable = new Map(sellingUnits(product).map((u) => [u.unit.id, u.unit.code]));
    const seen = new Set<string>();
    for (const p of dto.prices) {
      if (!sellable.has(p.unitId)) {
        throw new BadRequestException(
          'Prices can only be set for the base unit or a pack size sold',
        );
      }
      if (seen.has(p.unitId)) throw new BadRequestException('Each unit can be listed only once');
      seen.add(p.unitId);
    }

    const existing = await this.prisma.priceListItem.findMany({
      where: { priceListId: listId, productId },
    });
    const current = new Map(existing.map((i) => [i.unitId, i.price.toString()]));

    await this.prisma.$transaction(async (tx) => {
      const before: Record<string, string | null> = {};
      const after: Record<string, string | null> = {};
      for (const p of dto.prices) {
        const was = current.get(p.unitId) ?? null;
        const now = p.price === null ? null : new Prisma.Decimal(p.price).toString();
        if (was === now) continue;
        if (now === null) {
          await tx.priceListItem.delete({
            where: {
              priceListId_productId_unitId: { priceListId: listId, productId, unitId: p.unitId },
            },
          });
        } else {
          await tx.priceListItem.upsert({
            where: {
              priceListId_productId_unitId: { priceListId: listId, productId, unitId: p.unitId },
            },
            create: { priceListId: listId, productId, unitId: p.unitId, price: now },
            update: { price: now },
          });
        }
        const key = `${list.name} price (${sellable.get(p.unitId)})`;
        before[key] = was;
        after[key] = now;
      }
      if (Object.keys(after).length) {
        await audit(tx, user, 'price list', 'Product', productId, before, after);
      }
    });

    const fixed = await this.fixedPrices([listId], [productId]);
    return {
      product: {
        id: product.id,
        sku: product.sku,
        name: product.name,
        imageUrl: productImageUrl(product.imageFile),
      },
      lines: priceLines(product, list.adjustPercent, fixed.get(`${listId}|${productId}`)),
    };
  }

  /** A product's prices in every active list (product page). */
  async pricesForProduct(productId: string): Promise<ProductListPrices[]> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: PRICING_INCLUDE,
    });
    if (!product) throw new NotFoundException('Product not found');
    const lists = await this.prisma.priceList.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    const fixed = await this.fixedPrices(
      lists.map((l) => l.id),
      [productId],
    );
    return lists.map((l) => ({
      priceList: { id: l.id, name: l.name, adjustPercent: l.adjustPercent.toString() },
      lines: priceLines(product, l.adjustPercent, fixed.get(`${l.id}|${productId}`)),
    }));
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  /** Data for printing shelf labels, in the order the ids were given. */
  async labels(query: LabelsQueryDto): Promise<ProductLabel[]> {
    const ids = [...new Set(query.ids)];
    const products = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      include: { baseUnit: { select: { code: true } } },
    });
    let adjust: Prisma.Decimal | null = null;
    let fixed = new Map<string, Map<string, string>>();
    if (query.priceListId) {
      const list = await this.prisma.priceList.findUnique({ where: { id: query.priceListId } });
      if (!list) throw new NotFoundException('Price list not found');
      adjust = list.adjustPercent;
      fixed = await this.fixedPrices([list.id], ids);
    }
    const byId = new Map(products.map((p) => [p.id, p]));
    return ids.flatMap((id) => {
      const p = byId.get(id);
      if (!p) return [];
      const price = adjust
        ? listPrice(
            p.salePrice,
            1,
            adjust,
            fixed.get(`${query.priceListId}|${id}`)?.get(p.baseUnitId),
          )
        : standardPrice(p.salePrice, 1);
      return [
        {
          id: p.id,
          sku: p.sku,
          name: p.name,
          barcode: p.barcode,
          unitCode: p.baseUnit.code,
          price: price.toString(),
        },
      ];
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Fixed prices keyed by "listId|productId", then by unit id. */
  private async fixedPrices(listIds: string[], productIds: string[]) {
    const items = await this.prisma.priceListItem.findMany({
      where: { priceListId: { in: listIds }, productId: { in: productIds } },
    });
    const out = new Map<string, Map<string, string>>();
    for (const i of items) {
      const key = `${i.priceListId}|${i.productId}`;
      const m = out.get(key) ?? new Map<string, string>();
      m.set(i.unitId, i.price.toString());
      out.set(key, m);
    }
    return out;
  }

  private async assertNameFree(name: string, exceptId?: string) {
    const clash = await this.prisma.priceList.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
    });
    if (clash) throw new ConflictException(`A price list named "${clash.name}" already exists`);
  }
}

function assertPercent(v: string) {
  const n = Number(v);
  if (!(n > -90 && n <= 1000)) {
    throw new BadRequestException('adjustPercent must be above -90 and at most 1000');
  }
}

/** The base unit plus every pack size sold. */
function sellingUnits(p: PricedProduct) {
  return [
    { unit: p.baseUnit, factor: new Prisma.Decimal(1) },
    ...p.units.map((u) => ({ unit: u.unit, factor: u.factor })),
  ];
}

export function priceLines(
  p: PricedProduct,
  adjustPercent: Prisma.Decimal,
  fixed: Map<string, string> | undefined,
): PriceLine[] {
  return sellingUnits(p).map(({ unit, factor }) => {
    const own = fixed?.get(unit.id);
    return {
      unit,
      factor: factor.toString(),
      standardPrice: standardPrice(p.salePrice, factor).toString(),
      price: listPrice(p.salePrice, factor, adjustPercent, own).toString(),
      fixed: own !== undefined,
    };
  });
}

function toRow(pl: {
  id: string;
  name: string;
  description: string | null;
  adjustPercent: Prisma.Decimal;
  isActive: boolean;
  _count: { items: number };
}): PriceListRow {
  return {
    id: pl.id,
    name: pl.name,
    description: pl.description,
    adjustPercent: pl.adjustPercent.toString(),
    isActive: pl.isActive,
    itemCount: pl._count.items,
  };
}

function snapshot(pl: {
  name: string;
  description: string | null;
  adjustPercent: Prisma.Decimal;
  isActive: boolean;
}) {
  return {
    name: pl.name,
    description: pl.description,
    adjustPercent: pl.adjustPercent.toString(),
    isActive: pl.isActive,
  };
}
