import { RateLimiter } from './rate-limiter';

describe('RateLimiter', () => {
  it('allows up to the limit then blocks with retry time', () => {
    let t = 0;
    const rl = new RateLimiter(() => t);
    for (let i = 0; i < 3; i++) expect(rl.hit('k', 3, 1000).allowed).toBe(true);
    expect(rl.hit('k', 3, 1000)).toEqual({ allowed: false, retryAfterMs: 1000 });
    t = 1000;
    expect(rl.hit('k', 3, 1000).allowed).toBe(true);
  });

  it('keeps keys independent', () => {
    const rl = new RateLimiter(() => 0);
    rl.hit('a', 1, 1000);
    expect(rl.hit('b', 1, 1000).allowed).toBe(true);
  });

  it('reports the remaining time inside the window', () => {
    let t = 0;
    const rl = new RateLimiter(() => t);
    rl.hit('k', 1, 1000);
    t = 400;
    expect(rl.hit('k', 1, 1000)).toEqual({ allowed: false, retryAfterMs: 600 });
  });
});
