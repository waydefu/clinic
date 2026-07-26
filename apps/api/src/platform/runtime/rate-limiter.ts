import { RateLimitedError } from '../errors/api-error.js';

/**
 * The anti-automation boundary a controller consults per caller/action. The
 * production limiter is a shared store gated by D-010; this fixed-window,
 * in-memory one is per-process and only fixes the interface and the 429
 * mapping. The clock is injectable so anti-automation tests are deterministic.
 */
export interface RateLimiter {
  assertWithinLimit(key: string): void;
}

export interface Clock {
  now(): number;
}

interface Window {
  count: number;
  windowStart: number;
}

export class FixedWindowRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, Window>();

  public constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number,
    private readonly clock: Clock = { now: () => Date.now() }
  ) {}

  private lastSweptAt = Number.NEGATIVE_INFINITY;

  /**
   * Drops windows that have already expired.
   *
   * Without this the map only ever grows: every key seen once and never again
   * keeps its entry for the life of the process. The key is derived from the
   * caller, so a rotating or unauthenticated caller is enough to grow it without
   * bound — a slow memory-exhaustion path rather than a rate limit.
   *
   * Swept lazily on write rather than on a timer, because a timer would make the
   * limiter depend on wall-clock scheduling and the injected clock exists
   * precisely so anti-automation tests stay deterministic.
   *
   * At most one sweep per window, not one per new key. Sweeping on every new key
   * would make a burst of N distinct keys cost O(N²) — trading unbounded memory
   * for unbounded CPU against the same attacker. Rate-limiting the sweep itself
   * makes the amortised cost O(1) per request and bounds the map to the keys
   * seen within roughly the last two windows, which is the working set the
   * limiter needs anyway.
   */
  private sweepExpired(now: number): void {
    if (now - this.lastSweptAt < this.windowMs) return;
    this.lastSweptAt = now;
    for (const [key, window] of this.windows) {
      if (now - window.windowStart >= this.windowMs) this.windows.delete(key);
    }
  }

  public assertWithinLimit(key: string): void {
    const now = this.clock.now();
    const current = this.windows.get(key);
    if (current === undefined || now - current.windowStart >= this.windowMs) {
      this.sweepExpired(now);
      this.windows.set(key, { count: 1, windowStart: now });
      return;
    }
    if (current.count >= this.maxRequests) {
      // 這個視窗還剩多久才重開。固定視窗算得出確切時間，所以 429 可以直接回答
      // 「該等多久」，而不是丟一個「太快了」讓呼叫端自己猜。
      const remainingMs = current.windowStart + this.windowMs - now;
      throw new RateLimitedError(remainingMs / 1000);
    }
    current.count += 1;
  }

  /** Live window count. Exposed so a test can prove the map does not grow. */
  public get trackedKeyCount(): number {
    return this.windows.size;
  }
}
