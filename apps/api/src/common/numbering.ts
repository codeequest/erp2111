import { DocumentType, Prisma } from '@prisma/client';

/** Used when no sequence row exists yet for a document type (normally created by the seed). */
const DEFAULT_PREFIX: Partial<Record<DocumentType, string>> = {
  STOCK_ADJUSTMENT: 'ADJ',
  STOCK_TRANSFER: 'TRF',
  STOCK_COUNT: 'CNT',
};

/** Formats a document number, e.g. ("ADJ", 2026, 12, 5) -> "ADJ-2026-00012". */
export function formatDocumentNumber(prefix: string, year: number, n: number, padding: number) {
  return `${prefix}-${year}-${String(n).padStart(padding, '0')}`;
}

/**
 * Takes the next gap-free number for a document type, inside the caller's transaction.
 * The sequence row is locked (FOR UPDATE) until the transaction ends, so two
 * documents can never get the same number, and a rolled-back document gives
 * its number back. A new year starts again at 1.
 */
export async function nextDocumentNumber(
  tx: Prisma.TransactionClient,
  docType: DocumentType,
  date = new Date(),
): Promise<string> {
  const year = date.getFullYear();
  const latest = await tx.documentSequence.findFirst({
    where: { docType },
    orderBy: { year: 'desc' },
    select: { prefix: true, padding: true },
  });
  const prefix = latest?.prefix ?? DEFAULT_PREFIX[docType] ?? docType;
  const padding = latest?.padding ?? 5;

  await tx.$executeRaw`
    INSERT INTO document_sequences (id, doc_type, year, prefix, next_number, padding)
    VALUES (gen_random_uuid(), ${docType}::"DocumentType", ${year}, ${prefix}, 1, ${padding})
    ON CONFLICT (doc_type, year) DO NOTHING`;

  const [row] = await tx.$queryRaw<{ id: string; prefix: string; next_number: number; padding: number }[]>`
    SELECT id, prefix, next_number, padding FROM document_sequences
    WHERE doc_type = ${docType}::"DocumentType" AND year = ${year}
    FOR UPDATE`;
  await tx.$executeRaw`
    UPDATE document_sequences SET next_number = next_number + 1 WHERE id = ${row.id}::uuid`;
  return formatDocumentNumber(row.prefix, year, row.next_number, row.padding);
}
