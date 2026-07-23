import {
  APPOINTMENT_STATUS_LABELS,
  BOOKING_KIND_LABELS,
  SLOT_DURATION_MINUTES
} from './constants.js';
import { taipeiDate, taipeiMinutes } from './taipei-time.js';
import { escapeHtml } from './ui-format.js';

/**
 * 預約的週檢視：左時間軸＋週一～週日七欄，事件依看診時間定位。
 *
 * 設計呼應診所的真實規則，而非通用日曆：
 *   - 初診（整點／30 分）與回診（15 分／45 分）共用時鐘；沒有時間交疊時使用
 *     完整欄寬，真的交疊時才動態分欄，避免固定半欄造成資訊被截斷。
 *   - 週日、週一、週二預設休診，以斜線標示為不可預約。
 *   - 目前時間畫紅線——但只在顯示的那一週包含「今天」時。
 *
 * 這是**呈現層**：資料仍由 store 提供，處置動作留在下方的預約清單。點事件會
 * 捲到對應的卡片，讓視覺總覽與可操作清單分工。
 */

// 檢視自 10:00 到 21:00：涵蓋週六 10:00 開診到平日 20:00 掛號的一小時區塊。
const VIEW_START_MIN = 10 * 60;
const VIEW_END_MIN = 21 * 60;
const PX_PER_MIN = 78 / 60; // 每小時 78px，讓 30 分鐘事件可容納兩行資訊

const WEEK_DAY_LABELS = [
  '週一',
  '週二',
  '週三',
  '週四',
  '週五',
  '週六',
  '週日'
];
const SHOWN_STATUSES = ['confirmed', 'cancellation_requested', 'completed'];

/**
 * 把同一天的預約排成「需要時才分欄」的視覺軌道。
 *
 * 這只處理畫面空間，不改變初診／回診兩條人力線可同時服務的業務規則。
 * 相鄰事件在前一筆結束時即可重新使用同一軌；連鎖交疊會保留同一組的欄數，
 * 避免卡片寬度在同一碰撞群組中忽寬忽窄。
 */
export function layoutCalendarEvents(appointments) {
  const ordered = appointments
    .map((appointment) => {
      const start = taipeiMinutes(appointment.startsAt);
      return {
        appointment,
        start,
        end: start + SLOT_DURATION_MINUTES
      };
    })
    .sort(
      (left, right) =>
        left.start - right.start ||
        String(left.appointment.id).localeCompare(
          String(right.appointment.id),
          'zh-Hant'
        )
    );

  const result = [];
  let group = [];
  let groupEnd = Number.NEGATIVE_INFINITY;

  const flushGroup = () => {
    if (group.length === 0) return;
    const laneEnds = [];
    const laidOut = group.map((entry) => {
      let lane = laneEnds.findIndex((end) => end <= entry.start);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(entry.end);
      } else {
        laneEnds[lane] = entry.end;
      }
      return { appointment: entry.appointment, lane };
    });
    const laneCount = Math.max(1, laneEnds.length);
    result.push(
      ...laidOut.map((entry) => ({
        ...entry,
        laneCount
      }))
    );
    group = [];
    groupEnd = Number.NEGATIVE_INFINITY;
  };

  for (const entry of ordered) {
    if (group.length > 0 && entry.start >= groupEnd) flushGroup();
    group.push(entry);
    groupEnd = Math.max(groupEnd, entry.end);
  }
  flushGroup();
  return result;
}

