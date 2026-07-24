import { describe, expect, it } from 'vitest';

import {
  RateLimitedError,
  ServiceUnavailableError
} from '../errors/api-error.js';
import { StaticMaintenanceGate } from './maintenance-gate.js';
import { FixedWindowRateLimiter } from './rate-limiter.js';

describe('StaticMaintenanceGate', () => {
  it('passes when available and fails 503 under maintenance', () => {
    expect(() =>
      new StaticMaintenanceGate(false).assertAvailable()
    ).not.toThrow();
    expect(() =>
      new StaticMaintenanceGate(true).assertAvailable()
    ).toThrowError(ServiceUnavailableError);
  });
});

describe('FixedWindowRateLimiter', () => {
  it('allows up to the limit, then rejects within the window', () => {
    let now = 1_000;
    const limiter = new FixedWindowRateLimiter(2, 1_000, { now: () => now });

    expect(() => limiter.assertWithinLimit('actor_a')).not.toThrow();
    expect(() => limiter.assertWithinLimit('actor_a')).not.toThrow();
    expect(() => limiter.assertWithinLimit('actor_a')).toThrowError(
      RateLimitedError
    );

    // The window resets after windowMs.
    now += 1_000;
    expect(() => limiter.assertWithinLimit('actor_a')).not.toThrow();
  });

  it('tracks each key independently', () => {
    const limiter = new FixedWindowRateLimiter(1, 1_000, { now: () => 500 });
    expect(() => limiter.assertWithinLimit('actor_a')).not.toThrow();
    expect(() => limiter.assertWithinLimit('actor_b')).not.toThrow();
    expect(() => limiter.assertWithinLimit('actor_a')).toThrowError(
      RateLimitedError
    );
  });
});
