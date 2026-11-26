import { isDevOutbox } from './mail-config';

describe('isDevOutbox', () => {
  it.each([
    [{ MAIL_TRANSPORT: 'outbox', NODE_ENV: 'development' }, true],
    [{ MAIL_TRANSPORT: 'outbox' }, true],
    [{ MAIL_TRANSPORT: 'outbox', NODE_ENV: 'production' }, false],
    [{}, false],
    [{ NODE_ENV: 'development' }, false],
    [{ MAIL_TRANSPORT: 'foo' }, false],
    [{ MAIL_TRANSPORT: 'smtp' }, false],
  ])('%j -> %s', (env, expected) => {
    expect(isDevOutbox(env)).toBe(expected);
  });
});
