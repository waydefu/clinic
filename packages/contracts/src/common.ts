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
 * 三道檢查缺一不可：格式限定 UTC 形狀與 00–23 時、00–59 分秒，避免
 * `Date.parse` 將 `24:00` 靜默跨日。`Date` 檢查可解析性，日期合法性由
 * `isValidLocalDate` 拒絕 `2026-02-31` 等溢位；與 `LocalDateSchema` 同一套
 * 規則，含閏年。
 */
const UTC_ISO_8601 =
  /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?Z$/;

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

export const LocalTimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);

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

/**
 * IP-001 internal-test identifier. This is not D-003 publication approval
 * and is not a client-supplied acceptance payload.
 */
export const INTERNAL_TEST_PRIVACY_POLICY_VERSION =
  PolicyVersionSchema.parse('privacy-v1');
