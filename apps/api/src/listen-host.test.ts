import { describe, expect, it } from 'vitest';

import { resolveListenHost } from './main.js';

describe('resolveListenHost', () => {
  it('defaults to loopback', () => {
    expect(resolveListenHost({})).toBe('127.0.0.1');
  });

  it('allows loopback aliases while unauthenticated routes are enabled', () => {
    for (const host of ['127.0.0.1', '::1', 'localhost']) {
      expect(
        resolveListenHost({ ALLOW_UNAUTHENTICATED_ROUTES: 'true', HOST: host })
      ).toBe(host);
    }
  });

  it('refuses to publish unauthenticated routes to a network', () => {
    for (const host of ['0.0.0.0', '::', '192.168.1.10']) {
      expect(() =>
        resolveListenHost({ ALLOW_UNAUTHENTICATED_ROUTES: 'true', HOST: host })
      ).toThrow(/non-loopback/);
    }
  });

  it('leaves the host alone when no unauthenticated route is enabled', () => {
    expect(resolveListenHost({ HOST: '0.0.0.0' })).toBe('0.0.0.0');
  });
});
