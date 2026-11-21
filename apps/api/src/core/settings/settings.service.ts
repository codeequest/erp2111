import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DocumentSequence } from '@prisma/client';
import {
  SEQUENCE_LABELS,
  formatSequenceValue,
  nextNumberProblem,
  type SequenceSetting,
  type SequenceType,
} from '@erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RequestUser } from '../../common/types/request-user';
import { ProductCodeService } from '../../modules/inventory/product-code.service';
import { UpdateSequenceDto } from './dto/sequence.dto';

/** Display order on the Settings page: product codes first, then documents as in SEQUENCE_LABELS. */
const ORDER = Object.keys(SEQUENCE_LABELS) as SequenceType[];

/**
 * Company settings business logic.
 * Remember:
 *  - wrap every operation that touches stock or money in this.prisma.$transaction(...)
 *  - write an AuditLog row for every create / update / status change
 */
@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly productCodes: ProductCodeService,
  ) {}

  // ─────────────── Numbering ───────────────

  /** Product codes plus this year's document sequences (older years are history). */
  async listSequences(): Promise<SequenceSetting[]> {
    const year = new Date().getFullYear();
    const rows = await this.prisma.documentSequence.findMany({
      where: { OR: [{ year: 0 }, { year }] },
    });
    const items = await Promise.all(rows.map((r) => this.toDto(r)));
    return items.sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type));
  }

  async updateSequence(
    id: string,
    dto: UpdateSequenceDto,
    user: RequestUser,
  ): Promise<SequenceSetting> {
    const saved = await this.prisma.$transaction(async (tx) => {
      // Lock the row: a document being numbered right now must not race with this change.
      const [current] = await tx.$queryRaw<DocumentSequence[]>`
        SELECT id, doc_type AS "docType", year, prefix, padding, next_number AS "nextNumber"
        FROM document_sequences WHERE id = ${id}::uuid FOR UPDATE`;
      if (!current) throw new NotFoundException('Numbering sequence not found');

      if (dto.prefix === '' && current.docType !== 'PRODUCT') {
        throw new BadRequestException('prefix: documents need a prefix, e.g. INV or PO');
      }
      if (dto.nextNumber !== undefined) {
        const problem = nextNumberProblem(current.docType, current.nextNumber, dto.nextNumber);
        if (problem) throw new BadRequestException(`nextNumber: ${problem}`);
      }

      const updated = await tx.documentSequence.update({
        where: { id },
        data: { prefix: dto.prefix, padding: dto.padding, nextNumber: dto.nextNumber },
      });
      await this.audit.log(
        {
          userId: user.id,
          action: 'update',
          entity: 'DocumentSequence',
          entityId: id,
          before: current,
          after: updated,
        },
        tx,
      );
      return updated;
    });
    return this.toDto(saved);
  }

  private async toDto(seq: DocumentSequence): Promise<SequenceSetting> {
    const type = seq.docType as SequenceType;
    // Product codes skip codes typed by hand, so ask the product-code service for the real next one.
    const nextValue =
      type === 'PRODUCT'
        ? (await this.productCodes.get()).nextCode
        : formatSequenceValue(seq, seq.nextNumber);
    return {
      id: seq.id,
      type,
      label: SEQUENCE_LABELS[type],
      year: seq.year,
      prefix: seq.prefix,
      padding: seq.padding,
      nextNumber: seq.nextNumber,
      nextValue,
    };
  }
}
