import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AuditQueryDto } from './dto/audit-query.dto';
import { buildAuditWhere } from './audit-query';

const dto = (plain: object) => plainToInstance(AuditQueryDto, plain);

describe('buildAuditWhere', () => {
  it('applies from/to inclusively by day', () => {
    const w = buildAuditWhere(dto({ from: '2026-03-01', to: '2026-03-31' }));
    expect(w.createdAt).toEqual({
      gte: new Date('2026-03-01T00:00:00.000Z'),
      lt: new Date('2026-04-01T00:00:00.000Z'),
    });
  });

  it('filters by multiple actions (comma list or repeated)', () => {
    expect(buildAuditWhere(dto({ action: 'user.created,user.deactivated' })).action).toEqual({
      in: ['user.created', 'user.deactivated'],
    });
    expect(buildAuditWhere(dto({ action: ['role.deleted', 'role.created'] })).action).toEqual({
      in: ['role.deleted', 'role.created'],
    });
  });

  it('maps actor, target and result; search looks at the label and the action', () => {
    const w = buildAuditWhere(
      dto({
        actorId: '11111111-1111-4111-8111-111111111111',
        targetType: 'User',
        targetId: 'abc',
        result: 'DENIED',
        search: 'jane',
      }),
    );
    expect(w.userId).toBe('11111111-1111-4111-8111-111111111111');
    expect(w.entity).toBe('User');
    expect(w.entityId).toBe('abc');
    expect(w.result).toBe('DENIED');
    expect(JSON.stringify(w.OR)).toContain('targetLabel');
  });

  it('rejects an unknown result and odd page sizes', async () => {
    expect(await validate(dto({ result: 'MAYBE' }))).not.toHaveLength(0);
    expect(await validate(dto({ pageSize: 7 }))).not.toHaveLength(0);
  });
});
