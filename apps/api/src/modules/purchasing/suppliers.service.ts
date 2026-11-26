import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Paginated, SupplierDetail, SupplierListItem, SupplierLookups } from '@erp/shared';
import { audit } from '../../common/audit';
import { RequestUser } from '../../common/types/request-user';
import { PrismaService } from '../../prisma/prisma.service';
import { rethrowPrismaError, toAuditJson } from '../inventory/prisma-errors';
import { CreateSupplierDto, ListSuppliersQueryDto, UpdateSupplierDto } from './dto/supplier.dto';
import { MONEY_DECIMALS, nextSupplierCode, toDateString } from './purchase-order-rules';

/** Orders that are still expected to be (fully) received. */
const OPEN_STATUSES = ['CONFIRMED', 'PARTIALLY_RECEIVED'] as const;

const TAX_RATE_SELECT = { select: { id: true, name: true, rate: true } } as const;
type SupplierRow = Prisma.SupplierGetPayload<{ include: { taxRate: typeof TAX_RATE_SELECT } }>;

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListSuppliersQueryDto): Promise<Paginated<SupplierListItem>> {
    const where = supplierWhere(query);
    const [rows, total] = await Promise.all([
      this.prisma.supplier.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          taxRate: TAX_RATE_SELECT,
          _count: { select: { purchaseOrders: { where: { status: { in: [...OPEN_STATUSES] } } } } },
        },
      }),
      this.prisma.supplier.count({ where }),
    ]);
    return {
      items: rows.map((s) => toListItem(s, s._count.purchaseOrders)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** Choices for the supplier form: the active tax rates, highest first. */
  async lookups(): Promise<SupplierLookups> {
    const rates = await this.prisma.taxRate.findMany({
      where: { isActive: true },
      orderBy: [{ rate: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, rate: true },
    });
    return { taxRates: rates.map((r) => ({ ...r, rate: r.rate.toFixed(2) })) };
  }

  async get(id: string): Promise<SupplierDetail> {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id },
      include: { taxRate: TAX_RATE_SELECT },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');

    const [openOrders, sums, last] = await Promise.all([
      this.prisma.purchaseOrder.count({
        where: { supplierId: id, status: { in: [...OPEN_STATUSES] } },
      }),
      this.prisma.purchaseOrder.aggregate({
        where: { supplierId: id, status: { notIn: ['DRAFT', 'CANCELLED'] } },
        _sum: { total: true },
      }),
      this.prisma.purchaseOrder.findFirst({
        where: { supplierId: id, status: { not: 'CANCELLED' } },
        orderBy: { orderDate: 'desc' },
        select: { orderDate: true },
      }),
    ]);
    return {
      ...toListItem(supplier, openOrders),
      address: supplier.address,
      notes: supplier.notes,
      createdAt: supplier.createdAt.toISOString(),
      updatedAt: supplier.updatedAt.toISOString(),
      orderedTotal: (sums._sum.total ?? new Prisma.Decimal(0)).toFixed(MONEY_DECIMALS),
      lastOrderDate: last ? toDateString(last.orderDate) : null,
    };
  }

  async create(dto: CreateSupplierDto, user: RequestUser): Promise<SupplierDetail> {
    const id = await this.prisma
      .$transaction(async (tx) => {
        if (dto.taxRateId) await requireActiveTaxRate(tx, dto.taxRateId);
        const code = dto.code || (await this.nextCode(tx));
        const created = await tx.supplier.create({
          data: {
            code,
            name: dto.name,
            rne: dto.rne ?? null,
            email: dto.email ?? null,
            phone: dto.phone ?? null,
            address: dto.address ?? null,
            taxId: dto.taxId ?? null,
            taxRateId: dto.taxRateId ?? null,
            paymentTermDays: dto.paymentTermDays ?? 0,
            notes: dto.notes ?? null,
          },
        });
        await audit(
          tx,
          user,
          'create',
          'Supplier',
          created.id,
          null,
          toAuditJson(created) as Prisma.InputJsonObject,
        );
        return created.id;
      })
      .catch((err) => rethrowPrismaError(err, 'Supplier'));
    return this.get(id);
  }

  async update(id: string, dto: UpdateSupplierDto, user: RequestUser): Promise<SupplierDetail> {
    await this.prisma
      .$transaction(async (tx) => {
        const before = await tx.supplier.findUnique({ where: { id } });
        if (!before) throw new NotFoundException('Supplier not found');
        if (dto.code === '') {
          throw new ConflictException('The code of an existing supplier cannot be emptied');
        }
        if (dto.taxRateId && dto.taxRateId !== before.taxRateId) {
          await requireActiveTaxRate(tx, dto.taxRateId);
        }
        const after = await tx.supplier.update({
          where: { id },
          data: {
            ...(dto.code !== undefined && { code: dto.code }),
            ...(dto.name !== undefined && { name: dto.name }),
            ...(dto.rne !== undefined && { rne: dto.rne }),
            ...(dto.email !== undefined && { email: dto.email }),
            ...(dto.phone !== undefined && { phone: dto.phone }),
            ...(dto.address !== undefined && { address: dto.address }),
            ...(dto.taxId !== undefined && { taxId: dto.taxId }),
            ...(dto.taxRateId !== undefined && { taxRateId: dto.taxRateId }),
            ...(dto.paymentTermDays !== undefined && { paymentTermDays: dto.paymentTermDays }),
            ...(dto.notes !== undefined && { notes: dto.notes }),
            ...(dto.isActive !== undefined && { isActive: dto.isActive }),
          },
        });
        const action =
          dto.isActive === false && before.isActive
            ? 'deactivate'
            : dto.isActive === true && !before.isActive
              ? 'activate'
              : 'update';
        await audit(
          tx,
          user,
          action,
          'Supplier',
          id,
          toAuditJson(before) as Prisma.InputJsonObject,
          toAuditJson(after) as Prisma.InputJsonObject,
        );
      })
      .catch((err) => rethrowPrismaError(err, 'Supplier'));
    return this.get(id);
  }

  /** Highest number among SUP-<digits> codes, ignoring hand-typed codes like SUP-ACME. */
  private async nextCode(tx: Prisma.TransactionClient): Promise<string> {
    const [row] = await tx.$queryRaw<{ max: number | null }[]>`
      SELECT max(substring(code from 5)::bigint)::int AS max
      FROM suppliers
      WHERE code ~ '^SUP-[0-9]{1,9}$'`;
    return nextSupplierCode(row?.max ?? null);
  }
}

/** The list filters (status + search), shared by the list and the Excel export. */
export function supplierWhere(
  query: Pick<ListSuppliersQueryDto, 'status' | 'search'>,
): Prisma.SupplierWhereInput {
  return {
    ...(query.status !== 'all' && { isActive: query.status === 'active' }),
    ...(query.search && {
      OR: ['code', 'name', 'rne', 'taxId', 'email', 'phone'].map((field) => ({
        [field]: { contains: query.search!, mode: 'insensitive' as const },
      })),
    }),
  };
}

async function requireActiveTaxRate(tx: Prisma.TransactionClient, id: string) {
  const rate = await tx.taxRate.findUnique({
    where: { id },
    select: { name: true, isActive: true },
  });
  if (!rate) throw new BadRequestException('Unknown tax rate');
  if (!rate.isActive) throw new BadRequestException(`Tax rate ${rate.name} is inactive`);
}

function toListItem(s: SupplierRow, openOrders: number): SupplierListItem {
  return {
    id: s.id,
    code: s.code,
    name: s.name,
    rne: s.rne,
    taxId: s.taxId,
    email: s.email,
    phone: s.phone,
    taxRate: s.taxRate ? { ...s.taxRate, rate: s.taxRate.rate.toFixed(2) } : null,
    paymentTermDays: s.paymentTermDays,
    isActive: s.isActive,
    openOrders,
  };
}
