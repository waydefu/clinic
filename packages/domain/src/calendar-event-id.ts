import { DomainError } from './errors.js';

/**
 * Google Calendar event ID 的產生與解碼（RFC 4648 base32hex）。
 *
 * ## 為什麼需要這個模組
 *
 * Google 官方防重複的做法是**由我們指定 event ID**：後端已建立成功但回應在
 * 網路上遺失時，重試會帶同一個 ID，因此不會產生第二個事件。但 event ID 的
 * 格式有硬性限制（見 ADR-0002）：
 *
 * | 項目     | 規定                                  |
 * | -------- | ------------------------------------- |
 * | 允許字元 | base32hex：小寫 `a`–`v` 與 `0`–`9`    |
 * | 長度     | 5–1024 字元                            |
 * | 唯一性   | 每個日曆內唯一                        |
 *
 * 原本的鍵是 `calendar_confirmed_appointment_001`——含底線，直接送出會被
 * API 拒絕。這裡把「有意義的邏輯鍵」編碼成合法 ID，並提供解碼函式，讓人在
 * Calendar 上看到亂碼般的 ID 時能還原回去。
 *
 * ## 這裡的鍵長什麼樣子
 *
 * ```text
 * 邏輯鍵    calendar_confirmed_appointment_001
 *   ↓ toCalendarEventId（UTF-8 → base32hex，小寫、無填充）
 * event ID  cdgmopbechgn4nr3dtn6cqbidlim8nr1e1o6uqbeehmmarjkbso30c8
 *   ↓ fromCalendarEventId
 * 邏輯鍵    calendar_confirmed_appointment_001
 * ```
 *
 * 可讀性不靠 ID 本身承擔：`outbox_jobs` 仍保有 `appointmentId` 與
 * `appointmentStatus` 兩個明文欄位，人工追查優先看那裡。
 *
 * ## 誰在用
 *
 * - `booking-transaction.ts`：預約成立的投影意圖
 * - `appointment-transition.ts`：取消／到診／未到／改期的投影意圖
 * - `apps/worker`：拿 `outboxJob.idempotencyKey` 當 event ID 呼叫 Calendar
 *
 * 邏輯鍵的組成規則只存在本檔（`calendarEventIdForStatus` /
 * `calendarEventIdForReschedule`），呼叫端不得自行拼字串——兩處各拼一次，
 * 就是漂移的開始。
 *
 * ## 仍須由 worker 負責的部分
 *
 * 官方明說「無法保證在建立事件時偵測到 ID 衝突」，所以**不得只依賴 event
 * ID**：worker 必須把「該 ID 已存在」的回應視為成功（冪等），而不是失敗重試。
 */

/** RFC 4648 base32hex 字母表，直接用小寫以符合 Calendar 的字元限制。 */
const ALPHABET = '0123456789abcdefghijklmnopqrstuv';

/** Calendar 對 event ID 的長度限制。 */
export const MIN_CALENDAR_EVENT_ID_LENGTH = 5;
export const MAX_CALENDAR_EVENT_ID_LENGTH = 1024;

const EVENT_ID_PATTERN = /^[0-9a-v]+$/;

function encodeBase32Hex(bytes: Uint8Array): string {
  let output = '';
  let buffer = 0;
  let bitsInBuffer = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bitsInBuffer += 8;
    // 每滿 5 個位元就吐一個字元；因此 buffer 最多只累積到 12 位元，
    // 不會逼近 32 位元位移的邊界。
    while (bitsInBuffer >= 5) {
      bitsInBuffer -= 5;
      output += ALPHABET[(buffer >> bitsInBuffer) & 0b11111];
    }
  }
  // 尾端不足 5 位元的部分向左補零成一個字元。base32hex 的 '=' 填充字元不在
  // Calendar 的允許字元內，因此一律不填充——長度本身已足以還原。
  if (bitsInBuffer > 0)
    output += ALPHABET[(buffer << (5 - bitsInBuffer)) & 0b11111];
  return output;
}

function decodeBase32Hex(text: string): Uint8Array {
  const bytes: number[] = [];
  let buffer = 0;
  let bitsInBuffer = 0;
  for (const character of text) {
    const value = ALPHABET.indexOf(character);
    if (value < 0)
      throw new DomainError(
        'INVALID_VALUE',
        `"${character}" is not a base32hex character.`
      );
    buffer = (buffer << 5) | value;
    bitsInBuffer += 5;
    if (bitsInBuffer >= 8) {
      bitsInBuffer -= 8;
      bytes.push((buffer >> bitsInBuffer) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}

/**
 * 把邏輯鍵編成合法的 Calendar event ID。
 *
 * 同一個邏輯鍵永遠得到同一個 ID——冪等就是靠這個性質，不可改成含時間戳或
 * 隨機值的實作。
 */
export function toCalendarEventId(logicalKey: string): string {
  if (typeof logicalKey !== 'string' || logicalKey.length === 0)
    throw new DomainError(
      'INVALID_VALUE',
      'logicalKey must be a non-empty string.'
    );
  const eventId = encodeBase32Hex(new TextEncoder().encode(logicalKey));
  // 防禦性檢查：邏輯鍵短到編不出 5 個字元時，寧可在本機炸掉，也不要等到
  // 上線後被 Calendar API 退件。
  if (
    eventId.length < MIN_CALENDAR_EVENT_ID_LENGTH ||
    eventId.length > MAX_CALENDAR_EVENT_ID_LENGTH
  )
    throw new DomainError(
      'INVALID_VALUE',
      `A Calendar event ID must be ${MIN_CALENDAR_EVENT_ID_LENGTH}-${MAX_CALENDAR_EVENT_ID_LENGTH} characters; got ${eventId.length}.`
    );
  return eventId;
}

/** 還原邏輯鍵，供人工追查與 runbook 使用。 */
export function fromCalendarEventId(eventId: string): string {
  if (!isCalendarEventId(eventId))
    throw new DomainError(
      'INVALID_VALUE',
      'eventId is not a valid Calendar event ID.'
    );
  return new TextDecoder().decode(decodeBase32Hex(eventId));
}

/**
 * 格式檢查：字元集與長度。假日曆與測試以此把關，避免格式回歸。
 *
 * 刻意回傳 `boolean` 而非型別守衛（`value is string`）：守衛會讓
 * `if (!isCalendarEventId(key))` 分支把已知為 string 的變數窄化成 `never`，
 * 連錯誤訊息都無法內插。這裡的用途是驗格式，不是縮型別。
 */
export function isCalendarEventId(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    value.length >= MIN_CALENDAR_EVENT_ID_LENGTH &&
    value.length <= MAX_CALENDAR_EVENT_ID_LENGTH &&
    EVENT_ID_PATTERN.test(value)
  );
}

/**
 * 狀態投影的 event ID：每個「預約 × 狀態」一把固定的鑰匙。
 * 重試不會產生第二個事件，而不同狀態的投影仍各自送出一次。
 */
export function calendarEventIdForStatus(
  appointmentId: string,
  status: string
): string {
  return toCalendarEventId(`calendar_${status}_${appointmentId}`);
}

/**
 * 改期投影的 event ID：帶上目標時段，才能與原本的成立事件區分，
 * 否則 worker 會誤判為重送而不更新日曆。
 */
export function calendarEventIdForReschedule(
  appointmentId: string,
  targetSlotId: string
): string {
  return toCalendarEventId(
    `calendar_rescheduled_${appointmentId}_${targetSlotId}`
  );
}
