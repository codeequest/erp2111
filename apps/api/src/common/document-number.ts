import { DocumentType, Prisma } from '@prisma/client';

/**
 * Next number for a business document, e.g. "ADJ-2026-00001".
 *
 * Must be called inside the transaction that creates the document: the UPDATE
 * locks the sequence row until commit, so two users never get the same number,
 * and a rolled-back document gives its number back.
 *
 * The seed creates one sequence per document type for the current year. On the
 * first document of a new year the row is created, reusing last year's prefix
 * and padding.
 */
export async function nextDocumentNumber(
  tx: Prisma.TransactionClient,
  docType: DocumentType,
  date = new Date(),
): Promise<string> {
  const year = date.getFullYear();

  const existing = await tx.documentSequence.findUnique({
    where: { docType_year: { docType, year } },
    select: { id: true },
  });
  if (!existing) {
    const previous = await tx.documentSequence.findFirst({
      where: { docType },
      orderBy: { year: 'desc' },
      select: { prefix: true, padding: true },
    });
    // createMany + skipDuplicates = INSERT … ON CONFLICT DO NOTHING (safe if two users race).
    await tx.documentSequence.createMany({
      data: [
        {
          docType,
          year,
          prefix: previous?.prefix ?? docType,
          padding: previous?.padding ?? 5,
        },
      ],
      skipDuplicates: true,
    });
  }

  const seq = await tx.documentSequence.update({
    where: { docType_year: { docType, year } },
    data: { nextNumber: { increment: 1 } },
    select: { prefix: true, padding: true, nextNumber: true },
  });
  const number = seq.nextNumber - 1;
  return `${seq.prefix}-${year}-${String(number).padStart(seq.padding, '0')}`;
}
