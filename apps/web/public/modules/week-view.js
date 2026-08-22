import {
  APPOINTMENT_STATUS_LABELS,
  BOOKING_KIND_LABELS,
  SLOT_DURATION_MINUTES
} from './constants.js';
import { taipeiDate, taipeiMinutes } from './taipei-time.js';
import { escapeHtml } from './ui-format.js';

/**
 * 預約的週檢視：每個日期是一欄，營業時間只出現在日期表頭。
 *
 * 設計呼應診所的真實規則，而非通用日曆：
 *   - 表頭直接取自該週每日的 weekly availability／date exception，不寫死時刻。
 *   - 沒有預約的 cell 保持空白；只有真實預約或回診提醒會產生事件按鈕。
 *   - 排班外仍存在的預約留在其日期欄，避免設定改變後資料從畫面消失。
 *
 * 這是**呈現層**：資料仍由 store 提供，處置動作留在下方的預約清單。點事件會
 * 捲到對應的卡片，讓視覺總覽與可操作清單分工。
 */

const WEEK_DAY_LABELS = [
  '週一',
  '週二',
  '週三',
  '週四',
  '週五',
  '週六',
  '週日'
];
// 日曆只顯示尚未發生的預約；到診／取消／未到都已成事實，事件已從日曆刪除。
const SHOWN_STATUSES = ['confirmed', 'cancellation_requested'];

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

/** 某一天的營業時段。`extra_open` 例外自帶 intervals，優先於每週排班。 */
function openIntervals(schedule, dateText) {
  const exception = schedule.dateExceptions.find(
    (entry) => entry.date === dateText
  );
  if (exception?.kind === 'closed') return [];
  if (exception?.kind === 'extra_open') return exception.intervals ?? [];
  const sunday0 = new Date(`${dateText}T12:00:00Z`).getUTCDay();
  return (
    schedule.weeklyAvailability.find((entry) => entry.weekday === sunday0)
      ?.intervals ?? []
  );
}

/**
 * 依**看診項目**決定事件的底色（W1，業主 2026-07-27）。
 *
 * 分工：掛號別（初診／回診）決定邊框與圖示，項目決定底色。這樣一格事件同時
 * 回答兩個問題，而且兩者用的是不同的視覺通道。
 *
 * **顏色不是唯一線索**（WCAG 1.4.1）：底色為醫美的事件，`aria-label` 與可見的
 * 第二行文字裡本來就帶著項目名稱（「王小明，14:00，初診，醫美，預約成立」），
 * 所以看不出顏色差別的人一樣讀得到那是什麼。`itemLabel` 是複選後以「、」串起來
 * 的字串，只要其中一項是醫美就整格上醫美色——那是排程上真正要注意的那一項。
 */
function itemToneClass(appointment) {
  const ids = appointment.itemIds ?? [];
  return ids.includes('service_aesthetic') ? 'wv-item-aesthetic' : '';
}

