import { describe, expect, it } from 'vitest';

import { DomainError } from './errors.js';
import { assertUtcTimestamp, isUtcIsoTimestamp } from './timestamp.js';

// 這條規則以前在 domain 裡有六份複本，每一份都是
// `value.endsWith('Z') && !Number.isNaN(Date.parse(value))`。那個判斷依賴
// `Date.parse` 的 legacy 寬鬆解析，而 legacy 解析是 implementation-defined：
// V8 收下的字串，別的引擎不保證解出同一個時間。時間戳是跨 runtime 儲存的資料，
// 所以驗證必須只認規範定義的格式。
const accepted = [
  '2026-07-25T10:00:00Z',
  '2026-07-25T10:00:00.000Z',
  '2026-07-25T10:00:00.123456Z',
  '2028-02-29T00:00:00Z'
];

const rejected: ReadonlyArray<[string, string]> = [
  ['legacy Date.parse 格式', 'Jul 25 2026 Z'],
  ['本地時間，沒有時區', '2026-07-25T10:00:00'],
  ['帶偏移而非 UTC', '2026-07-25T10:00:00+08:00'],
  ['缺秒', '2026-07-25T10:00Z'],
  ['月份越界', '2026-13-01T00:00:00Z'],
  ['小時越界', '2026-07-25T25:00:00Z'],
  ['日期溢位', '2026-02-31T00:00:00Z'],
  ['非閏年的 2 月 29 日', '2026-02-29T00:00:00Z'],
  ['只有日期', '2026-07-25'],
  ['空字串', '']
];

describe('isUtcIsoTimestamp', () => {
  it.each(accepted)('accepts %s', (value) => {
    expect(isUtcIsoTimestamp(value)).toBe(true);
  });

  it.each(rejected)('rejects %s', (_label, value) => {
    expect(isUtcIsoTimestamp(value)).toBe(false);
  });
});

describe('assertUtcTimestamp', () => {
  it('passes a valid timestamp through', () => {
    expect(() =>
      assertUtcTimestamp('2026-07-25T10:00:00.000Z', 'startsAt')
    ).not.toThrow();
  });

  // 錯誤碼與訊息形狀是契約的一部分：API 的錯誤對應表以 INVALID_TIMESTAMP
  // 為鍵，訊息則要說清楚是哪個欄位。
  it('raises INVALID_TIMESTAMP naming the field', () => {
    expect(() => assertUtcTimestamp('Jul 25 2026 Z', 'startsAt')).toThrow(
      DomainError
    );
    try {
      assertUtcTimestamp('Jul 25 2026 Z', 'startsAt');
      expect.unreachable('assertUtcTimestamp should have thrown.');
    } catch (error) {
      expect((error as DomainError).code).toBe('INVALID_TIMESTAMP');
      expect((error as DomainError).message).toBe(
        'startsAt must be a valid UTC ISO-8601 timestamp.'
      );
    }
  });
});
