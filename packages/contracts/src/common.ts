import { z } from 'zod';

/**
 * UTC ISO-8601 的形狀：YYYY-MM-DDTHH:MM:SS[.fraction]Z。
 *
 * 先前這裡是 `value.endsWith('Z') && !Number.isNaN(Date.parse(value))`，而那個
 * 判斷會放行非 ISO 的字串：`Date.parse` 對它不認得的格式採用 legacy 的寬鬆解析，
 * 所以 `"Jul 25 2026 Z"` 也會通過。legacy 解析是 implementation-defined——V8
 * 解得出來的字串，Safari／Firefox 不保證解出同一個時間。一個這樣的值存進資料庫，
 * 換一個 runtime 讀出來就是另一個時間。
 *
 * 三道檢查缺一不可：格式決定它是 ISO-8601、`Date` 決定月／時／分在範圍內
 * （`2026-13-01`、`25:00` 會是 NaN），日期比對決定它沒有溢位（`2026-02-31`
 * 兩者都過，卻會靜默滾成 3 月 3 日）。日期合法性重用 `isValidLocalDate`，
 * 與 `LocalDateSchema` 同一套規則，含閏年。
 */
const UTC_ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

export function isUtcIsoTimestamp(value: string): boolean {
  return (
    UTC_ISO_8601.test(value) &&
    isValidLocalDate(value.slice(0, 10)) &&
    !Number.isNaN(Date.parse(value))
  );
}

export const UtcIsoTimestampSchema = z
  .string()
  .refine(isUtcIsoTimestamp, 'Must be a valid UTC ISO-8601 timestamp.');

export function isValidLocalDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31
  ];

  return (
    month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth[month - 1]!
  );
}

export const LocalDateSchema = z
  .string()
  .refine(isValidLocalDate, 'Must be a real YYYY-MM-DD calendar date.');

export const OpaqueIdentifierSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);

export const IdempotencyKeySchema = z
  .string()
  .min(16)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);

export const PolicyVersionSchema = z.string().regex(/^privacy-v[1-9][0-9]*$/);
