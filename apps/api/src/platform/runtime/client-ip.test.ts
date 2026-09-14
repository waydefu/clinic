import { describe, expect, it } from 'vitest';

import { deriveClientIp } from './client-ip.js';

describe('deriveClientIp', () => {
  it('ignores a spoofed X-Forwarded-For prefix when one proxy hop is trusted', () => {
    expect(
      deriveClientIp(
        {
          headers: { 'x-forwarded-for': '203.0.113.9, 198.51.100.10' },
          ip: '198.51.100.10'
        },
        1
      )
    ).toBe('198.51.100.10');
  });

  it('does not use X-Forwarded-For when no proxy hop is trusted', () => {
    expect(
      deriveClientIp(
        {
          headers: { 'x-forwarded-for': '203.0.113.9' },
          ip: '198.51.100.10'
        },
        0
      )
    ).toBe('198.51.100.10');
  });

  it('falls back to the socket address when the header is absent', () => {
    expect(
      deriveClientIp({
        headers: {},
        socket: { remoteAddress: '192.0.2.8' }
      })
    ).toBe('192.0.2.8');
  });
});
