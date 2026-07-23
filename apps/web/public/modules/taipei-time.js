import { TIME_ZONE } from './constants.js';

/**
 * Asia/Taipei 的日期與時間換算，集中一處。
 *
 * 先前 `week-view.js` 與 `admin-bootstrap.js` 各自重寫了同一組
 * `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' })`，而回診目標時間
 * 又在別處硬拼 `+08:00`——「時區＋格式選項」是一個典型的 data clump，反覆一起
 * 出現卻散落各檔。全部收斂到這裡：改時區或格式只改一個地方，也不會再有兩份
 * 悄悄長歪。
 *
 * 台北無日光節約，因此以固定 `+08:00` 偏移組回 ISO 是安全的。
 */

const TAIPEI_OFFSET = '+08:00';

const DATE_FORMAT = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: TIME_ZONE
});

const CLOCK_FORMAT = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: TIME_ZONE
});

/** 某一 ISO 時刻在台北的日期（YYYY-MM-DD）。 */
export function taipeiDate(iso) {
  return DATE_FORMAT.format(new Date(iso));
}

/** 今天在台北的日期（YYYY-MM-DD）。 */
export function taipeiTodayDate() {
  return DATE_FORMAT.format(new Date());
}

/** 某一 ISO 時刻在台北的當日分鐘數（0–1439）。 */
export function taipeiMinutes(iso) {
  const parts = CLOCK_FORMAT.formatToParts(new Date(iso));
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value);
  return hour * 60 + minute;
}

/** 由台北日期（YYYY-MM-DD）與時間（HH:MM）組出 ISO 時刻。 */
export function taipeiIso(date, hhmm) {
  return new Date(`${date}T${hhmm}:00${TAIPEI_OFFSET}`).toISOString();
}
