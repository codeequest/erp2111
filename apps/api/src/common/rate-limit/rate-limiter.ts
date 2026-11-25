const MAX_KEYS = 50_000;

interface Window {
  count: number;
  resetAt: number;
}

/** In-memory fixed-window limiter with lazy expiry and a bounded key set. */
export class RateLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(private readonly now: () => number = Date.now) {}

  hit(key: string, limit: number, windowMs: number): { allowed: boolean; retryAfterMs: number } {
    const t = this.now();
    let w = this.windows.get(key);
    if (w && w.resetAt <= t) {
      this.windows.delete(key);
      w = undefined;
    }
    if (!w) {
      this.makeRoom(t);
      w = { count: 0, resetAt: t + windowMs };
      this.windows.set(key, w);
    }
    if (w.count >= limit) return { allowed: false, retryAfterMs: w.resetAt - t };
    w.count += 1;
    return { allowed: true, retryAfterMs: 0 };
  }

  private makeRoom(t: number) {
    if (this.windows.size < MAX_KEYS) return;
    for (const [k, w] of this.windows) if (w.resetAt <= t) this.windows.delete(k);
    if (this.windows.size < MAX_KEYS) return;
    const oldest = this.windows.keys().next().value;
    if (oldest !== undefined) this.windows.delete(oldest);
  }
}
