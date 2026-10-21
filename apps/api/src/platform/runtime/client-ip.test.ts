import { describe, expect, it } from 'vitest';

import { deriveClientIp } from './client-ip.js';

describe('deriveClientIp', () => {
  it('uses the client address behind the two-hop Hosting and Cloud Run chain', () => {
    expect(
      deriveClientIp(
        {
          headers: {
            'x-forwarded-for': '192.0.2.200, 203.0.113.9, 198.51.100.10'
          },
          ip: '198.51.100.10'
        },
        2
      )
    ).toBe('203.0.113.9');
  });

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

  it('canonicalizes equivalent IPv6 without grouping different hosts', () => {
    const direct = (ip: string) => deriveClientIp({ headers: {}, ip }, 0);
    expect(direct('2001:0db8:0001:0002:0000:0000:0000:0001')).toBe(
      direct('2001:db8:1:2::1')
    );
    expect(direct('2001:db8:1:2::1')).not.toBe(direct('2001:db8:1:2::2'));
    expect(direct('::ffff:192.0.2.8')).toBe(direct('192.0.2.8'));
    for (const invalid of [
      '2001:db8::1/64',
      '2001:db8::1, 2001:db8::2',
      'fe80::1%eth0',
      'not_an_address'
    ]) {
      expect(direct(invalid)).toBe('unknown');
    }
    expect(
      deriveClientIp(
        {
          ip: '2001:db8:1:2::2',
          headers: { 'x-forwarded-for': '2001:db8:1:2::1' }
        },
        0
      )
    ).toBe('2001:db8:1:2::2');
  });
});
