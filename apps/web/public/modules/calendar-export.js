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

const SLOT_MINUTES = 30;

function endOf(startsAt) {
  return new Date(new Date(startsAt).getTime() + SLOT_MINUTES * 60_000);
}

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
    `DTSTART:${stamp(appointment.startsAt)}`,
    `DTEND:${stamp(endOf(appointment.startsAt))}`,
    `SUMMARY:${escapeText(buildSummary(appointment))}`,
    `LOCATION:${escapeText(CLINIC.address)}`,
    `DESCRIPTION:${escapeText(`預約編號 ${appointment.id}`)}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT2H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(`${CLINIC.name} 門診提醒`)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ];
  return `${lines.join('\r\n')}\r\n`;
}

/** Google 日曆的預填網址，給不想下載檔案的使用者。 */
export function buildGoogleCalendarUrl(appointment) {
  const parameters = new URLSearchParams({
    action: 'TEMPLATE',
    text: buildSummary(appointment),
    dates: `${stamp(appointment.startsAt)}/${stamp(endOf(appointment.startsAt))}`,
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
