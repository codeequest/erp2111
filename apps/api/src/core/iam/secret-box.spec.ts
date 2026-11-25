import { randomBytes } from 'crypto';
import { open, seal } from './secret-box';

const key = randomBytes(32).toString('base64');

describe('secret-box', () => {
  it('round-trips', () => expect(open(seal('JBSWY3DP', key), key)).toBe('JBSWY3DP'));
  it('uses the v1 format', () => expect(seal('x', key)).toMatch(/^v1:[^:]+:[^:]+:[^:]+$/));
  it('fails with another key', () =>
    expect(() => open(seal('x', key), randomBytes(32).toString('base64'))).toThrow());
  it('fails when tampered', () => {
    const s = seal('x', key);
    expect(() => open(s.slice(0, -2) + 'AA', key)).toThrow();
  });
  it('rejects a wrong-length key without echoing it', () => {
    const bad = randomBytes(16).toString('base64');
    expect(() => seal('x', bad)).toThrow(/32 bytes/);
    try { seal('x', bad); } catch (e) { expect((e as Error).message).not.toContain(bad); }
  });
});
