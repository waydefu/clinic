import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { isInternalTestBookingEnabled } from '../public/modules/api-client.js';

const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

const loopback = {
  protocol: 'http:',
  hostname: '127.0.0.1',
  port: '3100',
  pathname: '/booking',
  search: ''
};

describe('web README mode boundaries', () => {
  it('distinguishes default browser-local state from both server-backed test modes', () => {
    expect(isInternalTestBookingEnabled(loopback)).toBe(false);
    expect(
      isInternalTestBookingEnabled({
        ...loopback,
        search: '?internalTestBooking=1'
      })
    ).toBe(true);
    expect(
      isInternalTestBookingEnabled({
        ...loopback,
        protocol: 'https:',
        hostname: 'beauessence-clinic-stg-c1a01.web.app',
        port: ''
      })
    ).toBe(true);
    expect(readme).toContain('預設瀏覽器本機模式');
    expect(readme).toContain('本機選用的內部測試模式');
    expect(readme).toContain('C1 內部測試模式');
    expect(readme).toContain('不適用「資料只留在瀏覽器」的保證');
    expect(readme).toContain('不授權公開 production、部署或真實資料');
    expect(readme).toContain('存取 Firestore');
  });

  it('does not enable the server-backed mode on an unapproved host or path', () => {
    expect(
      isInternalTestBookingEnabled({
        ...loopback,
        hostname: 'unapproved.example',
        search: '?internalTestBooking=1'
      })
    ).toBe(false);
    expect(
      isInternalTestBookingEnabled({
        ...loopback,
        pathname: '/privacy',
        search: '?internalTestBooking=1'
      })
    ).toBe(false);
    expect(readme).toContain('不收 LineID 或性別');
    expect(readme).toContain('不得輸入或依賴真實病患資料');
    expect(readme).toContain('公開 production `/v1/bookings` 未獲授權');
  });
});