function formatClock(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function eventBlock(layout, patientName) {
  const { appointment, lane, laneCount } = layout;
  const start = taipeiMinutes(appointment.startsAt);
  const kindClass =
    appointment.bookingKind === 'follow_up' ? 'wv-follow-up' : 'wv-initial';
  const kindIcon =
    appointment.bookingKind === 'follow_up' ? '&#8635;' : '&#10010;';
  const statusClass = `wv-status-${escapeHtml(appointment.status)}`;
  const itemClass = itemToneClass(appointment);
  const collisionClass = laneCount > 1 ? ' wv-event-collision' : '';
  const time = formatClock(start);
  const kind = BOOKING_KIND_LABELS[appointment.bookingKind] ?? '';
  const item = appointment.itemLabel ?? '';
  const status = APPOINTMENT_STATUS_LABELS[appointment.status] ?? '';
  const fullLabel = `${patientName}，${time}，${kind}，${item}，${status}`;
  return `<button type="button" class="wv-event ${kindClass} ${itemClass} ${statusClass}${collisionClass}" data-week-event="${escapeHtml(appointment.id)}" data-collision-lane="${lane}" aria-label="${escapeHtml(fullLabel)}" title="${escapeHtml(fullLabel)}"><span class="wv-event-icon" aria-hidden="true">${kindIcon}</span><span class="wv-event-copy"><strong>${escapeHtml(patientName)}</strong><span>${time} · ${escapeHtml(kind)}${item ? ` · ${escapeHtml(item)}` : ''}</span></span></button>`;
}

/**
 * 產生週檢視。
 *
 * @param state store 快照
 * @param weekStart 週一的 YYYY-MM-DD
 * @param todayDate 今天的台北日期（YYYY-MM-DD），用來畫紅線；可省略
 */
/**
 * 兩種檢視共用的資料準備。
 *
 * 網格與行程表只是同一份事實的兩種畫法，篩選規則必須只有一份。各自複製一份
 * 「哪些預約要顯示、哪些日子要出現」正是兩邊開始悄悄不一致的起點——手機看得到
 * 的預約桌機看不到，會比兩邊都少一個檢視更糟。
 */
function weekModel(state, weekStart) {
  const days = Array.from({ length: 7 }, (_, index) =>
    addDays(weekStart, index)
  );
  const patientName = (id) =>
    state.patients.find((item) => item.id === id)?.name ?? id;

  const shown = state.appointments.filter((item) =>
    SHOWN_STATUSES.includes(item.status)
  );

  // C4 owner correction: only days that are actually open belong in the week
  // table. A closed exception removes a normally-open day; an explicit
  // extra_open exception adds a normally-closed day and is labelled 加開.
  const visibleDays = days.flatMap((date, index) => {
    const exception = state.schedule.dateExceptions.find(
      (entry) => entry.date === date
    );
    if (exception?.kind === 'closed') return [];
    const intervals = openIntervals(state.schedule, date);
    if (intervals.length === 0) return [];
    return [
      {
        date,
        label: WEEK_DAY_LABELS[index],
        intervals,
        extraOpen: exception?.kind === 'extra_open'
      }
    ];
  });

  return { visibleDays, shown, patientName };
}

export function renderWeekView(state, weekStart, todayDate) {
  const { visibleDays, shown, patientName } = weekModel(state, weekStart);

  const header = visibleDays
    .map(({ date, label, intervals, extraOpen }) => {
      const today = date === todayDate;
      const hours = intervals
        .map(
          (interval) =>
            `${escapeHtml(interval.startLocalTime)}–${escapeHtml(interval.endLocalTime)}`
        )
        .join('、');
      return `<th scope="col" class="wv-date-head${extraOpen ? ' wv-extra-open' : ''}${today ? ' wv-today' : ''}"><span>${label}${extraOpen ? '<em>加開</em>' : ''}</span><b>${date.slice(5)}</b><small>${hours}</small></th>`;
    })
    .join('');
  const cells = visibleDays
    .map(({ date, label }) => {
      const appointments = shown
        .filter((appointment) => taipeiDate(appointment.startsAt) === date)
        .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
      const events = layoutCalendarEvents(appointments)
        .map((layout) =>
          eventBlock(layout, patientName(layout.appointment.patientId))
        )
        .join('');
      const cellLabel = `${label} ${date.slice(5)}，${appointments.length === 0 ? '無預約' : `${appointments.length} 筆預約`}`;
      return `<td class="wv-date-cell" aria-label="${escapeHtml(cellLabel)}">${events}</td>`;
    })
    .join('');

  return `<table class="wv-date-table"><caption>本週開放門診日；日期為欄，營業時間與加開狀態顯示在表頭</caption><thead><tr>${header}</tr></thead><tbody><tr>${cells}</tr></tbody></table>`;
}

/**
 * 行動版的行程表檢視。
 *
 * 為什麼手機不能用網格：時間網格需要七個並排的欄位，實測 375px 螢幕上容器只有
 * 331px 可用，而內容需要 832px——要橫向捲過 2.5 個螢幕才看得完一週，而且時間軸
 * 不是 sticky，一橫捲就看不到那是幾點。這不是調欄寬能解決的，是**檢視型態**在
 * 這個尺寸上選錯了。
 *
 * 行程表放棄時間軸，改成依日期分組的垂直清單：只往下捲、沒有橫向捲動、日期只在
 * 群組標題出現一次。代價是失去「時段有多空」的視覺感，但手機上的使用情境是查
 * 「今天還有誰」，不是排整週的班——排班在桌機做。
 *
 * 沒有絕對定位，所以不需要 hydrateWeekView，也就沒有任何行內樣式要套。
 */
export function renderAgendaView(state, weekStart, todayDate) {
  const { visibleDays, shown, patientName } = weekModel(state, weekStart);

  if (visibleDays.length === 0)
    return '<p class="wv-empty">這一週沒有門診日。可在排班管理加開日期。</p>';

  const days = visibleDays.map(({ date, label, intervals, extraOpen }) => {
    const today = date === todayDate;
    const events = shown
      .filter((item) => taipeiDate(item.startsAt) === date)
      .sort((left, right) => left.startsAt.localeCompare(right.startsAt));

    const rows =
      events.length === 0
        ? '<li class="wv-agenda-empty">尚無預約</li>'
        : events
            .map((appointment) => {
              const name = patientName(appointment.patientId);
              const minutes = taipeiMinutes(appointment.startsAt);
              const time = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
              const kind = BOOKING_KIND_LABELS[appointment.bookingKind] ?? '';
              const item = appointment.itemLabel ?? '';
              const status =
                APPOINTMENT_STATUS_LABELS[appointment.status] ?? '';
              const kindClass =
                appointment.bookingKind === 'follow_up'
                  ? 'wv-follow-up'
                  : 'wv-initial';
              // 與網格檢視同一句完整標籤：兩種畫法，讀螢幕聽到的內容要一致。
              const fullLabel = `${name}，${time}，${kind}，${item}，${status}`;
              return `<li><button type="button" class="wv-agenda-event ${kindClass} ${itemToneClass(appointment)} wv-status-${escapeHtml(appointment.status)}" data-week-event="${escapeHtml(appointment.id)}" aria-label="${escapeHtml(fullLabel)}"><span class="wv-agenda-time">${time}</span><span class="wv-agenda-copy"><strong>${escapeHtml(name)}</strong><span>${escapeHtml(kind)}${item ? ` · ${escapeHtml(item)}` : ''}</span></span></button></li>`;
            })
            .join('');

    const hours = intervals
      .map((interval) => `${interval.startLocalTime}–${interval.endLocalTime}`)
      .join('、');
    return `<li class="wv-agenda-day${extraOpen ? ' wv-extra-open' : ''}${today ? ' wv-today' : ''}"><div class="wv-agenda-date"><span>${label}${extraOpen ? ' · 加開' : ''}</span><b>${date.slice(8)}</b><small>${escapeHtml(hours)}</small></div><ul class="wv-agenda-events">${rows}</ul></li>`;
  });

  return `<ol class="wv-agenda">${days.join('')}</ol>`;
}

/**
 * 相容既有 bootstrap 呼叫。新的 session matrix 與行程表都採自然排版，沒有任何
 * 需要 CSSOM 注入的絕對座標；保留函式可避免 presentation 改版波及呼叫端。
 */
export function hydrateWeekView(root) {
  return root;
}
