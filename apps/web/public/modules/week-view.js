import {
  APPOINTMENT_STATUS_LABELS,
  BOOKING_KIND_LABELS,
  SLOT_DURATION_MINUTES
} from './constants.js';
import { taipeiDate, taipeiIso, taipeiMinutes } from './taipei-time.js';
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

// 檢視範圍由排班推導（介面規則 R-20），不寫死時刻。
//
// 先前是寫死的 10:00–21:00，註解說 21:00 是為了「涵蓋平日 20:00 掛號的一小時
// 區塊」——但 `packages/domain` 的時段產生規定「一格必須完整落在營業時間內，
// 末尾不能被切斷」，平日 12:00–20:00 的最後一格是 19:30 起、20:00 結束。
// **20:00 開始的預約從來不存在**，那一小時永遠是空白。
//
// 比多畫一小時更麻煩的是它寫死：OR-07 才剛把收班時間定案，營業時間再改一次，
// 這個檢視不會跟著動，只會再無聲地失準一次。
//
// 只有在完全推導不出範圍時（例如排班資料損壞）才退回這組保底值。
const FALLBACK_WINDOW = { from: 10 * 60, to: 20 * 60 };
// 每小時 102px。這個數字是**量出來的，不是估的**：一個 30 分鐘事件的方塊高度是
// `SLOT_DURATION_MINUTES * PX_PER_MIN - 3`，而方塊裡要放兩行（患者姓名＋時間·
// 掛號別·療程）加上下各 4px 內距——實測內容需要 46px。
//
// 先前是 78px/小時 → 方塊只有 36px，於是第二行被 `overflow: hidden` 從中間切掉
// （2026-07-25 使用者截圖回報「字被切割」）。註解當時寫著「讓 30 分鐘事件可容納
// 兩行資訊」，但數字從來沒有真的滿足過那個意圖。
//
// 102px → 方塊 48px，比需要的 46px 多 2px 餘裕。改字級或行高時請重新量一次：
// `tests/e2e/workbench-lifecycle.spec.ts` 有一條斷言會在再次被切到時變紅。
const PX_PER_MIN = 102 / 60;

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

function followUpReminderEvents(state) {
  return state.followUps.flatMap((decision) => {
    if (
      decision.status !== 'required' ||
      decision.scheduledAppointmentId !== undefined ||
      !/^\d{4}-\d{2}-\d{2}$/.test(decision.dueDate ?? '') ||
      !/^\d{2}:\d{2}$/.test(decision.dueTime ?? '')
    )
      return [];
    const source = state.appointments.find(
      (appointment) => appointment.id === decision.appointmentId
    );
    if (source === undefined) return [];
    return [
      {
        ...source,
        startsAt: taipeiIso(decision.dueDate, decision.dueTime),
        bookingKind: 'follow_up',
        itemLabel: '回診提醒',
        status: 'follow_up_required'
      }
    ];
  });
}

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

function clockMinutes(text) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(text ?? ''));
  return match === null ? undefined : Number(match[1]) * 60 + Number(match[2]);
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
 * 這一週要畫的時間範圍：顯示中那幾天的營業時間，聯集已存在的預約。
 *
 * 為什麼要把預約也算進去：排班改了**不能讓既有預約從畫面上消失**——那會讓人
 * 以為預約不見了。這與 `visibleDays` 保留「休診但有預約」那一天是同一條防線。
 *
 * 向外對齊到整點，因為時間軸每小時標一次；不對齊的話首尾會出現半格。
 */
function viewWindow(schedule, visibleDays, shown) {
  let from = Infinity;
  let to = -Infinity;
  for (const { date } of visibleDays)
    for (const interval of openIntervals(schedule, date)) {
      const start = clockMinutes(interval.startLocalTime);
      const end = clockMinutes(interval.endLocalTime);
      if (start === undefined || end === undefined) continue;
      from = Math.min(from, start);
      to = Math.max(to, end);
    }
  for (const item of shown) {
    const start = taipeiMinutes(item.startsAt);
    from = Math.min(from, start);
    to = Math.max(to, start + SLOT_DURATION_MINUTES);
  }
  if (from === Infinity || to <= from) return FALLBACK_WINDOW;
  return { from: Math.floor(from / 60) * 60, to: Math.ceil(to / 60) * 60 };
}

