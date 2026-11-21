import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestUser } from '../../common/types/request-user';
import { CreateTaxRateDto } from './dto/tax-rate.dto';

/**
 * Company settings business logic.
 * TODO: implement company settings and numbering. Remember:
 *  - wrap every operation that touches stock or money in this.prisma.$transaction(...)
 *  - write an AuditLog row for every create / update / status change
 */
@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async listTaxRates() {
    const rates = await this.prisma.taxRate.findMany({
      orderBy: [{ rate: 'asc' }, { name: 'asc' }],
    });
    return rates.map((r) => ({ ...r, rate: r.rate.toString() }));
  }

  async createTaxRate(dto: CreateTaxRateDto, user: RequestUser) {
    const created = await this.prisma.$transaction(async (tx) => {
      const rate = await tx.taxRate
        .create({ data: { name: dto.name, rate: new Prisma.Decimal(String(dto.rate)) } })
        .catch((e: unknown) => {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
            throw new ConflictException(`A VAT rate named "${dto.name}" already exists`);
          }
          throw e;
        });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'create',
          entity: 'TaxRate',
          entityId: rate.id,
          after: { name: rate.name, rate: rate.rate.toString() },
        },
      });
      return rate;
    });
    return { ...created, rate: created.rate.toString() };
  }
}
