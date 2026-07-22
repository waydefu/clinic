import { CLINIC } from './constants.js';

/**
 * 讓患者把自己的預約帶進自己的行事曆。
 *
 * 這與階段 C 的 Google Calendar 投影是兩件事：那一邊寫的是「診所的」日曆、
 * 需要 OAuth 與 worker；這裡只是把畫面上已經有的資訊換一種格式交給患者，
 * 沒有後端、沒有憑證、沒有外部請求。
 *
 * 內容刻意最小化：很多人的行事曆是與家人共用的，因此只放診所名稱、掛號別、
 * 時間與地址，不放身分證、手術種類或備註——與日曆投影同一套原則。
 */

/**
 * 患者端的事件只標記「開始時間」，不佔用一段區間（2026-07-22 專案負責人指定）。
 *
 * 依 RFC 5545 §3.6.1，VEVENT 若只有 DTSTART 而沒有 DTEND／DURATION，就表示
 * 事件落在該時間點上——這正是「只加開始時間」的正確寫法，比塞一個 DTEND
 * 等於 DTSTART 更合規。診所自己的日曆是另一回事：那邊的事件給一小時，
 * 由 apps/worker 的投影負責（見 CLINIC_EVENT_MINUTES）。
 *
 * 為什麼患者端不佔區間：患者的行事曆常與家人共用，一個看得到的時間點就夠了；
 * 佔掉一段時間反而會讓對方誤以為那段時間都不能安排事情。
 */

/** 提醒時間：前一天的同一時刻（RFC 5545 的相對觸發）。 */
const REMINDER_TRIGGER = '-P1D';

/**
 * 事件顏色。`COLOR` 是 RFC 7986 的屬性，採 CSS3 色名。
 *
 * **支援度是盡力而為**：Apple 行事曆等部分用戶端會採用，Google 日曆匯入 .ics
 * 時會忽略它、改用該日曆的預設顏色（Google 只認 API 的 colorId，那條路徑屬於
 * 診所端投影，不是這裡）。因此顏色只當加分，不能拿來承載任何必要資訊。
 * 綠色對應診所品牌色；紅色在多數行事曆語彙裡代表取消或警示，故不採用。
 */
const EVENT_COLOR = 'green';

/** iCalendar 的 UTC 時間格式：20300102T040000Z */
function stamp(value) {
  return new Date(value)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

/** RFC 5545 規定以 CRLF 折行，且值中的逗號、分號與反斜線需跳脫。 */
function escapeText(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

export function buildSummary(appointment) {
  return `${CLINIC.name} ${appointment.kindLabel}`;
}

export function buildIcs(appointment) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Beau Essence Clinic//Appointment//ZH-TW',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${escapeText(appointment.id)}@beauessence`,
    `DTSTAMP:${stamp(Date.now())}`,
    // 只有 DTSTART，沒有 DTEND：事件是一個時間點，不佔用區間。
    `DTSTART:${stamp(appointment.startsAt)}`,
    `SUMMARY:${escapeText(buildSummary(appointment))}`,
    `LOCATION:${escapeText(CLINIC.address)}`,
    `DESCRIPTION:${escapeText(`預約編號 ${appointment.id}`)}`,
    `COLOR:${EVENT_COLOR}`,
    'BEGIN:VALARM',
    `TRIGGER:${REMINDER_TRIGGER}`,
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(`${CLINIC.name} 門診提醒`)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ];
  return `${lines.join('\r\n')}\r\n`;
}

/**
 * Google 日曆的預填網址，給不想下載檔案的使用者。
 *
 * `dates` 是必填且必須成對，因此起訖都給同一個時間點——Google 會建立一個
 * 零長度事件，效果與 .ics 只給 DTSTART 一致。這條路徑沒有顏色與提醒參數可帶
 * （Google 的 TEMPLATE 網址不支援），使用者會拿到自己日曆的預設值。
 */
export function buildGoogleCalendarUrl(appointment) {
  const at = stamp(appointment.startsAt);
  const parameters = new URLSearchParams({
    action: 'TEMPLATE',
    text: buildSummary(appointment),
    dates: `${at}/${at}`,
    location: CLINIC.address,
    details: `預約編號 ${appointment.id}`
  });
  return `https://calendar.google.com/calendar/render?${parameters.toString()}`;
}

export function downloadIcs(appointment) {
  const blob = new Blob([buildIcs(appointment)], {
    type: 'text/calendar;charset=utf-8'
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${appointment.id}.ics`;
  document.body.append(link);
  link.click();
  link.remove();
  // 立即撤銷會讓部分瀏覽器來不及讀取，因此延後釋放。
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