// 位置以 data-top／data-height 傳遞，由 hydrateWeekView 用 CSSOM 套用。
// 不能用 inline style 屬性：CSP 是 style-src 'self'（無 'unsafe-inline'），
// 會把 style 屬性擋掉——屬性字串在、但完全不生效（實機驗證）。
function hourAxis(range) {
  const rows = [];
  for (let minute = range.from; minute <= range.to; minute += 60) {
    const label = `${String(Math.floor(minute / 60)).padStart(2, '0')}:00`;
    rows.push(
      `<div class="wv-hour" data-top="${(minute - range.from) * PX_PER_MIN}">${label}</div>`
    );
  }
  return rows.join('');
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

function eventBlock(layout, patientName, range) {
  const { appointment, lane, laneCount } = layout;
  const start = taipeiMinutes(appointment.startsAt);
  // 範圍已由 viewWindow 涵蓋所有已存在的預約，所以正常情況下不會落在外面；
  // 這道防線留著是因為「畫在格子外」比「沒畫」更難察覺。
  if (start < range.from || start >= range.to) return '';
  const top = (start - range.from) * PX_PER_MIN;
  const height = SLOT_DURATION_MINUTES * PX_PER_MIN - 3;
  const width = 100 / laneCount;
  const left = lane * width;
  const kindClass =
    appointment.bookingKind === 'follow_up' ? 'wv-follow-up' : 'wv-initial';
  const kindIcon =
    appointment.bookingKind === 'follow_up' ? '&#8635;' : '&#10010;';
  const statusClass = `wv-status-${escapeHtml(appointment.status)}`;
  const itemClass = itemToneClass(appointment);
  const collisionClass = laneCount > 1 ? ' wv-event-collision' : '';
  const time = `${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}`;
  const kind = BOOKING_KIND_LABELS[appointment.bookingKind] ?? '';
  const item = appointment.itemLabel ?? '';
  const status = APPOINTMENT_STATUS_LABELS[appointment.status] ?? '';
  const fullLabel = `${patientName}，${time}，${kind}，${item}，${status}`;
  return `<button type="button" class="wv-event ${kindClass} ${itemClass} ${statusClass}${collisionClass}" data-top="${top}" data-height="${height}" data-left="${left}" data-width="${width}" data-week-event="${escapeHtml(appointment.id)}" aria-label="${escapeHtml(fullLabel)}" title="${escapeHtml(fullLabel)}"><span class="wv-event-icon" aria-hidden="true">${kindIcon}</span><span class="wv-event-copy"><strong>${escapeHtml(patientName)}</strong><span>${time} · ${escapeHtml(kind)}${item ? ` · ${escapeHtml(item)}` : ''}</span></span></button>`;
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

  const shown = [
    ...state.appointments.filter((item) =>
      SHOWN_STATUSES.includes(item.status)
    ),
    ...followUpReminderEvents(state)
  ];

  // 只顯示「有門診的日子」。
  //
  // 先前七天全部畫出來，休診日整欄鋪滿 45° 斜線——一週有三天休診，於是畫面近一半
  // 是網底，反而把真正要看的門診日擠窄、也擋住視線（2026-07-25 使用者回報）。
  //
  // `isClosed` 對 `extra_open` 例外回傳 false，所以**加開的日子仍然會出現**，
  // 正是「有加開再放進去」。
  //
  // 但有一條防線：**只要那天有預約，就一定要顯示**，即使排班說它休診。資料不能
  // 因為設定改了就從畫面上消失——那會讓人以為預約不見了。
  const visibleDays = days
    .map((date, index) => ({ date, label: WEEK_DAY_LABELS[index] }))
    .filter(
      ({ date }) =>
        !isClosed(state.schedule, date) ||
        shown.some((item) => taipeiDate(item.startsAt) === date)
    );

  return { visibleDays, shown, patientName };
}

export function renderWeekView(state, weekStart, todayDate) {
  const { visibleDays, shown, patientName } = weekModel(state, weekStart);

  if (visibleDays.length === 0)
    return '<p class="wv-empty">這一週沒有門診日。可在排班管理加開日期。</p>';

  const header = visibleDays
    .map(({ date, label }) => {
      const dayNumber = date.slice(8);
      const closed = isClosed(state.schedule, date);
      const today = date === todayDate;
      return `<div class="wv-head-cell${closed ? ' wv-closed' : ''}${today ? ' wv-today' : ''}"><span>${label}</span>${today ? `<b>${dayNumber}</b>` : dayNumber}</div>`;
    })
    .join('');

  const range = viewWindow(state.schedule, visibleDays, shown);
  const gridHeight = (range.to - range.from) * PX_PER_MIN;
  const columns = visibleDays
    .map(({ date }) => {
      const closed = isClosed(state.schedule, date);
      const lines = [];
      for (let minute = range.from; minute < range.to; minute += 30)
        lines.push(
          `<div class="wv-line${minute % 60 === 0 ? ' wv-line-hour' : ''}" data-top="${(minute - range.from) * PX_PER_MIN}"></div>`
        );
      const events = closed
        ? '<span class="wv-closed-label">休診</span>'
        : layoutCalendarEvents(
            shown.filter((item) => taipeiDate(item.startsAt) === date)
          )
            .map((layout) =>
              eventBlock(
                layout,
                patientName(layout.appointment.patientId),
                range
              )
            )
            .join('');
      let nowLine = '';
      if (date === todayDate) {
        const nowMin = taipeiMinutes(new Date().toISOString());
        if (nowMin >= range.from && nowMin <= range.to)
          nowLine = `<div class="wv-now" data-top="${(nowMin - range.from) * PX_PER_MIN}"></div>`;
      }
      return `<div class="wv-col${closed ? ' wv-closed' : ''}" data-height="${gridHeight}">${lines.join('')}${nowLine}${events}</div>`;
    })
    .join('');

  return `<div class="wv-head"><div class="wv-head-time"></div>${header}</div><div class="wv-grid"><div class="wv-axis" data-height="${gridHeight}">${hourAxis(range)}</div>${columns}</div>`;
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

  const days = visibleDays.map(({ date, label }) => {
    const closed = isClosed(state.schedule, date);
    const today = date === todayDate;
    const events = shown
      .filter((item) => taipeiDate(item.startsAt) === date)
      .sort((left, right) => left.startsAt.localeCompare(right.startsAt));

    const rows =
      events.length === 0
        ? `<li class="wv-agenda-empty">${closed ? '休診' : '尚無預約'}</li>`
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

    return `<li class="wv-agenda-day${closed ? ' wv-closed' : ''}${today ? ' wv-today' : ''}"><div class="wv-agenda-date"><span>${label}</span><b>${date.slice(8)}</b></div><ul class="wv-agenda-events">${rows}</ul></li>`;
  });

  return `<ol class="wv-agenda">${days.join('')}</ol>`;
}

/**
 * 把 data-top／data-height 套成實際樣式（CSSOM，不受 CSP 的 style-src 限制）。
 * 於 renderWeekView 的 HTML 插入 DOM 後呼叫。行程表沒有絕對定位，呼叫它是無害的
 * no-op。
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