// 以 UTC 正午為錨點做日期運算，避開時區與 DST（台北無 DST）。
function addDays(dateText, amount) {
  const date = new Date(`${dateText}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function weekdayIndex(dateText) {
  // getUTCDay：0=週日…6=週六。轉成週一起始的 0–6。
  const sunday0 = new Date(`${dateText}T12:00:00Z`).getUTCDay();
  return (sunday0 + 6) % 7;
}

/** 週一為週首：回傳包含 dateText 的那一週的週一日期。 */
export function weekStartOf(dateText) {
  return addDays(dateText, -weekdayIndex(dateText));
}

function isClosed(schedule, dateText) {
  const exception = schedule.dateExceptions.find(
    (entry) => entry.date === dateText
  );
  if (exception?.kind === 'closed') return true;
  if (exception?.kind === 'extra_open') return false;
  const sunday0 = new Date(`${dateText}T12:00:00Z`).getUTCDay();
  return !schedule.weeklyAvailability.some(
    (entry) => entry.weekday === sunday0
  );
}

// 位置以 data-top／data-height 傳遞，由 hydrateWeekView 用 CSSOM 套用。
// 不能用 inline style 屬性：CSP 是 style-src 'self'（無 'unsafe-inline'），
// 會把 style 屬性擋掉——屬性字串在、但完全不生效（實機驗證）。
function hourAxis() {
  const rows = [];
  for (let minute = VIEW_START_MIN; minute <= VIEW_END_MIN; minute += 60) {
    const label = `${String(Math.floor(minute / 60)).padStart(2, '0')}:00`;
    rows.push(
      `<div class="wv-hour" data-top="${(minute - VIEW_START_MIN) * PX_PER_MIN}">${label}</div>`
    );
  }
  return rows.join('');
}

function eventBlock(layout, patientName) {
  const { appointment, lane, laneCount } = layout;
  const start = taipeiMinutes(appointment.startsAt);
  if (start < VIEW_START_MIN || start >= VIEW_END_MIN) return '';
  const top = (start - VIEW_START_MIN) * PX_PER_MIN;
  const height = SLOT_DURATION_MINUTES * PX_PER_MIN - 3;
  const width = 100 / laneCount;
  const left = lane * width;
  const kindClass =
    appointment.bookingKind === 'follow_up' ? 'wv-follow-up' : 'wv-initial';
  const kindIcon =
    appointment.bookingKind === 'follow_up' ? '&#8635;' : '&#10010;';
  const statusClass = `wv-status-${escapeHtml(appointment.status)}`;
  const collisionClass = laneCount > 1 ? ' wv-event-collision' : '';
  const time = `${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}`;
  const kind = BOOKING_KIND_LABELS[appointment.bookingKind] ?? '';
  const item = appointment.itemLabel ?? '';
  const status = APPOINTMENT_STATUS_LABELS[appointment.status] ?? '';
  const fullLabel = `${patientName}，${time}，${kind}，${item}，${status}`;
  return `<button type="button" class="wv-event ${kindClass} ${statusClass}${collisionClass}" data-top="${top}" data-height="${height}" data-left="${left}" data-width="${width}" data-week-event="${escapeHtml(appointment.id)}" aria-label="${escapeHtml(fullLabel)}" title="${escapeHtml(fullLabel)}"><span class="wv-event-icon" aria-hidden="true">${kindIcon}</span><span class="wv-event-copy"><strong>${escapeHtml(patientName)}</strong><span>${time} · ${escapeHtml(kind)}${item ? ` · ${escapeHtml(item)}` : ''}</span></span></button>`;
}

/**
 * 產生週檢視。
 *
 * @param state store 快照
 * @param weekStart 週一的 YYYY-MM-DD
 * @param todayDate 今天的台北日期（YYYY-MM-DD），用來畫紅線；可省略
 */
export function renderWeekView(state, weekStart, todayDate) {
  const days = Array.from({ length: 7 }, (_, index) =>
    addDays(weekStart, index)
  );
  const patientName = (id) =>
    state.patients.find((item) => item.id === id)?.name ?? id;

  const shown = state.appointments.filter((item) =>
    SHOWN_STATUSES.includes(item.status)
  );

  const header = days
    .map((date, index) => {
      const dayNumber = date.slice(8);
      const closed = isClosed(state.schedule, date);
      const today = date === todayDate;
      return `<div class="wv-head-cell${closed ? ' wv-closed' : ''}${today ? ' wv-today' : ''}"><span>${WEEK_DAY_LABELS[index]}</span>${today ? `<b>${dayNumber}</b>` : dayNumber}</div>`;
    })
    .join('');

  const gridHeight = (VIEW_END_MIN - VIEW_START_MIN) * PX_PER_MIN;
  const columns = days
    .map((date) => {
      const closed = isClosed(state.schedule, date);
      const lines = [];
      for (let minute = VIEW_START_MIN; minute < VIEW_END_MIN; minute += 30)
        lines.push(
          `<div class="wv-line${minute % 60 === 0 ? ' wv-line-hour' : ''}" data-top="${(minute - VIEW_START_MIN) * PX_PER_MIN}"></div>`
        );
      const events = closed
        ? '<span class="wv-closed-label">休診</span>'
        : layoutCalendarEvents(
            shown.filter((item) => taipeiDate(item.startsAt) === date)
          )
            .map((layout) =>
              eventBlock(layout, patientName(layout.appointment.patientId))
            )
            .join('');
      let nowLine = '';
      if (date === todayDate) {
        const nowMin = taipeiMinutes(new Date().toISOString());
        if (nowMin >= VIEW_START_MIN && nowMin <= VIEW_END_MIN)
          nowLine = `<div class="wv-now" data-top="${(nowMin - VIEW_START_MIN) * PX_PER_MIN}"></div>`;
      }
      return `<div class="wv-col${closed ? ' wv-closed' : ''}" data-height="${gridHeight}">${lines.join('')}${nowLine}${events}</div>`;
    })
    .join('');

  return `<div class="wv-head"><div class="wv-head-time"></div>${header}</div><div class="wv-grid"><div class="wv-axis" data-height="${gridHeight}">${hourAxis()}</div>${columns}</div>`;
}

/**
 * 把 data-top／data-height 套成實際樣式（CSSOM，不受 CSP 的 style-src 限制）。
 * 於 renderWeekView 的 HTML 插入 DOM 後呼叫。
 */
export function hydrateWeekView(root) {
  for (const element of root.querySelectorAll('[data-height]'))
    element.style.height = `${element.dataset.height}px`;
  for (const element of root.querySelectorAll('[data-top]'))
    element.style.top = `${element.dataset.top}px`;
  for (const element of root.querySelectorAll('[data-left]'))
    element.style.left = `calc(${element.dataset.left}% + 3px)`;
  for (const element of root.querySelectorAll('[data-width]'))
    element.style.width = `calc(${element.dataset.width}% - 6px)`;
}
