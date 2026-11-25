import { generateRecoveryCodes, generateTotpSecret, otpauthUri, totpAt, verifyTotp } from './totp';

const S = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('totp', () => {
  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1234567890, '005924'],
    [2000000000, '279037'],
  ])('matches RFC vector at %i', (t, code) => expect(totpAt(S, Math.floor(t / 30))).toBe(code));
  it('accepts one step of drift and returns the step', () =>
    expect(verifyTotp(S, totpAt(S, 1000), 1001 * 30_000, null)).toBe(1000));
  it('rejects two steps of drift', () =>
    expect(verifyTotp(S, totpAt(S, 1000), 1002 * 30_000 + 1, null)).toBeNull());
  it('rejects replay of a used step', () =>
    expect(verifyTotp(S, totpAt(S, 1000), 1000 * 30_000, 1000)).toBeNull());
  it('rejects malformed codes', () => expect(verifyTotp(S, 'abcdef', 1000 * 30_000, null)).toBeNull());
  it('generates a 32-char base32 secret', () => expect(generateTotpSecret()).toMatch(/^[A-Z2-7]{32}$/));
  it('builds an otpauth uri', () => {
    const uri = otpauthUri('ABC', 'jane@acme.tn', 'ERP');
    expect(uri).toBe('otpauth://totp/ERP:jane%40acme.tn?secret=ABC&issuer=ERP&algorithm=SHA1&digits=6&period=30');
  });
  it('makes 10 unique recovery codes in xxxxx-xxxxx', () => {
    const codes = generateRecoveryCodes();
    expect(new Set(codes).size).toBe(10);
    codes.forEach((c) => expect(c).toMatch(/^[a-z2-7]{5}-[a-z2-7]{5}$/));
  });
});
