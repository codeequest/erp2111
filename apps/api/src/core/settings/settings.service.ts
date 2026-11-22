import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { TaxRateRow } from '@erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestUser } from '../../common/types/request-user';
import { audit } from '../../common/audit';
import { CreateTaxRateDto, UpdateTaxRateDto } from './dto/tax-rate.dto';

/**
 * Company settings business logic.
 * TODO: company settings and document sequences. Tax rates are implemented.
 * Remember: write an AuditLog row for every create / update / status change.
 */
@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Tax rates ──────────────────────────────────────────────────────────────

  async listTaxRates(): Promise<TaxRateRow[]> {
    const rows = await this.prisma.taxRate.findMany({
      orderBy: [{ rate: 'asc' }, { name: 'asc' }],
    });
    return rows.map(toRow);
  }

  async createTaxRate(dto: CreateTaxRateDto, user: RequestUser): Promise<TaxRateRow> {
    await this.assertNameFree(dto.name);
    const created = await this.prisma.$transaction(async (tx) => {
      const t = await tx.taxRate.create({ data: { name: dto.name, rate: dto.rate } });
      await audit(tx, user, 'create', 'TaxRate', t.id, null, snapshot(t));
      return t;
    });
    return toRow(created);
  }

  /**
   * Changing a rate affects only documents created afterwards: invoice lines
   * store the rate they were issued with.
   */
  async updateTaxRate(id: string, dto: UpdateTaxRateDto, user: RequestUser): Promise<TaxRateRow> {
    const existing = await this.prisma.taxRate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Tax rate not found');
    if (dto.name && dto.name.toLowerCase() !== existing.name.toLowerCase()) {
      await this.assertNameFree(dto.name, id);
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const t = await tx.taxRate.update({
        where: { id },
        data: { name: dto.name, rate: dto.rate, isActive: dto.isActive },
      });
      const before = snapshot(existing);
      const after = snapshot(t);
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        await audit(tx, user, 'update', 'TaxRate', id, before, after);
      }
      return t;
    });
    return toRow(updated);
  }

  private async assertNameFree(name: string, exceptId?: string) {
    const clash = await this.prisma.taxRate.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
    });
    if (clash) throw new ConflictException(`A tax rate named "${clash.name}" already exists`);
  }
}

type TaxRateRecord = { id: string; name: string; rate: { toString(): string }; isActive: boolean };

function toRow(t: TaxRateRecord): TaxRateRow {
  return { id: t.id, name: t.name, rate: t.rate.toString(), isActive: t.isActive };
}

function snapshot(t: TaxRateRecord) {
  return { name: t.name, rate: t.rate.toString(), isActive: t.isActive };
}
