import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UserListQueryDto } from './dto/user-query.dto';
import { buildUserOrderBy, buildUserWhere } from './user-query';

const now = new Date('2026-06-01T12:00:00Z');
const dto = (plain: object) => plainToInstance(UserListQueryDto, plain);

describe('buildUserWhere', () => {
  it('requires every search term to match', () => {
    const w = buildUserWhere(dto({ search: 'jane  sales ' }), now);
    expect(w.AND).toHaveLength(2);
    expect(JSON.stringify(w)).toContain('"contains":"jane"');
    expect(JSON.stringify(w)).toContain('"contains":"sales"');
    // Each term may match a role name too.
    expect(JSON.stringify(w)).toContain('"roles"');
  });

  it('maps LOCKED status to an active lockout', () => {
    const json = JSON.stringify(buildUserWhere(dto({ status: ['LOCKED'] }), now));
    expect(json).toContain('lockedUntil');
    expect(json).toContain(now.toISOString());
  });

  it('accepts a comma-separated status list', () => {
    const q = dto({ status: 'ACTIVE,PENDING' });
    expect(q.status).toEqual(['ACTIVE', 'PENDING']);
  });

  it('filters MFA, verification, never-logged-in and dates', () => {
    const w = buildUserWhere(
      dto({
        mfa: 'off',
        verified: 'yes',
        neverLoggedIn: 'true',
        createdFrom: '2026-01-01',
        createdTo: '2026-01-31',
      }),
      now,
    );
    const json = JSON.stringify(w);
    expect(json).toContain('"mfa"');
    expect(json).toContain('"emailVerifiedAt":{"not":null}');
    expect(json).toContain('"lastLoginAt":null');
    // createdTo is inclusive of the whole day.
    expect(json).toContain('2026-02-01T00:00:00.000Z');
  });
});

describe('UserListQueryDto', () => {
  it('rejects page sizes outside 10/25/50/100', async () => {
    expect(await validate(dto({ pageSize: 30 }))).not.toHaveLength(0);
    expect(await validate(dto({ pageSize: '50' }))).toHaveLength(0);
  });

  it('rejects unknown statuses and sort fields', async () => {
    expect(await validate(dto({ status: ['DELETED'] }))).not.toHaveLength(0);
    expect(await validate(dto({ sort: 'passwordHash' }))).not.toHaveLength(0);
  });
});

describe('buildUserOrderBy', () => {
  it('sorts by last then first name, and lastLoginAt with nulls last', () => {
    expect(buildUserOrderBy(dto({ sort: 'name', order: 'desc' }))).toEqual([
      { lastName: 'desc' },
      { firstName: 'desc' },
      { id: 'asc' },
    ]);
    expect(buildUserOrderBy(dto({ sort: 'lastLoginAt' }))[0]).toEqual({
      lastLoginAt: { sort: 'asc', nulls: 'last' },
    });
  });
});
