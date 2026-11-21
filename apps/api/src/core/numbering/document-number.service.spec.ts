import { DocumentType, Prisma } from '@prisma/client';
import { Db } from '../../common/db';
import { DocumentNumberService, formatDocumentNumber } from './document-number.service';

const notFound = () =>
  new Prisma.PrismaClientKnownRequestError('Record not found', {
    code: 'P2025',
    clientVersion: 'test',
  });

function fakeTx(overrides: Partial<Record<'update' | 'findFirst' | 'createMany', jest.Mock>>) {
  const documentSequence = {
    update: jest.fn(),
    findFirst: jest.fn(),
    createMany: jest.fn().mockResolvedValue({ count: 1 }),
    ...overrides,
  };
  return { tx: { documentSequence } as unknown as Db, documentSequence };
}

describe('formatDocumentNumber', () => {
  it('pads the number', () => {
    expect(formatDocumentNumber('INV', 2026, 7, 5)).toBe('INV-2026-00007');
    expect(formatDocumentNumber('PO', 2026, 123456, 5)).toBe('PO-2026-123456');
  });
});

describe('DocumentNumberService.next', () => {
  const service = new DocumentNumberService();
  const date = new Date(2026, 5, 15);

  it('takes the current number and increments the sequence', async () => {
    const { tx, documentSequence } = fakeTx({
      update: jest.fn().mockResolvedValue({ prefix: 'SO', nextNumber: 4, padding: 5 }),
    });

    await expect(service.next(tx, DocumentType.SALES_ORDER, date)).resolves.toBe('SO-2026-00003');
    expect(documentSequence.update).toHaveBeenCalledWith({
      where: { docType_year: { docType: DocumentType.SALES_ORDER, year: 2026 } },
      data: { nextNumber: { increment: 1 } },
    });
  });

  it('opens a new year from the previous year and starts at 1', async () => {
    const { tx, documentSequence } = fakeTx({
      update: jest
        .fn()
        .mockRejectedValueOnce(notFound())
        .mockResolvedValueOnce({ prefix: 'INV', nextNumber: 2, padding: 5 }),
      findFirst: jest.fn().mockResolvedValue({ prefix: 'INV', padding: 5, year: 2025 }),
    });

    await expect(service.next(tx, DocumentType.CUSTOMER_INVOICE, date)).resolves.toBe(
      'INV-2026-00001',
    );
    expect(documentSequence.createMany).toHaveBeenCalledWith({
      data: [{ docType: DocumentType.CUSTOMER_INVOICE, year: 2026, prefix: 'INV', padding: 5 }],
      skipDuplicates: true,
    });
  });

  it('fails clearly when the sequence was never seeded', async () => {
    const { tx } = fakeTx({
      update: jest.fn().mockRejectedValue(notFound()),
      findFirst: jest.fn().mockResolvedValue(null),
    });
    await expect(service.next(tx, DocumentType.DELIVERY, date)).rejects.toThrow(/Run the seed/);
  });

  it('does not swallow other database errors', async () => {
    const { tx } = fakeTx({ update: jest.fn().mockRejectedValue(new Error('connection lost')) });
    await expect(service.next(tx, DocumentType.DELIVERY, date)).rejects.toThrow('connection lost');
  });
});
