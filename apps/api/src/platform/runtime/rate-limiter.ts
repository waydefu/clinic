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

  public assertWithinLimit(key: string): void {
    const now = this.clock.now();
    const current = this.windows.get(key);
    if (current === undefined || now - current.windowStart >= this.windowMs) {
      this.windows.set(key, { count: 1, windowStart: now });
      return;
    }
    if (current.count >= this.maxRequests) {
      throw new RateLimitedError();
    }
    current.count += 1;
  }
}
