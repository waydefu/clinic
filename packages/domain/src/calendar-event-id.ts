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
 * 邏輯鍵    calendar_appointment_001
 *   ↓ toCalendarEventId（UTF-8 → base32hex，小寫、無填充）
 * event ID  cdgmopbechgn4nr1e1o6uqbeehmmarjkbso30c8
 *   ↓ fromCalendarEventId
 * 邏輯鍵    calendar_appointment_001
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
 * 邏輯鍵的組成規則只存在本檔（`calendarEventIdForAppointment`），呼叫端不得
 * 自行拼字串——兩處各拼一次，就是漂移的開始。
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
 * 一筆預約 = 日曆上一個事件，從頭到尾同一個 event ID。
 *
 * 這個粒度是刻意的（2026-07-22 決定，解法 A）。曾經是「每個狀態一把鑰匙」
 * （`calendar_{status}_{id}`），但那樣每個狀態都會在日曆上開一格新的：
 *
 * ```text
 * 建立 → 1 個事件；改期 → 2 個；到診 → 3 個；取消 → 仍然 3 個
 * ```
 *
 * 取消刪不掉任何一個，因為它去刪的是「取消專用」的 ID，那格從來沒被建立過。
 * 改成綁預約後，改期是「搬動同一個事件」、到診是「更新同一個事件」、取消是
 * 「刪掉那個事件」——正是 Google 預期的用法，三個症狀一次解決。
 *
 * 併發也安全：worker 讀的是執行當下的預約狀態，兩筆工作不論誰先跑，寫出來
 * 的都是同一個正確結果。
 *
 * 若日後需要「一筆預約對應多個日曆事件」（例如回診提醒另開一則），請新增
 * 另一個具名函式（如 `calendarEventIdForReminder`），不要把狀態塞回這裡。
 */
export function calendarEventIdForAppointment(appointmentId: string): string {
  return toCalendarEventId(`calendar_${appointmentId}`);
}
