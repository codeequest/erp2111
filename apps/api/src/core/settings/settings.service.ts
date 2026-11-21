import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestUser } from '../../common/types/request-user';
import { CreateTaxRateDto, UpdateTaxRateDto } from './dto/tax-rate.dto';

type Tx = Prisma.TransactionClient;

/**
 * Company settings business logic. Implemented so far: tax rates (VAT).
 * Every change writes an AuditLog row in the same transaction.
 */
@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /** All tax rates (active and inactive), with the default flag and how many products use each. */
  async listTaxRates() {
    const [rates, company] = await Promise.all([
      this.prisma.taxRate.findMany({
        orderBy: [{ isActive: 'desc' }, { rate: 'asc' }],
        include: { _count: { select: { products: true } } },
      }),
      this.prisma.companySettings.findUnique({
        where: { id: 1 },
        select: { defaultTaxRateId: true },
      }),
    ]);
    return rates.map(({ _count, ...r }) => ({
      ...r,
      productCount: _count.products,
      isDefault: r.id === company?.defaultTaxRateId,
    }));
  }

  async createTaxRate(dto: CreateTaxRateDto, user: RequestUser) {
    await this.prisma.$transaction(async (tx) => {
      await this.checkName(tx, dto.name, null);
      const rate = await tx.taxRate.create({
        data: { name: dto.name, rate: new Prisma.Decimal(dto.rate) },
      });
      await this.audit(tx, user, 'create', rate.id, null, rate);
      if (dto.isDefault) await this.setDefault(tx, user, rate.id);
    });
    return this.listTaxRates();
  }

  async updateTaxRate(id: string, dto: UpdateTaxRateDto, user: RequestUser) {
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.taxRate.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Tax rate not found');
      const company = await tx.companySettings.findUnique({ where: { id: 1 } });
      const isDefault = company?.defaultTaxRateId === id;

      if (dto.isActive === false && (isDefault || dto.isDefault)) {
        throw new BadRequestException(
          'The default tax rate cannot be deactivated. Choose another default first.',
        );
      }
      if (dto.isDefault && (dto.isActive ?? before.isActive) === false) {
        throw new BadRequestException('An inactive tax rate cannot be the default');
      }
      if (dto.name !== undefined) await this.checkName(tx, dto.name, id);

      const after = await tx.taxRate.update({
        where: { id },
        data: {
          name: dto.name,
          rate: dto.rate !== undefined ? new Prisma.Decimal(dto.rate) : undefined,
          isActive: dto.isActive,
        },
      });
      await this.audit(tx, user, 'update', id, before, after);

      if (dto.isDefault === true && !isDefault) await this.setDefault(tx, user, id);
      if (dto.isDefault === false && isDefault) await this.setDefault(tx, user, null);
    });
    return this.listTaxRates();
  }

  private async setDefault(tx: Tx, user: RequestUser, taxRateId: string | null) {
    const before = await tx.companySettings.findUnique({ where: { id: 1 } });
    if (!before) throw new BadRequestException('Company settings are missing. Run pnpm db:seed.');
    await tx.companySettings.update({ where: { id: 1 }, data: { defaultTaxRateId: taxRateId } });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: 'update',
        entity: 'CompanySettings',
        entityId: '1',
        before: { defaultTaxRateId: before.defaultTaxRateId },
        after: { defaultTaxRateId: taxRateId },
      },
    });
  }

  private async checkName(tx: Tx, name: string, exceptId: string | null) {
    const clash = await tx.taxRate.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        id: exceptId ? { not: exceptId } : undefined,
      },
    });
    if (clash) throw new ConflictException(`A tax rate named "${name}" already exists`);
  }

  private audit(
    tx: Tx,
    user: RequestUser,
    action: string,
    id: string,
    before: unknown,
    after: unknown,
  ) {
    const json = (v: unknown) =>
      v === null ? Prisma.JsonNull : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue);
    return tx.auditLog.create({
      data: {
        userId: user.id,
        action,
        entity: 'TaxRate',
        entityId: id,
        before: json(before),
        after: json(after),
      },
    });
  }
}
