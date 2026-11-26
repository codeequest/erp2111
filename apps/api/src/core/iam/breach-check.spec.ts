import { createHash } from 'crypto';
import { isBreached } from './breach-check';

const sha = (p: string) => createHash('sha1').update(p).digest('hex').toUpperCase();

describe('isBreached', () => {
  it('sends only the 5-char prefix with padding and matches the suffix', async () => {
    const h = sha('password123');
    const fetchMock = jest.fn(async () => ({
      ok: true,
      text: async () => `0000000000000000000000000000000000A:0\r\n${h.slice(5)}:42\r\n`,
    }));
    expect(await isBreached('password123', fetchMock as never)).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { headers: object }];
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${h.slice(0, 5)}`);
    expect(init.headers).toEqual({ 'Add-Padding': 'true' });
  });

  it('padding rows (count 0) and other suffixes are not a match', async () => {
    const h = sha('unique-enough-pass');
    const fetchMock = jest.fn(async () => ({ ok: true, text: async () => `${h.slice(5)}:0\nABC:3` }));
    expect(await isBreached('unique-enough-pass', fetchMock as never)).toBe(false);
  });

  it('fails open on timeout / network error', async () => {
    const fetchMock = jest.fn(async () => {
      throw Object.assign(new Error('The operation was aborted due to timeout'), {
        name: 'TimeoutError',
      });
    });
    expect(await isBreached('whatever', fetchMock as never)).toBe(false);
  });
});
