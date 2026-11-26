import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { seal } from '../iam/secret-box';
import { generateTotpSecret, totpAt } from '../iam/totp';
import { MfaService } from './mfa.service';

const KEY = randomBytes(32).toString('base64');

async function setup() {
  const secret = generateTotpSecret();
  const mfa: Record<string, unknown> = {
    userId: 'u1',
    secretEnc: seal(secret, KEY),
    enabledAt: new Date(),
    lastUsedStep: null,
  };
  const codes = [{ id: 'c1', userId: 'u1', codeHash: await argon2.hash('abcde-fghij'), usedAt: null }];
  const db = {
    userMfa: {
      findUnique: jest.fn(async () => ({ ...mfa })),
      updateMany: jest.fn(async ({ where, data }: { where: { OR?: unknown }; data: object }) => {
        const last = mfa.lastUsedStep as number | null;
        const step = (data as { lastUsedStep: number }).lastUsedStep;
        if (where.OR && last !== null && !(last < step)) return { count: 0 };
        Object.assign(mfa, data);
        return { count: 1 };
      }),
    },
    mfaRecoveryCode: {
      findMany: jest.fn(async () => codes.filter((c) => !c.usedAt)),
      updateMany: jest.fn(async ({ where, data }: { where: { id: string }; data: object }) => {
        const c = codes.find((x) => x.id === where.id && !x.usedAt);
        if (!c) return { count: 0 };
        Object.assign(c, data);
        return { count: 1 };
      }),
    },
  };
  const config = { get: () => KEY, getOrThrow: () => KEY };
  return { svc: new MfaService(db as never, config as never), secret, mfa };
}

describe('MfaService.verify', () => {
  it('a recovery code works once and cannot be reused', async () => {
    const { svc } = await setup();
    expect(await svc.verify('u1', { recoveryCode: ' ABCDE-FGHIJ ' })).toBe(true);
    expect(await svc.verify('u1', { recoveryCode: 'abcde-fghij' })).toBe(false);
  });

  it('accepts the current TOTP once, then rejects the replay', async () => {
    const { svc, secret } = await setup();
    const code = totpAt(secret, Math.floor(Date.now() / 30_000));
    expect(await svc.verify('u1', { code })).toBe(true);
    expect(await svc.verify('u1', { code })).toBe(false);
  });

  it('rejects a wrong code', async () => {
    const { svc } = await setup();
    expect(await svc.verify('u1', { code: '000000' })).toBe(false);
  });

  it('fails closed when MFA is not enabled', async () => {
    const { svc, mfa } = await setup();
    mfa.enabledAt = null;
    expect(await svc.verify('u1', { recoveryCode: 'abcde-fghij' })).toBe(false);
  });
});
