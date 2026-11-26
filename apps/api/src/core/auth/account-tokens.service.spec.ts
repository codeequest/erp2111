import { BadRequestException } from '@nestjs/common';
import { AccountTokensService } from './account-tokens.service';

type Row = Record<string, unknown>;

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (v && typeof v === 'object' && !(v instanceof Date) && 'gt' in v) {
      return (row[k] as Date) > (v as { gt: Date }).gt;
    }
    return (row[k] ?? null) === v;
  });
}

function setup(users: Row[]) {
  const tokens: Row[] = [];
  const db = {
    tokens,
    userToken: {
      create: jest.fn(async ({ data }: { data: Row }) => {
        const row = { id: `t${tokens.length + 1}`, usedAt: null, ...data };
        tokens.push(row);
        return row;
      }),
      findUnique: jest.fn(async ({ where }: { where: { tokenHash: string } }) => {
        const t = tokens.find((x) => x.tokenHash === where.tokenHash);
        return t ? { ...t, user: users.find((u) => u.id === t.userId) } : null;
      }),
      updateMany: jest.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const hit = tokens.filter((t) => matches(t, where));
        hit.forEach((t) => Object.assign(t, data));
        return { count: hit.length };
      }),
    },
    auditLog: { create: jest.fn(async () => ({})) },
    $transaction: jest.fn(),
  };
  db.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(db));
  const policy = { get: async () => ({ invitationTtlHours: 72, resetTtlMinutes: 60 }) };
  const mail = { send: jest.fn(async () => undefined) };
  const config = { get: (k: string, d?: string) => (k === 'WEB_ORIGIN' ? 'http://web' : d) };
  const svc = new AccountTokensService(db as never, policy as never, mail as never, config as never);
  return { svc, db, mail };
}

const active = { id: 'u1', email: 'a@x.com', firstName: 'A', status: 'ACTIVE' };
const pending = { id: 'u2', email: 'p@x.com', firstName: 'P', status: 'PENDING' };
const inactive = { id: 'u3', email: 'i@x.com', firstName: 'I', status: 'INACTIVE' };

describe('AccountTokensService', () => {
  it('a token can be consumed only once', async () => {
    const { svc, db } = setup([active]);
    const t = await svc.issue('u1', 'PASSWORD_RESET', null, db as never);
    const u = await svc.consume(t, 'PASSWORD_RESET', db as never);
    expect(u.id).toBe('u1');
    await expect(svc.consume(t, 'PASSWORD_RESET', db as never)).rejects.toThrow(
      new BadRequestException('This link is invalid or has expired.'),
    );
  });

  it('an expired token fails', async () => {
    const { svc, db } = setup([active]);
    const t = await svc.issue('u1', 'PASSWORD_RESET', null, db as never);
    db.tokens[0].expiresAt = new Date(Date.now() - 1000);
    await expect(svc.consume(t, 'PASSWORD_RESET', db as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('issuing a second reset token invalidates the first', async () => {
    const { svc, db } = setup([active]);
    const first = await svc.issue('u1', 'PASSWORD_RESET', null, db as never);
    const second = await svc.issue('u1', 'PASSWORD_RESET', null, db as never);
    await expect(svc.consume(first, 'PASSWORD_RESET', db as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect((await svc.consume(second, 'PASSWORD_RESET', db as never)).id).toBe('u1');
  });

  it('a token of another type is rejected', async () => {
    const { svc, db } = setup([pending]);
    const t = await svc.issue('u2', 'INVITATION', null, db as never);
    await expect(svc.consume(t, 'PASSWORD_RESET', db as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('a reset token for an INACTIVE user fails', async () => {
    const { svc, db } = setup([inactive]);
    const t = await svc.issue('u3', 'PASSWORD_RESET', null, db as never);
    await expect(svc.consume(t, 'PASSWORD_RESET', db as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('an invitation for an ACTIVE user fails', async () => {
    const { svc, db } = setup([active]);
    const t = await svc.issue('u1', 'INVITATION', null, db as never);
    await expect(svc.peek(t, 'INVITATION')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('revokeAll voids outstanding tokens', async () => {
    const { svc, db } = setup([active]);
    const t = await svc.issue('u1', 'PASSWORD_RESET', null, db as never);
    await svc.revokeAll('u1', db as never);
    await expect(svc.consume(t, 'PASSWORD_RESET', db as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('sendPasswordReset mails a fragment link and never stores the raw token', async () => {
    const { svc, db, mail } = setup([active]);
    await svc.sendPasswordReset(active as never, null, {});
    const [to, template, vars] = mail.send.mock.calls[0] as unknown as [
      string,
      string,
      { link: string; expiresIn: string },
    ];
    expect(to).toBe('a@x.com');
    expect(template).toBe('password_reset');
    expect(vars.link).toMatch(/^http:\/\/web\/reset-password#token=[\w-]+$/);
    expect(vars.expiresIn).toBe('60 minutes');
    const raw = vars.link.split('#token=')[1];
    expect(db.tokens[0].tokenHash).not.toBe(raw);
  });
});
