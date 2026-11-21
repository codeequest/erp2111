import { Injectable } from '@nestjs/common';
import { CompanySettings } from '@prisma/client';
import { PublicSettings, TaxRateDto } from '@erp/shared';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Settings needed by the Products module (read-only).
 * Editing company settings, tax rates and numbering is part of the
 * Administration module (branch feat/admin).
 */
@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async company(): Promise<CompanySettings> {
    // The seed creates row 1; create it here too so a fresh DB never breaks.
    return this.prisma.companySettings.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1, name: 'My Company' },
    });
  }

  async getPublic(): Promise<PublicSettings> {
    const s = await this.company();
    return {
      name: s.name,
      logoUrl: s.logoUrl,
      currency: s.currency,
      defaultTaxRateId: s.defaultTaxRateId,
    };
  }

  async listTaxRates(): Promise<TaxRateDto[]> {
    const rows = await this.prisma.taxRate.findMany({
      orderBy: [{ isActive: 'desc' }, { rate: 'asc' }],
    });
    return rows.map((t) => ({
      id: t.id,
      name: t.name,
      rate: t.rate.toFixed(2),
      isActive: t.isActive,
    }));
  }

  /** Default tax rate for new products. */
  async defaultTaxRateId(): Promise<string | null> {
    return (await this.company()).defaultTaxRateId;
  }
}
