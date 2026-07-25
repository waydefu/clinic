import { DomainError } from './errors.js';

/**
 * UTC 時間戳的單一驗證點。
 *
 * 先前這條規則在 domain 裡有六份各自實作的複本，寫法都是
 * `value.endsWith('Z') && !Number.isNaN(Date.parse(value))`，而那個判斷是錯的：
 * `Date.parse` 對非 ISO 字串採用 legacy 的寬鬆解析，所以 `"Jul 25 2026 Z"`
 * 會被當成合法的「UTC ISO-8601 時間戳」放行。legacy 解析的結果是
 * implementation-defined——V8 接受的字串，Safari／Firefox 不保證解出同一個時間，
 * 甚至可能回 NaN。一個這樣的值存進 Firestore，換一個 runtime 讀出來就是另一個
 * 時間，正好違反「時間戳一律以 UTC 儲存」這條不可退讓的邊界。
 *
 * 這裡改為先比對格式、再要求 `Date` 真的解得出來，最後檢查日期沒有溢位。
 *
 * 為什麼不用 `Temporal`：`Temporal.Instant.from()` 正是為此而生，但 Node 24
 * 仍需 `--harmony-temporal` 才有 `globalThis.Temporal`（瀏覽器端已內建）。這個
 * 套件必須同時在 Node 與瀏覽器執行，所以現階段不能用。等 Node 端無旗標可用時
 * 再換。
 */
const UTC_ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

export function isUtcIsoTimestamp(value: string): boolean {
  if (!UTC_ISO_8601.test(value)) return false;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;

  // 日期溢位：`2026-02-31T00:00:00Z` 通過格式檢查，`Date.parse` 也給得出數字
  // ——它會靜默滾成 3 月 3 日。輸入既然是 UTC，正確的日期一定原樣往返。
  return parsed.toISOString().slice(0, 10) === value.slice(0, 10);
}

export function assertUtcTimestamp(value: string, fieldName: string): void {
  if (!isUtcIsoTimestamp(value)) {
    throw new DomainError(
      'INVALID_TIMESTAMP',
      `${fieldName} must be a valid UTC ISO-8601 timestamp.`
    );
  }
}
