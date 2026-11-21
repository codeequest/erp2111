import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { DocumentType, Prisma } from '@prisma/client';
import { Db } from '../../common/db';

/** `INV`, 2026, 7, 5 → `INV-2026-00007` */
export function formatDocumentNumber(
  prefix: string,
  year: number,
  number: number,
  padding: number,
): string {
  return `${prefix}-${year}-${String(number).padStart(padding, '0')}`;
}

/**
 * Gap-free sequential document numbers (PO-2026-00001, INV-2026-00001, …).
 *
 * ALWAYS call `next(tx, …)` with the transaction client of the operation that
 * creates the document:
 *  - the UPDATE locks the sequence row, so concurrent callers wait in line;
 *  - if the transaction rolls back, the increment rolls back too → no gaps.
 *
 * The year is the calendar year of `date` in the server's time zone (set `TZ`
 * on the server to the company's time zone).
 */
@Injectable()
export class DocumentNumberService {
  async next(tx: Db, docType: DocumentType, date: Date = new Date()): Promise<string> {
    const year = date.getFullYear();
    let seq = await this.increment(tx, docType, year);
    if (!seq) {
      await this.openYear(tx, docType, year);
      seq = await this.increment(tx, docType, year);
    }
    if (!seq) {
      throw new InternalServerErrorException(`No document sequence for ${docType} ${year}`);
    }
    // nextNumber was incremented, so the number we just took is nextNumber - 1.
    return formatDocumentNumber(seq.prefix, year, seq.nextNumber - 1, seq.padding);
  }

  private async increment(tx: Db, docType: DocumentType, year: number) {
    try {
      return await tx.documentSequence.update({
        where: { docType_year: { docType, year } },
        data: { nextNumber: { increment: 1 } },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') return null;
      throw e;
    }
  }

  /** First document of a new year: copy prefix and padding from the latest year. */
  private async openYear(tx: Db, docType: DocumentType, year: number) {
    const template = await tx.documentSequence.findFirst({
      where: { docType },
      orderBy: { year: 'desc' },
    });
    if (!template) {
      throw new InternalServerErrorException(
        `No document sequence configured for ${docType}. Run the seed.`,
      );
    }
    // skipDuplicates = ON CONFLICT DO NOTHING: safe if another request opened the year first,
    // and it does not abort the surrounding transaction.
    await tx.documentSequence.createMany({
      data: [{ docType, year, prefix: template.prefix, padding: template.padding }],
      skipDuplicates: true,
    });
  }
}
