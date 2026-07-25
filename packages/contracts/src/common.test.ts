import { describe, expect, it } from 'vitest';

import { UtcIsoTimestampSchema } from './index.js';

// 每一個時間戳欄位都經過這個 schema，所以「它到底放行什麼」是整個契約層最值得
// 釘死的一條規則。以前它是 `endsWith('Z') && !Number.isNaN(Date.parse(value))`，
// 而 `Date.parse` 對非 ISO 字串採用 legacy 的寬鬆解析，結果 `"Jul 25 2026 Z"`
// 被當成合法的 UTC ISO-8601 時間戳收下。
const accepted = [
  '2026-07-25T10:00:00Z',
  '2026-07-25T10:00:00.000Z',
  // 秒以下的位數不限，RFC 3339 允許，Firestore 與 toISOString 都可能給出。
  '2026-07-25T10:00:00.123456Z',
  // 閏日必須通過：拒絕它會在四年一次的那天壞掉。
  '2028-02-29T00:00:00Z'
];

const rejected: ReadonlyArray<[string, string]> = [
  ['legacy Date.parse 格式', 'Jul 25 2026 Z'],
  ['本地時間，沒有時區', '2026-07-25T10:00:00'],
  ['帶偏移而非 UTC', '2026-07-25T10:00:00+08:00'],
  ['缺秒', '2026-07-25T10:00Z'],
  ['月份越界', '2026-13-01T00:00:00Z'],
  ['小時越界', '2026-07-25T25:00:00Z'],
  // 這一個格式與 Date.parse 都會過，卻會靜默滾成 3 月 3 日。
  ['日期溢位', '2026-02-31T00:00:00Z'],
  ['非閏年的 2 月 29 日', '2026-02-29T00:00:00Z'],
  ['只有日期', '2026-07-25'],
  ['空字串', '']
];

describe('UtcIsoTimestampSchema', () => {
  it.each(accepted)('accepts %s', (value) => {
    expect(UtcIsoTimestampSchema.safeParse(value).success).toBe(true);
  });

  it.each(rejected)('rejects %s', (_label, value) => {
    expect(UtcIsoTimestampSchema.safeParse(value).success).toBe(false);
  });

  // 放行的字串必須在任何 runtime 解出同一個時間點。ISO-8601 的格式是規範定義的，
  // legacy 格式不是——這條斷言就是「只收規範定義的形式」的可執行版本。
  it('round-trips every accepted value through Date unchanged', () => {
    for (const value of accepted) {
      const parsed = new Date(value);
      expect(parsed.toISOString().slice(0, 10)).toBe(value.slice(0, 10));
    }
  });
});
