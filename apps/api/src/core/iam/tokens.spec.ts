import { hashToken, newToken } from './tokens';

describe('tokens', () => {
  it('hash is deterministic and differs from the token', () => {
    const { token, hash } = newToken();
    expect(hashToken(token)).toBe(hash);
    expect(hash).not.toContain(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
  it('generates distinct tokens', () => expect(newToken().token).not.toBe(newToken().token));
});
