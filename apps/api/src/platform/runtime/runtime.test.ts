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

  // 每個一次性的 key 都留下一筆永久紀錄，就不是限流器而是一條慢速記憶體耗盡
  // 路徑——key 由呼叫端決定，輪替 key 的呼叫者可以無上限地把它撐大。
  it('does not retain a window past its own expiry', () => {
    let now = 0;
    const limiter = new FixedWindowRateLimiter(5, 1_000, { now: () => now });

    for (let index = 0; index < 10_000; index += 1) {
      limiter.assertWithinLimit(`one_shot_${index}`);
    }
    expect(limiter.trackedKeyCount).toBe(10_000);

    // 視窗過期後，下一個新 key 就該把它們清掉，只剩自己。
    now += 1_000;
    limiter.assertWithinLimit('actor_a');
    expect(limiter.trackedKeyCount).toBe(1);
  });

  // 清掃不得改變限流行為：還沒到期的 key 必須保留它的計數。
  it('keeps a live window while sweeping expired ones', () => {
    let now = 0;
    const limiter = new FixedWindowRateLimiter(2, 1_000, { now: () => now });

    limiter.assertWithinLimit('expires_first'); // 視窗 0–1000
    now = 900;
    limiter.assertWithinLimit('still_live'); // 視窗 900–1900
    limiter.assertWithinLimit('still_live'); // 用掉第二次額度

    now = 1_100; // expires_first 已到期，still_live 尚未
    limiter.assertWithinLimit('trigger_sweep');

    expect(limiter.trackedKeyCount).toBe(2); // still_live + trigger_sweep
    // 計數沒有因為清掃而被重置：still_live 的兩次額度已用完。
    expect(() => limiter.assertWithinLimit('still_live')).toThrowError(
      RateLimitedError
    );
  });

  // 清掃本身也必須有節制。每遇到一個新 key 就掃一次整張表，會讓「輪替 key」的
  // 呼叫者把 O(N) 的記憶體問題換成 O(N²) 的 CPU 問題——同一個攻擊者、換一種
  // 耗法。每個視窗最多掃一次，攤提成本才是 O(1)。
  it('sweeps at most once per window', () => {
    let now = 0;
    const limiter = new FixedWindowRateLimiter(1, 1_000, { now: () => now });

    const startedAt = performance.now();
    for (let index = 0; index < 50_000; index += 1) {
      now += 1; // 每個 key 都是新的，且時間持續前進
      limiter.assertWithinLimit(`rotating_${index}`);
    }
    const elapsed = performance.now() - startedAt;

    // 每次都全表掃描的話，50k 個 key 是數十億次比較——這個上限寬鬆到不會偽陽性，
    // 但二次方行為一定會撞上去。
    expect(elapsed).toBeLessThan(2_000);
    // 而且仍然有在清：留下的只有最近約兩個視窗內的 key，不是全部 50k 筆。
    expect(limiter.trackedKeyCount).toBeLessThan(3_000);
  });
});
