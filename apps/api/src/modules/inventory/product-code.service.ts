import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { DocumentSequence, Prisma } from '@prisma/client';
import type { ProductCodeSequence } from '@erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { nextFreeProductCode } from './product.rules';

/** Product codes use the DocumentSequence row (docType PRODUCT, year 0 = never resets). */
const WHERE = { docType_year: { docType: 'PRODUCT' as const, year: 0 } };

/**
 * Automatic product codes (ART-00001, ART-00002, …).
 * Users may also type their own code; automatic numbering then skips any code already taken.
 * The prefix / digits / next number are edited in Settings › Numbering (SettingsService).
 */
@Injectable()
export class ProductCodeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Reserves the next free code. MUST run inside the product-creation transaction:
   * the sequence row is locked (SELECT … FOR UPDATE) until that transaction ends, so
   * concurrent creations queue up instead of getting the same code.
   */
  async takeNext(tx: Prisma.TransactionClient): Promise<string> {
    const [seq] = await tx.$queryRaw<DocumentSequence[]>`
      SELECT id, prefix, padding, next_number AS "nextNumber"
      FROM document_sequences
      WHERE doc_type = 'PRODUCT'::"DocumentType" AND year = 0
      FOR UPDATE`;
    if (!seq) {
      throw new InternalServerErrorException(
        'Automatic product codes are not configured. Run `pnpm db:seed` once.',
      );
    }
    const { code, number } = await nextFreeProductCode(
      seq.prefix,
      seq.padding,
      seq.nextNumber,
      async (c) => (await tx.product.count({ where: { sku: c } })) > 0,
    );
    await tx.documentSequence.update({ where: { id: seq.id }, data: { nextNumber: number + 1 } });
    return code;
  }

  /** Current settings plus a preview of the next code (nothing is reserved). */
  async get(): Promise<ProductCodeSequence> {
    const seq = await this.prisma.documentSequence.findUnique({ where: WHERE });
    if (!seq) {
      throw new InternalServerErrorException(
        'Automatic product codes are not configured. Run `pnpm db:seed` once.',
      );
    }
    return this.toDto(seq);
  }

  private async toDto(seq: DocumentSequence): Promise<ProductCodeSequence> {
    const { code } = await nextFreeProductCode(
      seq.prefix,
      seq.padding,
      seq.nextNumber,
      async (c) => (await this.prisma.product.count({ where: { sku: c } })) > 0,
    );
    return { prefix: seq.prefix, padding: seq.padding, nextNumber: seq.nextNumber, nextCode: code };
  }
}
