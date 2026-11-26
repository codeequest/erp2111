import { Prisma } from '@prisma/client';
import { UserFilterDto, UserListQueryDto } from './dto/user-query.dto';

const DAY_MS = 24 * 60 * 60 * 1000;
const ci = (contains: string) => ({ contains, mode: 'insensitive' as const });

/** Start of the given day (UTC). */
const from = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00.000Z`);
/** Exclusive upper bound: start of the next day, so the "to" day is included. */
const until = (d: string) => new Date(from(d).getTime() + DAY_MS);

function range(f?: string, t?: string): Prisma.DateTimeFilter | undefined {
  if (!f && !t) return undefined;
  return { ...(f ? { gte: from(f) } : {}), ...(t ? { lt: until(t) } : {}) };
}

export function buildUserWhere(q: UserFilterDto, now: Date): Prisma.UserWhereInput {
  const and: Prisma.UserWhereInput[] = [];

  for (const term of (q.search ?? '').split(/\s+/).filter(Boolean)) {
    and.push({
      OR: [
        { firstName: ci(term) },
        { lastName: ci(term) },
        { fullName: ci(term) },
        { email: ci(term) },
        { username: ci(term) },
        { department: ci(term) },
        { roles: { some: { role: { name: ci(term) } } } },
      ],
    });
  }

  if (q.status?.length) {
    const locked: Prisma.UserWhereInput = { lockedUntil: { gt: now } };
    const notLocked: Prisma.UserWhereInput = {
      OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }],
    };
    const or: Prisma.UserWhereInput[] = q.status.map((s) =>
      s === 'LOCKED' ? locked : { AND: [{ status: s }, notLocked] },
    );
    and.push({ OR: or });
  }

  if (q.roleIds?.length) {
    // Only roles currently in force.
    and.push({
      roles: {
        some: {
          roleId: { in: q.roleIds },
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      },
    });
  }

  if (q.mfa === 'on') and.push({ mfa: { is: { enabledAt: { not: null } } } });
  if (q.mfa === 'off') {
    and.push({ OR: [{ mfa: { is: null } }, { mfa: { is: { enabledAt: null } } }] });
  }
  if (q.verified === 'yes') and.push({ emailVerifiedAt: { not: null } });
  if (q.verified === 'no') and.push({ emailVerifiedAt: null });
  if (q.department) and.push({ department: { equals: q.department, mode: 'insensitive' } });

  const created = range(q.createdFrom, q.createdTo);
  if (created) and.push({ createdAt: created });
  const lastLogin = range(q.lastLoginFrom, q.lastLoginTo);
  if (lastLogin) and.push({ lastLoginAt: lastLogin });
  if (q.neverLoggedIn === true) and.push({ lastLoginAt: null });
  if (q.neverLoggedIn === false) and.push({ lastLoginAt: { not: null } });

  return and.length ? { AND: and } : {};
}

export function buildUserOrderBy(q: UserListQueryDto): Prisma.UserOrderByWithRelationInput[] {
  const dir = q.order ?? 'asc';
  const tie: Prisma.UserOrderByWithRelationInput = { id: 'asc' };
  switch (q.sort ?? 'name') {
    case 'email':
      return [{ email: dir }, tie];
    case 'status':
      return [{ status: dir }, { lastName: 'asc' }, tie];
    case 'lastLoginAt':
      return [{ lastLoginAt: { sort: dir, nulls: 'last' } }, tie];
    case 'createdAt':
      return [{ createdAt: dir }, tie];
    default:
      return [{ lastName: dir }, { firstName: dir }, tie];
  }
}
