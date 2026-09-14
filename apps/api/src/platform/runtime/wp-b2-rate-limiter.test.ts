import { describe, expect, it } from 'vitest';
import {
  IDENTIFIED_WRITE_LIMIT,
  LOOKUP_FAILURE_THRESHOLD,
  LOOKUP_LOCK_MS,
  UNAUTHENTICATED_GENERAL_LIMIT
} from '@beauessence/domain';

import { RateLimitedError } from '../errors/api-error.js';
import { InMemoryDurableRateLimitStore } from './durable-rate-limit-store.js';
import { WpB2RateLimiter } from './wp-b2-rate-limiter.js';

describe('WpB2RateLimiter', () => {
  it('allows unauthenticated traffic below the IP threshold and 429s with Retry-After at the limit', async () => {
    const now = 1_000;
    const limiter = new WpB2RateLimiter(new InMemoryDurableRateLimitStore(), {
      now: () => now
    });
    for (let i = 0; i < UNAUTHENTICATED_GENERAL_LIMIT; i += 1) {
      await limiter.assertUnauthenticatedIp('198.51.100.10');
    }
    await expect(
      limiter.assertUnauthenticatedIp('198.51.100.10')
    ).rejects.toBeInstanceOf(RateLimitedError);
    try {
      await limiter.assertUnauthenticatedIp('198.51.100.10');
    } catch (error) {
      expect(error).toBeInstanceOf(RateLimitedError);
      expect((error as RateLimitedError).retryAfterSeconds).toBeGreaterThan(0);
    }
    await limiter.assertUnauthenticatedIp('198.51.100.11');
  });

  it('tracks identified writers separately from each other and from IPs', async () => {
    const limiter = new WpB2RateLimiter(new InMemoryDurableRateLimitStore(), {
      now: () => 1_000
    });
    for (let i = 0; i < IDENTIFIED_WRITE_LIMIT; i += 1) {
      await limiter.assertIdentifiedWrite('staff_001');
    }
    await expect(
      limiter.assertIdentifiedWrite('staff_001')
    ).rejects.toBeInstanceOf(RateLimitedError);
    await limiter.assertIdentifiedWrite('staff_002');
    await limiter.assertUnauthenticatedIp('198.51.100.10');
  });

  it('locks lookup failures for 15 minutes and keeps the lock across a new limiter instance', async () => {
    let now = 5_000;
    const shared = new Map();
    const store = new InMemoryDurableRateLimitStore(shared);
    const first = new WpB2RateLimiter(store, { now: () => now });
    for (let i = 0; i < LOOKUP_FAILURE_THRESHOLD; i += 1) {
      await first.assertLookupFailure('rlk_synthetic_001', '198.51.100.10');
    }
    await expect(
      first.assertLookupFailure('rlk_synthetic_001', '198.51.100.10')
    ).rejects.toBeInstanceOf(RateLimitedError);

    const restarted = new WpB2RateLimiter(
      new InMemoryDurableRateLimitStore(shared),
      { now: () => now }
    );
    await expect(
      restarted.assertLookupFailure('rlk_synthetic_001', '198.51.100.10')
    ).rejects.toBeInstanceOf(RateLimitedError);

    now += LOOKUP_LOCK_MS;
    await restarted.assertLookupFailure('rlk_synthetic_001', '198.51.100.10');
    await restarted.assertLookupFailure('rlk_synthetic_002', '198.51.100.10');
  });

  it('serializes concurrent consumes so the durable counter is not under-counted', async () => {
    const store = new InMemoryDurableRateLimitStore();
    const limiter = new WpB2RateLimiter(store, { now: () => 1_000 });
    const attempts = UNAUTHENTICATED_GENERAL_LIMIT + 8;
    const results = await Promise.allSettled(
      Array.from({ length: attempts }, () =>
        limiter.assertUnauthenticatedIp('198.51.100.20')
      )
    );
    expect(
      results.filter((result) => result.status === 'fulfilled')
    ).toHaveLength(UNAUTHENTICATED_GENERAL_LIMIT);
    expect(
      results.filter((result) => result.status === 'rejected')
    ).toHaveLength(8);
  });
});
