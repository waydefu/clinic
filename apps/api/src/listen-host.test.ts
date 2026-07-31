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
        resolveListenHost({
          ALLOW_NON_LOOPBACK_BIND: 'true',
          ALLOW_UNAUTHENTICATED_ROUTES: 'true',
          HOST: host
        })
      ).toThrow(/non-loopback/);
    }
  });

  it('requires an explicit opt-in for any non-loopback bind', () => {
    expect(() => resolveListenHost({ HOST: '0.0.0.0' })).toThrow(
      /ALLOW_NON_LOOPBACK_BIND=true/u
    );
    expect(() =>
      resolveListenHost({
        ALLOW_NON_LOOPBACK_BIND: 'TRUE',
        HOST: '0.0.0.0'
      })
    ).toThrow(/ALLOW_NON_LOOPBACK_BIND=true/u);
    expect(
      resolveListenHost({
        ALLOW_NON_LOOPBACK_BIND: 'true',
        HOST: '0.0.0.0'
      })
    ).toBe('0.0.0.0');
  });

  it('trims a configured host and refuses an empty value', () => {
    expect(resolveListenHost({ HOST: ' localhost ' })).toBe('localhost');
    expect(() => resolveListenHost({ HOST: '   ' })).toThrow(
      /must not be empty/u
    );
  });
});
