import { checkPassword } from './password-policy';

const P = { minLength: 12, maxLength: 128, blockCommon: true };
const ctx = { email: 'jane.doe@acme.tn', username: 'jdoe', firstName: 'Jane', lastName: 'Doe' };

describe('checkPassword', () => {
  it('accepts a long unrelated passphrase', () =>
    expect(checkPassword('river-copper-lantern-91', ctx, P)).toEqual([]));
  it('rejects short', () =>
    expect(checkPassword('Short1!', ctx, P)).toContain('Use at least 12 characters.'));
  it('rejects over max', () =>
    expect(checkPassword('a'.repeat(129), ctx, P)).toContain('Use at most 128 characters.'));
  it('rejects common passwords case-insensitively', () =>
    expect(checkPassword('PASSWORD1234', ctx, P).join()).toMatch(/too common/));
  it('skips the common check when disabled', () =>
    expect(checkPassword('PASSWORD1234', ctx, { ...P, blockCommon: false })).toEqual([]));
  it('rejects personal info', () => {
    expect(checkPassword('my-jane.doe-secret', ctx, P).join()).toMatch(/email|name/);
    expect(checkPassword('xx-JDOE-river-copper', ctx, P).join()).toMatch(/username/);
  });
  it('ignores personal parts shorter than 3 chars', () =>
    expect(checkPassword('lo-river-copper-lantern', { email: 'lo@x.tn' }, P)).toEqual([]));
});
