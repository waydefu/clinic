import { describe, expect, it } from 'vitest';

import { resolveListenHost } from './main.js';

describe('resolveListenHost', () => {
  it('defaults to loopback', () => {
    expect(resolveListenHost({})).toBe('127.0.0.1');
  });

  it('allows loopback aliases while the test-only routes are enabled', () => {
    for (const host of ['127.0.0.1', '::1', 'localhost']) {
      expect(
        resolveListenHost({ ENABLE_TEST_ONLY_BOOKING: 'true', HOST: host })
      ).toBe(host);
    }
  });

  it('refuses to publish the unauthenticated test-only routes to a network', () => {
    for (const host of ['0.0.0.0', '::', '192.168.1.10']) {
      expect(() =>
        resolveListenHost({ ENABLE_TEST_ONLY_BOOKING: 'true', HOST: host })
      ).toThrow(/non-loopback/);
    }
  });

  it('leaves the host alone when the test-only routes are off', () => {
    expect(resolveListenHost({ HOST: '0.0.0.0' })).toBe('0.0.0.0');
  });
});
