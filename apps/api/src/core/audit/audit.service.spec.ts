import { Prisma } from '@prisma/client';
import { Db } from '../../common/db';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService, toAuditJson } from './audit.service';

describe('toAuditJson', () => {
  it('turns Decimal, Date and BigInt into JSON-safe values', () => {
    const json = toAuditJson({
      price: new Prisma.Decimal('12.5000'),
      at: new Date('2026-11-21T10:00:00.000Z'),
      big: BigInt(42),
      nested: { ok: true },
    });
    expect(json).toEqual({
      price: '12.5',
      at: '2026-11-21T10:00:00.000Z',
      big: '42',
      nested: { ok: true },
    });
  });

  it('returns undefined for missing snapshots', () => {
    expect(toAuditJson(undefined)).toBeUndefined();
    expect(toAuditJson(null)).toBeUndefined();
  });
});

describe('AuditService.log', () => {
  it('writes through the client it is given (the transaction)', async () => {
    const create = jest.fn().mockResolvedValue({});
    const tx = { auditLog: { create } } as unknown as Db;
    const service = new AuditService({} as PrismaService);

    await service.log(tx, {
      userId: 'u1',
      action: 'update',
      entity: 'Category',
      entityId: 'c1',
      before: { name: 'Old' },
      after: { name: 'New' },
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        userId: 'u1',
        action: 'update',
        entity: 'Category',
        entityId: 'c1',
        before: { name: 'Old' },
        after: { name: 'New' },
        ip: null,
      },
    });
  });
});
