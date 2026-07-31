import {
  APPOINTMENT_ACTIONS,
  APPOINTMENT_STATUS_LABELS,
  BOOKING_KIND_LABELS,
  BOOKING_NOTE_TAGS,
  DELETE_APPOINTMENT_REASONS,
  FOLLOW_UP_NOTE_TAGS,
  PATIENT_REQUEST_TAGS,
  PATIENT_SOURCE_TAGS,
  PERMISSIONS,
  WEEKDAY_LABELS
} from './constants.js';
import { birthDateHasYear, maskIdentityDocument } from './patient-registry.js';
import { renderTagOptions } from './tag-picker.js';
import { followUpDueTimes, isUpcomingSlot } from './schedule-engine.js';
import { taipeiDate, taipeiIso, taipeiTodayDate } from './taipei-time.js';
import {
  emptyState,
  escapeHtml,
  formatDateTime,
  formatFullDate,
  formatTime,
  groupSlotsByDate,
  roleLabel
} from './ui-format.js';

const auditLabels = {
  appointment_confirmed: '建立預約',
  appointment_notes_updated: '修改備註',
  cancellation_requested: '提出取消',
  appointment_cancelled: '確認取消',
  appointment_completed: '完成到診',
  appointment_completed_without_nhi_card: '完成到診（未帶健保卡）',
  appointment_no_show: '標記未到',
  appointment_rescheduled: '改期',
  appointment_deleted: '刪除預約紀錄',
  follow_up_decided: '登錄回診指示',
  case_manager_assigned: '指派個管師',
  case_manager_reassigned: '改派個管師',
  schedule_published: '發布營業時間',
  account_created: '建立帳號',
  account_status_changed: '變更帳號狀態',
  announcement_saved: '儲存公告',
  maintenance_saved: '儲存維護設定',
  release_recorded: '新增發布紀錄',
  calendar_projection_synced: '日曆同步成功',
  calendar_projection_dead_lettered: '日曆同步失敗（死信）',
  calendar_projection_requeued: '死信重新排入'
};

const appointmentActions = new Set([
  'appointment_confirmed',
  'appointment_notes_updated',
  'cancellation_requested',
  'appointment_cancelled',
  'appointment_completed',
  'appointment_completed_without_nhi_card',
  'appointment_no_show',
  'appointment_rescheduled',
  'appointment_deleted'
]);

const statusIcons = {
  confirmed: '&#10003;',
  cancellation_requested: '!',
  completed: '&#10003;',
  cancelled: '&#8212;',
  no_show: '&#9679;'
};

function patient(state, id) {
  return state.patients.find((item) => item.id === id);
}

// 清單只顯示遮罩後的身分證字號，避免在櫃台螢幕上完整外露。
function patientLabel(state, id) {
  const record = patient(state, id);
  return record === undefined ? id : record.name;
}
function patientDetail(state, id) {
  const record = patient(state, id);
  if (record === undefined) return escapeHtml(id);
  // 生日的年份自 2026-07-27 起是選填，沒填時值長 `--05-20`（XSD gMonthDay）。
  // 直接印出來櫃台會看到兩個減號，像是資料壞掉；換成「5/20（未填年）」，
  // 讓「沒有年份」看起來是一個事實而不是一個錯誤。
  const birth = birthDateHasYear(record.birthDate)
    ? record.birthDate
    : `${record.birthDate.slice(2).replace('-', '/')}（未填年）`;
  // 遮罩走 domain 的統一入口：外籍患者給的是護照，這裡不能因為身分證欄是空的
  // 就顯示破折號——那看起來像資料缺漏，而不是換了一種證件。
  // 病歷號碼是診所自編的流水號，不是敏感識別碼，所以**不遮罩**（與身分證不同）。
  // 沒有號碼時整段不出現，而不是印一個空欄位——櫃台看到的是「還沒開病歷」。
  const chart =
    record.medicalRecordNumber === undefined ||
    record.medicalRecordNumber === ''
      ? ''
      : ` · 病歷 ${escapeHtml(record.medicalRecordNumber)}`;
  return `${escapeHtml(record.phone)} · ${escapeHtml(birth)} · ${escapeHtml(maskIdentityDocument(record))}${chart} · 健保卡：${record.hasNhiCard ? '預計攜帶' : '未登記攜帶'}`;
}

function detailRow(state, id) {
  return `<span class="code detail-line">${patientDetail(state, id)}</span>`;
}

// 哪些處置在什麼狀態下可用，集中在這裡，避免選單與 domain 規則各說各話。
function actionEnabled(actionId, appointment) {
  const active = ['confirmed', 'cancellation_requested'].includes(
    appointment.status
  );
  switch (actionId) {
    case 'follow_up_confirm':
      return appointment.status === 'completed';
    case 'complete':
    case 'complete_without_card':
      return appointment.status === 'confirmed';
    // 列印不改變任何狀態，只是把已有的資料排版印出來。
    // 只在**看診發生之前**可用：那是一張初診資料表，用途是患者到診時拿著它把
    // 其餘欄位手寫補齊。看診結束之後那張紙早就填完了，再印一張空的沒有意義
    // ——而且會讓「已完成到診」那一列多出一個次要動作，把原本直接可按的
    // 「刪除紀錄」推進下拉選單裡（那是刻意不要的，見 workbench-lifecycle 的斷言）。
    case 'print_intake':
      return ['confirmed', 'cancellation_requested'].includes(
        appointment.status
      );
    // 刪除不是生命週期的一步，而是清掉本來就不該存在的紀錄，因此任何狀態
    // 都可以刪；能不能刪由權限決定，不由狀態決定。
    case 'delete':
      return true;
    default:
      return active;
  }
}

function primaryAction(appointment, decided, canManageFollowUp) {
  let action;
  if (appointment.status === 'confirmed')
    action = {
      id: 'complete',
      label: '到診',
      icon: '&#10003;',
      className: 'appointment-arrival-button'
    };
  else if (appointment.status === 'cancellation_requested')
    action = {
      id: 'cancel',
      label: '確認取消',
      icon: '&#10005;',
      className: 'appointment-cancel-button'
    };
  else if (appointment.status === 'completed' && canManageFollowUp)
    action = {
      id: 'follow_up_confirm',
      label: decided ? '查看回診指示' : '登錄回診指示',
      icon: '&#8635;',
      className: 'appointment-follow-up-button'
    };
  if (action === undefined) return { id: undefined, html: '' };
  return {
    id: action.id,
    html: `<button class="button appointment-primary-action ${action.className}" type="button" data-appointment-action="${escapeHtml(action.id)}" data-appointment-id="${escapeHtml(appointment.id)}"><span aria-hidden="true">${action.icon}</span>${escapeHtml(action.label)}</button>`
  };
}

function actionMenu(appointment, primaryActionId, permissions) {
  const items = APPOINTMENT_ACTIONS.filter(
    (action) =>
      action.id !== primaryActionId &&
      action.id !== 'follow_up_confirm' &&
      // 沒有權限的處置根本不出現在選單裡。這只是介面：store 每條路徑仍各自
      // requirePermission，隱藏按鈕從來不是授權。
      (action.permission === undefined ||
        permissions.includes(action.permission)) &&
      actionEnabled(action.id, appointment)
  );
  if (items.length === 0) return '';
  // 只剩一個選項時不要包成下拉選單：把一個動作藏在「更多處置」後面，等於多一次
  // 點擊卻沒有換到任何整理效果，使用者也看不出裡面有什麼。直接攤平成按鈕。
  if (items.length === 1) {
    const action = items[0];
    return `<button class="button button-tertiary${action.id === 'delete' ? ' danger-text' : ''}" type="button" data-appointment-action="${escapeHtml(action.id)}" data-appointment-id="${escapeHtml(appointment.id)}">${escapeHtml(action.label)}</button>`;
  }
  const list = items
    .map(
      (action) =>
        `<button type="button"${action.id === 'delete' ? ' class="danger-text"' : ''} data-appointment-action="${escapeHtml(action.id)}" data-appointment-id="${escapeHtml(appointment.id)}">${escapeHtml(action.label)}</button>`
    )
    .join('');
  return `<details class="action-menu"><summary><span class="action-menu-icon" aria-hidden="true">&#8942;</span><span>更多處置</span><span class="action-menu-chevron" aria-hidden="true">&#8964;</span></summary><div class="action-menu-list">${list}</div></details>`;
}
function managerLabel(state, id) {
  return state.caseManagers.find((item) => item.id === id)?.label ?? id;
}

function tagLabels(ids, catalogue) {
  return (ids ?? [])
    .map((id) => catalogue.find((tag) => tag.id === id)?.label)
    .filter((label) => label !== undefined);
}

/**
 * 每一列的選取方塊。
 *
 * 名稱必須逐列不同：螢幕閱讀器可以只在表單控制項之間跳，那時候看不到同一列的
 * 其他格，一整排都叫「選取」的話根本分不出在勾誰。所以名稱帶上患者與時間。
 * 「全選」則刻意放在表格**外面**的工具列，不放在這一欄的表頭——放進表頭會讓
 * 它變成底下每一個選取方塊的欄位名，把每一列的名稱都汙染成「全選」。
 */
function selectCell(state, entry, selectedIds) {
  const { appointment, effectiveStart } = entry;
  const who = patientLabel(state, appointment.patientId);
  const when = `${formatFullDate(effectiveStart)} ${formatTime(effectiveStart)}`;
  const checked = selectedIds.has(appointment.id) ? ' checked' : '';
  // 方塊包在 `<label>` 裡，讓整格都是點擊區——20px 的方塊在一整片列裡仍然不好
  // 命中，而 padding 對 checkbox 這種取代元素不可靠。`aria-label` 仍決定可及
  // 名稱，label 只負責把可點面積撐大。
  return `<td role="cell" data-label="選取"><label class="row-select-hit"><input type="checkbox" class="row-select" data-appointment-select="${escapeHtml(appointment.id)}" aria-label="${escapeHtml(`選取 ${who} ${when}`)}"${checked}></label></td>`;
}

/**
 * 首頁的待辦，依**急迫性**排序。
 *
 * 急迫性的定義是「多久沒處理會造成傷害」，不是「哪個功能比較重要」：
 *
 *  1. 取消待確認——沒處理就一直佔著時段，別的患者訂不到。傷害每分鐘都在累積。
 *  2. 回診尚未決定——患者離開診所前應該知道下次何時回來，拖過今天就得再聯絡。
 *  3. 個管尚未指派——影響的是月度統計與後續追蹤，可以晚一點。
 *  4. 日曆投影待處理——只影響提醒事件，患者的預約本身不受影響，排最後。
 *
 * 三條原則（見設計文件 §8）：數量為零的待辦**不出現**；最急的那一張放大；
 * 全部為零時保持安靜，而不是顯示四個綠色的零。
 */
const OPERATIONAL_TASKS = [
  // W2（業主 2026-07-27）：已過看診時間十分鐘、狀態仍停在「預約成立」。
  // 排在最前面：那一列代表的是一個現在正站在門口、或根本沒出現的人，而清單
  // 依時間排序會讓它一路往下沉、安靜地被忘掉。取消待確認雖然也在累積傷害，
  // 但那是「時段被佔住」，比不上「有人在現場沒被處理」。
  {
    key: 'overdueArrivals',
    title: '已過時未處理',
    why: '已過看診時間十分鐘仍未按到診或未到',
    href: '#appointments-section',
    tone: 'danger'
  },
  {
    key: 'cancellationRequests',
    title: '取消待確認',
    why: '未確認前時段仍被佔用，其他患者訂不到',
    href: '#appointments-section',
    tone: 'danger'
  },
  {
    key: 'pendingFollowUps',
    title: '回診尚未決定',
    why: '患者離開前應知道下次回診時間',
    href: '#appointments-section',
    tone: 'warning'
  },
  {
    key: 'pendingCaseAssignments',
    title: '個管尚未指派',
    why: '影響月度統計與後續追蹤',
    href: '#case-section',
    tone: 'warning'
  },
  {
    key: 'outboxPending',
    title: '日曆投影待處理',
    why: '只影響提醒事件，預約本身不受影響',
    href: '#audit-section',
    tone: 'neutral'
  }
];

function taskCount(tasks, key) {
  const value = tasks[key];
  return Array.isArray(value) ? value.length : (value ?? 0);
}

export function renderTasks(state) {
  const canViewGovernance =
    state.session?.permissions?.includes(PERMISSIONS.MANAGE_COMMUNICATIONS) ??
    false;
  const pending = OPERATIONAL_TASKS.map((task) => ({
    ...task,
    count: taskCount(state.tasks, task.key)
  })).filter(
    (task) =>
      task.count > 0 && (task.key !== 'outboxPending' || canViewGovernance)
  );

  // 一切正常時保持安靜。四個綠色的零跟三筆待辦佔一樣大的版面，等於什麼都
  // 沒說；這裡改成一句話講完，把注意力留給真的需要處理的事。
  if (pending.length === 0)
    return `<p class="tasks-clear"><span class="tasks-clear-icon" aria-hidden="true">&#10003;</span>目前沒有待辦事項。</p>`;

  return pending
    .map(
      (task, index) =>
        `<a class="task-card task-${task.tone}${index === 0 ? ' task-lead' : ''}" href="${task.href}"><strong>${task.count}</strong><span class="task-title">${escapeHtml(task.title)}</span><span class="task-why">${escapeHtml(task.why)}</span></a>`
    )
    .join('');
}

/**
 * 「下一位」。
 *
 * 這是櫃台整天問最多次的問題，而先前首頁完全沒有。取的是**還沒到的、已確認**
 * 的最早一筆；時間字串自帶 +08:00 偏移，所以直接用毫秒比較就好（與
 * `isUpcomingSlot` 同一個做法），不必自己拆時區。
 */
export function renderNextUp(state, now = Date.now()) {
  const next = state.appointments
    .filter(
      (item) => item.status === 'confirmed' && Date.parse(item.startsAt) > now
    )
    .sort(
      (left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt)
    )[0];

  if (next === undefined)
    return '<p class="next-up-empty">目前沒有已確認的後續預約。</p>';

  const record = patient(state, next.patientId);
  const phone =
    record?.phone === undefined
      ? ''
      : `<span class="code">${escapeHtml(record.phone)}</span>`;
  return `<p class="eyebrow">NEXT UP · 下一位</p><p class="next-up-time"><strong>${escapeHtml(formatTime(next.startsAt))}</strong><span>${escapeHtml(formatFullDate(next.startsAt))}</span></p><p class="next-up-patient"><strong>${escapeHtml(patientLabel(state, next.patientId))}</strong><span>${escapeHtml(BOOKING_KIND_LABELS[next.bookingKind] ?? '')}${next.itemLabel ? ` · ${escapeHtml(next.itemLabel)}` : ''}</span>${phone}</p><a class="summary-action" href="#appointments-section"><span class="summary-action-icon" aria-hidden="true">&#8594;</span>前往處理清單</a>`;
}

/**
 * 備註標籤的勾選清單。
 *
 * `scope` 決定送出方式：建立預約的表單以 `data-booking-tag` 由 bootstrap
 * 逐一讀取；卡片內的修改備註表單走原生 FormData，因此需要 `name`。
 */
export function renderTagPicker(selected = [], scope = 'booking') {
  return renderTagOptions(
    BOOKING_NOTE_TAGS,
    selected,
    scope === 'notes' ? { name: 'noteTags' } : { data: 'data-booking-tag' }
  );
}

// 備註可改的狀態，與 updateAppointmentNotes 的規則一致：已取消或未到的
// 預約是已經發生的事實，不再修改。
function notesEditable(appointment) {
  return ['confirmed', 'cancellation_requested', 'completed'].includes(
    appointment.status
  );
}

export function renderSlots(state, kind, selectedSlotId) {
  const slots = state.slots.filter(
    (slot) =>
      slot.reservationId === undefined &&
      slot.kind === kind &&
      isUpcomingSlot(slot)
  );
  if (slots.length === 0)
    return emptyState('目前沒有可預約時段', '請先由主管發布新的營業時間草稿。');

  return groupSlotsByDate(slots.slice(0, 60))
    .map((group) => {
      const buttons = group.slots
        .map((slot) => {
          const selected = slot.id === selectedSlotId;
          return `<button class="slot-chip${selected ? ' is-selected' : ''}" type="button" data-select-slot="${escapeHtml(slot.id)}" aria-pressed="${selected}">${escapeHtml(formatTime(slot.startsAt))}${selected ? '<span class="slot-chip-mark" aria-hidden="true">✓</span>' : ''}</button>`;
        })
        .join('');
      return `<section class="slot-day"><h4 class="slot-day-label">${escapeHtml(group.label)}<span class="slot-day-count">${group.slots.length} 個${escapeHtml(BOOKING_KIND_LABELS[kind])}時段</span></h4><div class="slot-chip-row">${buttons}</div></section>`;
    })
    .join('');
}

function rescheduleOptions(state, appointment) {
  const options = state.slots
    .filter(
      (slot) =>
        slot.reservationId === undefined &&
        slot.kind === appointment.bookingKind &&
        isUpcomingSlot(slot)
    )
    .slice(0, 24)
    .map(
      (slot) =>
        `<option value="${escapeHtml(slot.id)}">${escapeHtml(formatFullDate(slot.startsAt))} ${escapeHtml(formatTime(slot.startsAt))}</option>`
    )
    .join('');
  return options === ''
    ? '<option value="">沒有可改期的時段</option>'
    : options;
}

// 把每筆預約整理成「佇列項目」，把回診決定的影響一次算好：
//   - 已完成到診 ＋ 需要回診（未安排）→ 回診版（模式 followup，效期＝回診目標）
//   - 其餘 → 一般（效期＝看診時間）
//
// 「已完成到診＋不需要回診」先前是**整筆排除**的，理由是「後續無動作」。但那讓
// 一筆真實發生過的看診從清單上完全消失——連切到「全部狀態」都找不回來，管理者
// 也就沒有辦法再刪除誤建的紀錄。現在它留在清單上（顯示為「已完成到診」），只是
// 預設的「當日」「待處理」篩選本來就不會列出已完成的預約，所以日常畫面不受影響。
// 「效期」同時用於當日篩選與依日期排序，讓回診版依回診日排、而非原就診時間。
function queueEntry(state, appointment) {
  const decision = state.followUps.find(
    (item) => item.appointmentId === appointment.id
  );
  if (appointment.status === 'completed' && decision?.status === 'required') {
    if (decision.scheduledAppointmentId !== undefined) return undefined;
    return {
      appointment,
      decision,
      mode: 'followup',
      effectiveStart: taipeiIso(decision.dueDate, decision.dueTime)
    };
  }
  return {
    appointment,
    decision,
    mode: 'normal',
    effectiveStart: appointment.startsAt
  };
}

// 回診版卡片：已確認需要回診、尚未安排下次門診。主要時間顯示回診目標日
// （＝日曆上的回診日）。「調整回診」把該筆重新放回逐筆回診確認可再改決定。
function followUpQueueCard(state, entry, permissions, selectedIds) {
  const { appointment, decision, effectiveStart } = entry;
  const notes = tagLabels(decision.tags, FOLLOW_UP_NOTE_TAGS);
  if (decision.noteText) notes.push(decision.noteText);
  const noteRow =
    notes.length === 0
      ? ''
      : `<p class="note-row">${notes.map((note) => `<span class="note-chip">${escapeHtml(note)}</span>`).join('')}</p>`;
  // 待安排回診這一列的三個動作，對應櫃台真正會做的三件事：
  //
  //   確認回診  患者要約下一次了 → 帶著資料跳到建立預約（掛號別已選回診、
  //             日期已填回診目標日）。**回診可以發生很多次**：那筆新預約完成
  //             到診後又會再登錄一次回診指示，如此循環。
  //   調整回診  醫師改了指示 → 放回逐筆登錄再改一次。
  //   取消回診  不用回來了 → 走 `not_required`，**日曆上的回診提醒會一併移除**。
  //
  // 先前這裡只有「調整回診」＋選單裡一個「刪除紀錄」。刪除是清掉整筆到診紀錄
  // （只留稽核），拿它當「不用回診了」用是錯的——那會連同已完成的看診事實一起
  // 消失。取消回診只撤銷回診需求，到診紀錄留著。
  const canManage = permissions.includes(PERMISSIONS.MANAGE_FOLLOW_UP);
  // 缺 session 時（測試夾具、登入前）不顯示這些動作，而非拋錯。
  const adjust = canManage
    ? `<button class="button appointment-primary-action appointment-follow-up-button" type="button" data-follow-up-edit="${escapeHtml(appointment.id)}"><span aria-hidden="true">&#8635;</span>調整回診</button>`
    : '';
  const confirmFollowUp = canManage
    ? `<button class="button button-primary appointment-primary-action" type="button" data-follow-up-book="${escapeHtml(appointment.id)}"><span aria-hidden="true">&#10003;</span>確認回診</button>`
    : '';
  const cancelFollowUp = canManage
    ? `<button class="button button-danger-outline" type="button" data-follow-up-cancel="${escapeHtml(appointment.id)}"><span aria-hidden="true">&#10005;</span>取消回診</button>`
    : '';
  return `<tr role="row" class="appointment-row follow-up-pending" data-appointment-card="${escapeHtml(appointment.id)}" data-follow-up-pending="${escapeHtml(appointment.id)}">${selectCell(state, entry, selectedIds)}<td role="cell" data-label="時間"><span class="cell-date">${escapeHtml(formatFullDate(effectiveStart))}</span><strong class="cell-time">${escapeHtml(formatTime(effectiveStart))}</strong></td><td role="cell" data-label="患者"><strong>${escapeHtml(patientLabel(state, appointment.patientId))}</strong>${detailRow(state, appointment.patientId)}</td><td role="cell" data-label="掛號別"><span class="appointment-kind">回診</span></td><td role="cell" data-label="療程">回診提醒已上日曆<span class="detail-line">來源 <span class="code">${escapeHtml(appointment.id)}</span></span></td><td role="cell" data-label="狀態"><span class="status-chip is-reserved"><span class="status-icon" aria-hidden="true">&#8635;</span>待安排回診</span>${noteRow}</td><td role="cell" data-label="處置"><div class="appointment-controls">${confirmFollowUp}${adjust}${cancelFollowUp}</div></td></tr>`;
}

// 櫃台清單的欄位定義。`sortKey` 有值的才可排序——「處置」是一堆按鈕，排它沒有
// 意義。排序鍵回傳的字串一律用 zh-Hant 定序比較，中文才會照筆劃／注音排而不是
// 照 UTF-16 碼位。
const APPOINTMENT_COLUMNS = [
  { label: '選取' },
  { label: '時間', sortKey: 'time' },
  { label: '患者', sortKey: 'patient' },
  { label: '掛號別', sortKey: 'kind' },
  { label: '療程', sortKey: 'item' },
  { label: '狀態', sortKey: 'status' },
  { label: '處置' }
];

export const DEFAULT_APPOINTMENT_SORT = {
  column: 'time',
  direction: 'ascending'
};

// 固定每頁 20 筆，讓櫃台不用再多做一次「每頁筆數」選擇；同時保留 pageSize
// 參數給純函式測試與未來真正有需求時擴充。清單本身只分頁呈現，不改 state，
// 也不改任何預約資料合約。
export const DEFAULT_APPOINTMENT_PAGE_SIZE = 20;

// 每一種排序鍵怎麼從佇列項目取出可比較的值。回診版（mode === 'followup'）的
// 掛號別固定是「回診」、時間用回診目標日，與篩選那邊的規則保持一致。
const SORT_VALUES = {
  time: (state, entry) => String(entry.effectiveStart),
  patient: (state, entry) =>
    patientLabel(state, entry.appointment.patientId) ?? '',
  kind: (state, entry) =>
    entry.mode === 'followup'
      ? '回診'
      : (BOOKING_KIND_LABELS[entry.appointment.bookingKind] ?? ''),
  item: (state, entry) => entry.appointment.itemLabel ?? '',
  status: (state, entry) =>
    entry.mode === 'followup'
      ? '待安排回診'
      : (APPOINTMENT_STATUS_LABELS[entry.appointment.status] ??
        entry.appointment.status ??
        '')
};

function compareEntries(state, sort) {
  const read = SORT_VALUES[sort.column] ?? SORT_VALUES.time;
  const sign = sort.direction === 'descending' ? -1 : 1;
  return (left, right) => {
    const result = read(state, left).localeCompare(
      read(state, right),
      'zh-Hant'
    );
    // 同值時一律回到時間先後，排序才是穩定的：否則每次重畫，同分的列可能換位。
    if (result !== 0) return sign * result;
    return String(left.effectiveStart).localeCompare(
      String(right.effectiveStart)
    );
  };
}

function appointmentEntries(state, filters, sort = DEFAULT_APPOINTMENT_SORT) {
  const query = filters.query.trim().toLocaleLowerCase('zh-Hant');
  const today = taipeiTodayDate();
  return (
    state.appointments
      .map((appointment) => queueEntry(state, appointment))
      .filter((entry) => entry !== undefined)
      .filter((entry) => {
        const { appointment, mode, effectiveStart } = entry;
        const record = patient(state, appointment.patientId);
        const statusMatches =
          filters.status === 'all' ||
          appointment.status === filters.status ||
          (filters.status === 'active' &&
            ['confirmed', 'cancellation_requested'].includes(
              appointment.status
            )) ||
          // 「當日」＝效期落在今天，初診與回診都算（回診版用回診目標日）。
          (filters.status === 'today' && taipeiDate(effectiveStart) === today);
        const kindMatches =
          filters.kind === 'all' ||
          // 回診版一律視為「回診」掛號別。
          (mode === 'followup'
            ? filters.kind === 'follow_up'
            : appointment.bookingKind === filters.kind);
        const queryMatches =
          query === '' ||
          [
            record?.name,
            record?.phone,
            // W4（業主 2026-07-27）：櫃台常常拿著紙本病歷來找那一筆預約，
            // 所以病歷號碼要能直接搜。
            record?.medicalRecordNumber,
            appointment.id,
            appointment.itemLabel,
            BOOKING_KIND_LABELS[appointment.bookingKind]
          ]
            .filter((value) => value !== undefined)
            .some((value) =>
              String(value).toLocaleLowerCase('zh-Hant').includes(query)
            );
        return statusMatches && kindMatches && queryMatches;
      })
      // 預設依效期（回診版用回診日）由近到遠；使用者點欄位標題可改。
      .sort(compareEntries(state, sort))
  );
}

/**
 * 櫃台清單的純分頁模型。
 *
 * `allIds` 讓週檢視可以算出目標預約在哪一頁，不需要先把整張表畫進字串再用
 * 正規表示式反查。頁碼與 pageSize 都在這裡校正，資料被批次處理後即使最後一頁
 * 消失，呼叫端重畫時也會安全回到仍存在的最後一頁。
 */
export function appointmentPage(
  state,
  filters,
  sort = DEFAULT_APPOINTMENT_SORT,
  { page = 1, pageSize = DEFAULT_APPOINTMENT_PAGE_SIZE } = {}
) {
  const allEntries = appointmentEntries(state, filters, sort);
  const safePageSize =
    Number.isSafeInteger(pageSize) && pageSize > 0
      ? pageSize
      : DEFAULT_APPOINTMENT_PAGE_SIZE;
  const totalCount = allEntries.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / safePageSize));
  const requestedPage = Number.isSafeInteger(page) ? page : 1;
  const currentPage = Math.min(Math.max(requestedPage, 1), totalPages);
  const startIndex = (currentPage - 1) * safePageSize;
  const entries = allEntries.slice(startIndex, startIndex + safePageSize);

  return {
    entries,
    ids: entries.map((entry) => entry.appointment.id),
    allIds: allEntries.map((entry) => entry.appointment.id),
    page: currentPage,
    pageSize: safePageSize,
    totalCount,
    totalPages,
    startIndex: totalCount === 0 ? 0 : startIndex,
    endIndex: Math.min(startIndex + entries.length, totalCount)
  };
}

export function renderAppointments(
  state,
  filters,
  sort = DEFAULT_APPOINTMENT_SORT,
  selectedIds = new Set(),
  pagination = {}
) {
  const page = appointmentPage(state, filters, sort, pagination);
  const entries = page.entries;

  if (page.totalCount === 0)
    return emptyState(
      filters.status === 'today' ? '今日尚無預約' : '沒有符合條件的預約',
      filters.status === 'today'
        ? '合成資料多在未來日期；改看「全部狀態」即可瀏覽。'
        : '可調整篩選，或展開下方「建立新預約」。'
    );

  // session 可能還沒建立（測試夾具、登入前的初始畫面）。缺 session 時一律
  // 視為沒有任何權限：隱藏管理控制項，而不是整個清單拋錯。
  // 被委派的權限也要讓入口出現，否則櫃台連「出示授權碼」的機會都沒有。入口
  // 出現不等於授權：送出時仍要通過 requirePermissionOrDelegation。
  const permissions = [
    ...(state.session?.permissions ?? []),
    ...(state.session?.delegatable ?? [])
  ];
  const canManageFollowUp = permissions.includes(PERMISSIONS.MANAGE_FOLLOW_UP);
  const rows = entries
    .map((entry) => {
      if (entry.mode === 'followup')
        return followUpQueueCard(state, entry, permissions, selectedIds);
      const appointment = entry.appointment;
      const notes = tagLabels(appointment.noteTags, BOOKING_NOTE_TAGS);
      // W3：這一次忘了帶健保卡。它是預約層級的事實，與患者的「預計攜帶」分開，
      // 所以顯示在這一列的備註區，而不是改寫患者那一行。
      if (appointment.nhiCardMissing === true) notes.push('本次未帶健保卡');
      // 患者自己在預約時寫的話與勾的標籤（P7／P9）。它們與櫃台的營運備註分開存，
      // 但在同一個地方顯示——櫃台要看的是「這一筆有什麼要注意的」，不是誰寫的。
      for (const label of tagLabels(
        appointment.requestTags,
        PATIENT_REQUEST_TAGS
      ))
        notes.push(label);
      if (appointment.patientNote)
        notes.push(`患者：${appointment.patientNote}`);
      if (appointment.noteText) notes.push(appointment.noteText);
      const noteRow =
        notes.length === 0
          ? ''
          : `<p class="note-row">${notes.map((note) => `<span class="note-chip">${escapeHtml(note)}</span>`).join('')}</p>`;
      const decided = state.followUps.some(
        (item) => item.appointmentId === appointment.id
      );
      // 改期表單只在還能改期的狀態出現，與 actionEnabled 的閘門一致；
      // 否則按「確認改期」只會被 domain 拒絕，看起來像沒反應。
      const rescheduleForm = actionEnabled('reschedule', appointment)
        ? `<form class="reschedule-form" data-reschedule-form="${escapeHtml(appointment.id)}" hidden><label>改期至<select name="slotId">${rescheduleOptions(state, appointment)}</select></label><button class="button button-primary" type="submit">確認改期</button></form>`
        : '';
      // 備註是營運註記（當天到、國外客…），與臨床決定無關，因此放在處置
      // 選單外面直接可按；已取消／未到的預約不再開放修改。
      const editable = notesEditable(appointment);
      const notesControl = editable
        ? `<button class="text-button appointment-note-button" type="button" data-notes-toggle="${escapeHtml(appointment.id)}" aria-expanded="false"><span aria-hidden="true">&#9998;</span>修改備註</button>`
        : '';
      const primary = primaryAction(appointment, decided, canManageFollowUp);
      const notesForm = editable
        ? `<form class="notes-form" data-notes-form="${escapeHtml(appointment.id)}" hidden><fieldset class="tag-picker"><legend>備註（可複選）</legend>${renderTagPicker(appointment.noteTags ?? [], 'notes')}</fieldset><label>自填備註<input name="noteText" type="text" maxlength="120" value="${escapeHtml(appointment.noteText ?? '')}"></label><div class="notes-form-actions"><button class="button button-primary" type="submit">儲存備註</button><button class="text-button" type="button" data-notes-cancel="${escapeHtml(appointment.id)}">取消</button></div></form>`
        : '';
      // 展開式的表單放在跨欄的第二列。只有真的有表單時才產生那一列——空的
      // <tr> 在表格裡仍是一列，會在每筆預約之間留下一道看不出原因的縫。
      const forms =
        rescheduleForm === '' && notesForm === ''
          ? ''
          : `<tr role="row" class="appointment-forms" data-appointment-forms="${escapeHtml(appointment.id)}"><td role="cell" colspan="7">${rescheduleForm}${notesForm}</td></tr>`;
      return `<tr role="row" class="appointment-row" data-appointment-card="${escapeHtml(appointment.id)}">${selectCell(state, entry, selectedIds)}<td role="cell" data-label="時間"><span class="cell-date">${escapeHtml(formatFullDate(appointment.startsAt))}</span><strong class="cell-time">${escapeHtml(formatTime(appointment.startsAt))}</strong></td><td role="cell" data-label="患者"><strong>${escapeHtml(patientLabel(state, appointment.patientId))}</strong>${detailRow(state, appointment.patientId)}</td><td role="cell" data-label="掛號別"><span class="appointment-kind">${escapeHtml(BOOKING_KIND_LABELS[appointment.bookingKind] ?? '')}</span></td><td role="cell" data-label="療程">${escapeHtml(appointment.itemLabel ?? '')}<span class="detail-line"><span class="code">${escapeHtml(appointment.id)}</span></span></td><td role="cell" data-label="狀態"><span class="status-chip status-${escapeHtml(appointment.status)}"><span class="status-icon" aria-hidden="true">${statusIcons[appointment.status] ?? ''}</span>${escapeHtml(APPOINTMENT_STATUS_LABELS[appointment.status] ?? appointment.status)}</span>${noteRow}</td><td role="cell" data-label="處置"><div class="appointment-controls">${primary.html}${notesControl}${actionMenu(appointment, primary.id, permissions)}</div></td></tr>${forms}`;
    })
    .join('');

  // 真正的表格，不是一疊卡片。櫃台在這裡做的事是掃描與比對——同一欄的時間、
  // 姓名與狀態要能垂直對齊才快；卡片把每一筆都包成一個獨立區塊，一屏看得到的
  // 筆數少，欄位也對不齊。
  //
  // `<caption>` 給螢幕閱讀器交代這張表是什麼；視覺上的標題已經在表格外面，
  // 所以它只在無障礙樹裡存在。
  // ARIA role 看起來多餘，但它們是必要的：手機版把 table/tr/td 改成
  // `display: block` 來堆疊，而**改變 display 會讓瀏覽器把表格語意從無障礙樹上
  // 拿掉**（Adrian Roselli 記錄過，Firefox 至今仍會）。螢幕閱讀器因此不再把它
  // 當表格，欄位與表頭的關聯整個消失。明確標上 role 就把語意釘回去。
  // 對照表出自〈Tables, CSS Display Properties, and ARIA〉：table / rowgroup /
  // row / columnheader / cell。
  // 可排序的欄位照 WAI-ARIA APG 的 sortable table 做：`aria-sort` 掛在 `th` 上、
  // 值只有 ascending／descending，**同一時間只有一欄**帶值（其餘不寫這個屬性）；
  // 欄名包成 `<button>`，鍵盤操作就交給瀏覽器原生的按鈕行為，不必自己接鍵盤。
  // 方向箭頭是純裝飾，設 aria-hidden 免得被讀進按鈕的可及名稱。
  const columns = APPOINTMENT_COLUMNS.map(({ label, sortKey }) => {
    if (sortKey === undefined)
      return `<th scope="col" role="columnheader">${label}</th>`;
    const active = sort.column === sortKey;
    const ariaSort = active ? ` aria-sort="${sort.direction}"` : '';
    const arrow = active
      ? `<span class="sort-arrow" aria-hidden="true">${sort.direction === 'ascending' ? '&#9650;' : '&#9660;'}</span>`
      : '';
    return `<th scope="col" role="columnheader"${ariaSort}><button class="sort-button" type="button" data-sort-column="${escapeHtml(sortKey)}">${label}${arrow}</button></th>`;
  }).join('');
  // caption 在視覺上是隱藏的，所以順便在這裡把「怎麼改排序」講給螢幕閱讀器聽，
  // 不必在每一顆欄名按鈕上重複一次。
  const sorted = APPOINTMENT_COLUMNS.find(
    (column) => column.sortKey === sort.column
  );
  const direction = sort.direction === 'ascending' ? '遞增' : '遞減';
  return `<table class="data-table appointment-table" role="table"><caption>櫃台處理清單，目前依${escapeHtml(sorted?.label ?? '時間')}${direction}排序。點欄位標題可變更排序。</caption><thead role="rowgroup"><tr role="row">${columns}</tr></thead><tbody role="rowgroup">${rows}</tbody></table>`;
}

// 排班的三段各自是一張小表。它們的欄位不同（星期／日期／掛號別），硬併成一張
// 會逼出一堆空格，所以維持三張，共用 .data-table 的樣式與手機堆疊。
//
// 已發布版與草稿版用的是同一個函式，差別只有 `editable`：草稿才有刪除按鈕。
// 因此「操作」欄只在可編輯時才存在——不可編輯時留一欄空白會讓兩邊看起來像
// 少了東西。
function scheduleTable(caption, columns, rows, emptyText) {
  const head = columns
    .map((label) => `<th scope="col" role="columnheader">${label}</th>`)
    .join('');
  const body =
    rows === ''
      ? `<tr role="row"><td role="cell" colspan="${columns.length}" class="empty-cell">${escapeHtml(emptyText)}</td></tr>`
      : rows;
  return `<table class="data-table schedule-table" role="table"><caption>${escapeHtml(caption)}</caption><thead role="rowgroup"><tr role="row">${head}</tr></thead><tbody role="rowgroup">${body}</tbody></table>`;
}

export function renderSchedule(schedule, editable) {
  const label = editable ? '草稿' : '已發布';
  const actionColumn = editable ? ['操作'] : [];
  const weekly = schedule.weeklyAvailability
    .flatMap((entry) =>
      entry.intervals.map(
        (interval, index) =>
          `<tr role="row" data-weekly-row="${entry.weekday}:${index}"><td role="cell" data-label="星期"><strong>${WEEKDAY_LABELS[entry.weekday]}</strong></td><td role="cell" data-label="時段"><span class="code">${escapeHtml(interval.startLocalTime)}–${escapeHtml(interval.endLocalTime)}</span></td>${editable ? `<td role="cell" data-label="操作"><button class="text-button danger-text" type="button" data-remove-weekly="${entry.weekday}:${index}">刪除時段</button></td>` : ''}</tr>`
      )
    )
    .join('');
  const exceptions = schedule.dateExceptions
    .map(
      (entry) =>
        `<tr role="row" data-exception-row="${escapeHtml(entry.date)}"><td role="cell" data-label="日期"><strong>${escapeHtml(entry.date)}</strong></td><td role="cell" data-label="內容">${entry.kind === 'closed' ? '休診' : `加開 ${entry.intervals.map((item) => `${escapeHtml(item.startLocalTime)}–${escapeHtml(item.endLocalTime)}`).join('、')}`}</td>${editable ? `<td role="cell" data-label="操作"><button class="text-button danger-text" type="button" data-remove-exception="${escapeHtml(entry.date)}">刪除例外</button></td>` : ''}</tr>`
    )
    .join('');
  const blocked = schedule.blockedTimes ?? { initial: [], follow_up: [] };
  const blockedRows = [
    ['初診', blocked.initial ?? []],
    ['回診', blocked.follow_up ?? []]
  ]
    .map(
      ([kind, times]) =>
        `<tr role="row"><td role="cell" data-label="掛號別"><strong>${kind}</strong></td><td role="cell" data-label="不開放時間"><span class="code">${escapeHtml(times.join('、') || '無')}</span></td></tr>`
    )
    .join('');
  return `<div class="schedule-display"><p class="code">TIME ZONE · ${escapeHtml(schedule.timeZone)}</p><div><h4>每週時段</h4>${scheduleTable(`${label}的每週固定看診時段`, ['星期', '時段', ...actionColumn], weekly, '尚未設定每週時段。')}</div><div><h4>日期例外</h4>${scheduleTable(`${label}的日期例外：休診與加開`, ['日期', '內容', ...actionColumn], exceptions, '尚無日期例外。')}</div><div><h4>固定不開放</h4>${scheduleTable(`${label}的固定不開放時間`, ['掛號別', '不開放時間'], blockedRows, '無')}</div></div>`;
}

// 逐筆回診確認只列「尚未決定」的已完成到診——存檔後即從這裡消失。已決定者
// 若要再改，透過櫃台清單回診版的「調整回診」把它放回 editingIds 暫時顯示。
export function renderFollowUps(state, editingIds = new Set()) {
  const completed = state.appointments.filter(
    (item) =>
      item.status === 'completed' &&
      (editingIds.has(item.id) ||
        !state.followUps.some((entry) => entry.appointmentId === item.id))
  );
  if (completed.length === 0)
    return emptyState(
      '沒有待確認的回診',
      '完成到診後會在此逐筆確認；已決定者可從清單的回診版「調整回診」再改。'
    );
  return completed
    .map((appointment) => {
      const decision = state.followUps.find(
        (item) => item.appointmentId === appointment.id
      );
      const tags = FOLLOW_UP_NOTE_TAGS.map(
        (tag) =>
          `<label class="tag-option"><input type="checkbox" name="tags" value="${escapeHtml(tag.id)}" ${decision?.tags?.includes(tag.id) ? 'checked' : ''} />${escapeHtml(tag.label)}</label>`
      ).join('');
      // 目標日期預設為第一個有回診時段的門診日（舊版寫死 2030-01-15，
      // 其實是週二未營業日）；時間選單只列該日可掛號的回診時間，
      // 未營業日給出明確提示而不是留下可送出的空值。
      // slot id 形如 slot_20300102_1215，前段就是台北時間的日期。
      const firstId = state.slots.find((slot) => slot.kind === 'follow_up')?.id;
      const firstFollowUpDate =
        firstId === undefined
          ? undefined
          : `${firstId.slice(5, 9)}-${firstId.slice(9, 11)}-${firstId.slice(11, 13)}`;
      // 完全沒有回診時段時（排班全關）退回今天：任何寫死的日期遲早會變成過去，
      // 而 2026-07-27 之前那個 2030-01-16 已經是「合成視窗固定在 2030」時代的遺物。
      const dueDate =
        decision?.dueDate ?? firstFollowUpDate ?? taipeiTodayDate();
      const dueTimes = followUpDueTimes(state.schedule, dueDate);
      const dueTimeOptions = dueTimes.length
        ? dueTimes
            .map(
              (time) =>
                `<option value="${escapeHtml(time)}" ${decision?.dueTime === time ? 'selected' : ''}>${escapeHtml(time)}</option>`
            )
            .join('')
        : '<option value="">當天未營業</option>';
      // 個管指派在這裡是「順手做完」的捷徑，與「個管指派」分頁用的是同一個
      // domain 函式與同一組稽核事件；留空表示暫不指派，不會清掉既有指派。
      const assignment = state.caseAssignments.find(
        (item) =>
          item.appointmentId === appointment.id && item.status === 'active'
      );
      const managerOptions = state.caseManagers
        .filter((item) => item.status === 'active')
        .map(
          (manager) =>
            `<option value="${escapeHtml(manager.id)}" ${assignment?.managerId === manager.id ? 'selected' : ''}>${escapeHtml(manager.label)}</option>`
        )
        .join('');
      const permissions = state.session?.permissions ?? [];
      const canAssign = permissions.includes(PERMISSIONS.ASSIGN_CASE);
      const canReassign = permissions.includes(PERMISSIONS.REASSIGN_CASE);
      const canEditManager =
        (assignment === undefined && canAssign) ||
        (assignment !== undefined && canReassign);
      const managerField = canEditManager
        ? `<label>個管師<select name="managerId"><option value="">${assignment ? '維持目前指派' : '暫不指派'}</option>${managerOptions}</select><span class="field-hint">${assignment ? `目前個管師：${escapeHtml(managerLabel(state, assignment.managerId))}` : '可在此首次指派，後續改派限主管'}</span></label>`
        : `<div class="read-only-field"><span>目前個管師</span><strong>${escapeHtml(assignment ? managerLabel(state, assignment.managerId) : '尚未指派')}</strong></div>`;
      const recordedBy =
        decision === undefined
          ? '尚未登錄'
          : (state.workspace.accounts.find(
              (account) =>
                account.id ===
                (decision.followUpRecordedBy ?? decision.decidedBy)
            )?.label ?? '合成帳號');
      // W4（業主 2026-07-27）：病歷號碼填在這裡。這是櫃台第一次真的拿得到號碼的
      // 時機——患者已經到診、病歷已經開出來了。號碼掛在**患者**身上（回診時是
      // 同一個），所以欄位的預設值讀的是患者紀錄，不是這一筆預約。
      const chartNumber = patient(
        state,
        appointment.patientId
      )?.medicalRecordNumber;
      return `<form class="decision-card" data-follow-up-form="${escapeHtml(appointment.id)}"><div><span class="status-chip ${decision ? 'is-available' : 'is-reserved'}">${decision ? (decision.status === 'required' ? '依醫師指示需回診' : '依醫師指示目前無需回診') : '待登錄醫師指示'}</span><strong>${escapeHtml(patientLabel(state, appointment.patientId))}</strong><span class="code">${escapeHtml(appointment.id)} · ${escapeHtml(appointment.itemLabel ?? '')}</span><span class="field-hint">回診決定者：醫師 · 資料登錄者：${escapeHtml(recordedBy)}</span></div><label>病歷號碼<input name="medicalRecordNumber" type="text" maxlength="20" autocomplete="off" value="${escapeHtml(chartNumber ?? '')}"><span class="field-hint">診所自編的號碼，可用它搜尋預約。沒有固定格式，照病歷上的填。</span></label><label>醫師指示<select name="status"><option value="required" ${decision?.status === 'required' ? 'selected' : ''}>依醫師指示需要回診</option><option value="not_required" ${decision?.status === 'not_required' ? 'selected' : ''}>依醫師指示目前無需回診</option></select></label><label>目標日期<input name="dueDate" type="date" value="${escapeHtml(dueDate)}"></label><label>目標時間<select name="dueTime">${dueTimeOptions}</select></label>${managerField}<fieldset class="tag-picker"><legend>回診項目（可複選）</legend>${tags}</fieldset><label>自填備註<input name="noteText" type="text" maxlength="120" value="${escapeHtml(decision?.noteText ?? '')}"></label><label>診斷書份數<input name="certificateCopies" type="number" min="0" max="10" value="${escapeHtml(String(decision?.certificateCopies ?? 0))}"></label><button class="button button-primary" type="submit">儲存回診指示</button></form>`;
    })
    .join('');
}

/**
 * 初診基本資料列印頁（W7，業主 2026-07-27）。
 *
 * 它做的事只有一件：把**已經有的**資料排進紙本初診表最上面那個大框的版面，
 * 其餘欄位輸出空白底線讓患者或櫃台到診時手寫。**不儲存任何病歷內容**——真正的
 * 電子病歷受醫療法與《醫療機構電子病歷製作及管理辦法》規範，那是另一件事。
 *
 * 身分證字號在**畫面上遮罩、列印時完整**，只為驗證 2026-07-27 業主指定的合成
 * 報到單版面。這不代表正式紙本必須收完整號碼，也不代表目前的瀏覽器內登入 gate
 * 已取得真實資料存取權；必要性、列印與銷毀規則仍待 D-002，D-006 核准的存取
 * 控制則仍待 Stage 2 C2～C4 實作與驗證。
 * 兩個值都在 DOM 裡，由 `@media print` 切換，所以列印後必須立即清空容器。
 *
 * 沒有收集的欄位（住址、職業、婚姻、市話、聯絡人、LineID、性別、年齡）一律留白：
 * 那是資料最小化的結果，不是漏印。空白底線讓紙上看得出「這裡要填」。
 */
// 空白底線用 class 決定寬度，**不能用 inline style 屬性**：CSP 是
// `style-src 'self'`（無 'unsafe-inline'），style 屬性會被整個擋掉——屬性字串
// 還在，但完全不生效（week-view 的定位當初就是為此改走 CSSOM）。
function blankLine(size = 'md') {
  return `<span class="intake-blank intake-blank-${size}"></span>`;
}

export function renderIntakeSheet(state, appointmentId) {
  const appointment = state.appointments.find(
    (item) => item.id === appointmentId
  );
  if (appointment === undefined) return '';
  const record = patient(state, appointment.patientId) ?? {};
  const assignment = state.caseAssignments.find(
    (item) => item.appointmentId === appointmentId && item.status === 'active'
  );

  const birth = birthDateHasYear(record.birthDate)
    ? `${record.birthDate.slice(0, 4)} 年 ${record.birthDate.slice(5, 7)} 月 ${record.birthDate.slice(8, 10)} 日`
    : `${blankLine('sm')} 年 ${(record.birthDate ?? '').slice(2, 4)} 月 ${(record.birthDate ?? '').slice(5, 7)} 日`;

  // 身分證：畫面遮罩、列印完整。兩個值都在，靠 @media print 換。
  const document_ = record.nationalId
    ? `<span class="intake-screen-only">${escapeHtml(maskIdentityDocument(record))}</span><span class="intake-print-only">${escapeHtml(record.nationalId)}</span>`
    : record.passportNumber
      ? `<span class="intake-screen-only">${escapeHtml(maskIdentityDocument(record))}</span><span class="intake-print-only">${escapeHtml(record.passportNumber)}（護照）</span>`
      : blankLine();

  const sources = tagLabels(appointment.sourceTags, PATIENT_SOURCE_TAGS);
  const referral =
    appointment.referrerName === undefined || appointment.referrerName === ''
      ? ''
      : `（介紹人：${escapeHtml(appointment.referrerName)}）`;

  const cell = (label, value, span = 1) =>
    `<div class="intake-cell" data-span="${span}"><span class="intake-label">${label}</span><span class="intake-value">${value}</span></div>`;

  return `<div class="intake-sheet">
    <header class="intake-head">
      <strong>一森渼診所 · 初診基本資料</strong>
      <span class="intake-note">線上已填的欄位已印出；空白處請於到診時填寫。</span>
    </header>
    <div class="intake-grid">
      ${cell('病歷號碼', record.medicalRecordNumber ? escapeHtml(record.medicalRecordNumber) : blankLine('sm'))}
      ${cell('初診日期', escapeHtml(formatFullDate(appointment.startsAt)))}
      ${cell('管理師', assignment ? escapeHtml(managerLabel(state, assignment.managerId)) : blankLine('sm'))}
      ${cell('姓名', record.name ? escapeHtml(record.name) : blankLine())}
      ${cell('生日', birth)}
      ${cell('年齡', blankLine('sm'))}
      ${cell('性別', `${blankLine('xs')} 男 ／ ${blankLine('xs')} 女`)}
      ${cell('身分證字號', document_)}
      ${cell('手機', record.phone ? escapeHtml(record.phone) : blankLine())}
      ${cell('市話', blankLine())}
      ${cell('婚姻', `${blankLine('xs')} 已婚 ／ ${blankLine('xs')} 單身`)}
      ${cell('住址', blankLine('full'), 3)}
      ${cell('職業', blankLine())}
      ${cell('聯絡人', blankLine())}
      ${cell('聯絡人手機', blankLine())}
      ${cell('關係', blankLine('sm'))}
      ${cell('LineID', blankLine())}
      ${cell(
        '如何得知診所訊息',
        sources.length === 0
          ? blankLine('full')
          : `${escapeHtml(sources.join('、'))}${referral}`,
        4
      )}
      ${cell('本次看診項目', escapeHtml(appointment.itemLabel ?? ''), 2)}
      ${cell(
        '患者備註',
        appointment.patientNote
          ? escapeHtml(appointment.patientNote)
          : blankLine('full'),
        2
      )}
    </div>
  </div>`;
}

// 個管指派同樣是掃描工作：管理者要一眼看出「誰還沒指派」。表格把狀態與患者
// 對齊成兩欄，比一疊卡片快得多。
//
// 每一列的指派表單放在最後一格裡——`<form>` 不能包住 `<tr>`（HTML 剖析器會把它
// 丟出表格外），但放進 `<td>` 完全合法，`data-case-form` 的 submit 事件委派因此
// 一行都不用改。
export function renderCaseAssignments(state) {
  const completed = state.appointments.filter(
    (item) => item.status === 'completed'
  );
  if (completed.length === 0)
    return emptyState('尚無待指派個案', '完成到診後才會出現個管指派工作。');
  const rows = completed
    .map((appointment) => {
      const assignment = state.caseAssignments.find(
        (item) =>
          item.appointmentId === appointment.id && item.status === 'active'
      );
      const managers = state.caseManagers
        .filter((item) => item.status === 'active')
        .map(
          (manager) =>
            `<option value="${escapeHtml(manager.id)}" ${assignment?.managerId === manager.id ? 'selected' : ''}>${escapeHtml(manager.label)}</option>`
        )
        .join('');
      // 每一列的控制項都需要自己的名稱：螢幕閱讀器可以逐一跳過表單控制項，
      // 那時候看不到欄位表頭，所以名稱裡帶上患者，才知道改的是誰。
      const who = patientLabel(state, appointment.patientId);
      const formId = `case-form-${appointment.id}`;
      const permissions = state.session?.permissions ?? [];
      const canEdit =
        (assignment === undefined &&
          permissions.includes(PERMISSIONS.ASSIGN_CASE)) ||
        (assignment !== undefined &&
          permissions.includes(PERMISSIONS.REASSIGN_CASE));
      const managerCell = canEdit
        ? `<form class="case-form" id="${escapeHtml(formId)}" data-case-form="${escapeHtml(appointment.id)}"><select name="managerId" aria-label="${escapeHtml(`${who} 的個管師`)}">${managers}</select></form>`
        : `<strong>${escapeHtml(assignment ? managerLabel(state, assignment.managerId) : '尚未指派')}</strong>`;
      const actionCell = canEdit
        ? `<button class="button button-primary" type="submit" form="${escapeHtml(formId)}">${assignment ? '改派個管師' : '指派個管師'}</button>`
        : '<span class="field-hint">改派限主管</span>';
      return `<tr role="row" class="case-row" data-case-row="${escapeHtml(appointment.id)}"><td role="cell" data-label="狀態"><span class="status-chip ${assignment ? 'is-available' : 'is-reserved'}">${assignment ? '已指派' : '待指派'}</span></td><td role="cell" data-label="患者"><strong>${escapeHtml(who)}</strong><span class="code detail-line">${escapeHtml(appointment.id)}</span></td><td role="cell" data-label="個管師">${managerCell}</td><td role="cell" data-label="操作">${actionCell}</td></tr>`;
    })
    .join('');
  const columns = ['狀態', '患者', '個管師', '操作']
    .map((label) => `<th scope="col" role="columnheader">${label}</th>`)
    .join('');
  return `<table class="data-table case-table" role="table"><caption>完成到診的患者與個管師指派狀態；首次指派可由櫃台處理，改派限主管</caption><thead role="rowgroup"><tr role="row">${columns}</tr></thead><tbody role="rowgroup">${rows}</tbody></table>`;
}

// 月度統計本來就是數字表：同一欄的數字要能上下比對（誰帶的患者多、哪一期
// 到診次數掉下來），卡片做不到這件事。數字欄靠右對齊、用等寬字，讓位數對齊。
export function renderWorkload(state) {
  if (state.workload.length === 0)
    return emptyState('尚無月度工作量', '完成到診並指派個管師後才會產生統計。');
  const rows = state.workload
    .map(
      (entry) =>
        `<tr role="row" class="workload-row" data-workload-row="${escapeHtml(`${entry.managerId}:${entry.payrollPeriod}`)}"><td role="cell" data-label="個管師"><strong>${escapeHtml(managerLabel(state, entry.managerId))}</strong></td><td role="cell" data-label="期間"><span class="code">${escapeHtml(entry.payrollPeriod)}</span></td><td role="cell" data-label="不重複患者" class="numeric">${entry.uniquePatientCount}</td><td role="cell" data-label="完成到診" class="numeric">${entry.visitCount}</td><td role="cell" data-label="Credit" class="numeric">${entry.creditCount}</td></tr>`
    )
    .join('');
  const columns = [
    ['個管師', ''],
    ['期間', ''],
    ['不重複患者', ' class="numeric"'],
    ['完成到診', ' class="numeric"'],
    ['Credit', ' class="numeric"']
  ]
    .map(
      ([label, cls]) =>
        `<th scope="col" role="columnheader"${cls}>${label}</th>`
    )
    .join('');
  return `<table class="data-table workload-table" role="table"><caption>個管師月度工作量：不重複患者、完成到診次數與 credit（計算規則 completed_unique_patient / synthetic-v1）</caption><thead role="rowgroup"><tr role="row">${columns}</tr></thead><tbody role="rowgroup">${rows}</tbody></table>`;
}

// 員工權限清單也是一張資料表，不是一疊卡片：管理者在這裡掃描「誰是管理者、
// 誰被停用」，同一欄要垂直對齊才快。識別放在 data-account-row 上，事件仍掛在
// 按鈕的 data-account-toggle——測試與事件委派都不去選 tr/td。
export function renderAccounts(workspace) {
  const columns = ['帳號', '角色', '狀態', '操作']
    .map((label) => `<th scope="col" role="columnheader">${label}</th>`)
    .join('');
  const rows = workspace.accounts
    .map((account) => {
      const active = account.status === 'active';
      return `<tr role="row" class="account-row" data-account-row="${escapeHtml(account.id)}"><td role="cell" data-label="帳號"><strong>${escapeHtml(account.label)}</strong><span class="code detail-line">${escapeHtml(account.id)}</span></td><td role="cell" data-label="角色">${escapeHtml(roleLabel(account.role))}</td><td role="cell" data-label="狀態"><span class="status-chip ${active ? 'is-available' : 'is-reserved'}">${active ? '啟用' : '停用'}</span></td><td role="cell" data-label="操作"><button class="button button-tertiary" type="button" data-account-toggle="${escapeHtml(account.id)}">${active ? '停用' : '恢復'}</button></td></tr>`;
    })
    .join('');
  return `<table class="data-table account-table" role="table"><caption>員工帳號與權限，含啟用狀態</caption><thead role="rowgroup"><tr role="row">${columns}</tr></thead><tbody role="rowgroup">${rows}</tbody></table>`;
}

/**
 * 權限委派與授權碼清單。
 *
 * **授權碼本身永遠不出現在畫面上**，連管理者也一樣：這台機器旁邊會站著患者，
 * 而且畫面會被截圖與投影。管理者需要的是「有哪幾組、還開著嗎」，不是把密碼
 * 重看一次；忘記了就停用舊的、新增一組。
 */
export function renderDelegations(workspace) {
  const delegations = workspace.delegations ?? [];
  if (delegations.length === 0)
    return emptyState('沒有可委派的動作', '目前沒有設定任何權限委派。');

  return delegations
    .map((delegation) => {
      const rows =
        delegation.authorizations.length === 0
          ? `<tr role="row"><td role="cell" colspan="3">尚未新增授權碼。未新增之前，即使開啟委派，櫃台仍然無法刪除。</td></tr>`
          : delegation.authorizations
              .map((authorization) => {
                const enabled = authorization.enabled === true;
                return `<tr role="row" data-authorization-row="${escapeHtml(authorization.id)}"><td role="cell" data-label="名稱">${escapeHtml(authorization.label)}</td><td role="cell" data-label="狀態"><span class="status-chip ${enabled ? 'status-completed' : 'status-cancelled'}">${enabled ? '啟用中' : '已停用'}</span></td><td role="cell" data-label="操作"><button class="button button-tertiary" type="button" data-authorization-toggle="${escapeHtml(authorization.id)}" data-delegation="${escapeHtml(delegation.permission)}">${enabled ? '停用' : '啟用'}</button></td></tr>`;
              })
              .join('');
      const on = delegation.enabled === true;
      const columns = ['名稱', '狀態', '操作']
        .map((label) => `<th scope="col" role="columnheader">${label}</th>`)
        .join('');
      return `<div class="delegation-block"><p class="result-summary"><span class="status-chip ${on ? 'status-completed' : 'status-cancelled'}">${on ? '委派已開啟' : '委派已關閉'}</span> 共 ${delegation.authorizations.length} 組授權碼</p><button class="button button-secondary" type="button" data-delegation-toggle="${escapeHtml(delegation.permission)}">${on ? '關閉委派' : '開啟委派'}</button><table class="data-table authorization-table" role="table"><caption>刪除預約的授權碼與啟用狀態；授權碼本身不顯示</caption><thead role="rowgroup"><tr role="row">${columns}</tr></thead><tbody role="rowgroup">${rows}</tbody></table></div>`;
    })
    .join('');
}

export function renderReleases(workspace) {
  return workspace.releases
    .map(
      (release) =>
        `<article class="release-row"><span class="status-chip status-completed">${escapeHtml(release.version)}</span><div><strong>${escapeHtml(release.summary)}</strong><span>${escapeHtml(formatDateTime(release.publishedAt))}</span></div></article>`
    )
    .join('');
}

export function renderAudit(state, filter) {
  const events = state.auditEvents.filter((event) => {
    if (filter === 'all') return true;
    if (filter === 'appointment') return appointmentActions.has(event.action);
    if (filter === 'schedule') return event.action === 'schedule_published';
    return (
      !appointmentActions.has(event.action) &&
      event.action !== 'schedule_published'
    );
  });
  if (events.length === 0)
    return '<p class="empty-event">尚無符合條件的稽核事件。</p>';
  // 稽核是「查證」用的：讀的人要沿著同一欄比對時間、找出某個對象的所有動作。
  // 時間軸把三種資訊擠在一行，對不齊也篩不動，所以這裡也是資料表。最新的在
  // 最上面（reverse），與先前的時間軸一致。
  const rows = [...events]
    .reverse()
    .map((event) => {
      // 刪除的紀錄已經不在清單上了，稽核這一行就是它存在過的唯一證據，
      // 因此理由與刪除前狀態要直接看得到，不能只留在資料裡。
      const reason = DELETE_APPOINTMENT_REASONS.find(
        (item) => item.id === event.reasonCode
      );
      const detail =
        reason === undefined
          ? ''
          : `${escapeHtml(reason.label)}<span class="code detail-line">刪除前狀態 ${escapeHtml(APPOINTMENT_STATUS_LABELS[event.previousStatus] ?? event.previousStatus ?? '未知')}</span>`;
      return `<tr role="row" class="audit-row" data-audit-row="${escapeHtml(event.appointmentId)}"><td role="cell" data-label="事件"><span class="event-dot" aria-hidden="true"></span><strong>${escapeHtml(auditLabels[event.action] ?? event.action)}</strong></td><td role="cell" data-label="對象"><span class="code">${escapeHtml(event.appointmentId)}</span></td><td role="cell" data-label="時間">${escapeHtml(formatDateTime(event.occurredAt))}</td><td role="cell" data-label="詳情">${detail}</td></tr>`;
    })
    .join('');
  const columns = ['事件', '對象', '時間', '詳情']
    .map((label) => `<th scope="col" role="columnheader">${label}</th>`)
    .join('');
  return `<table class="data-table audit-table" role="table"><caption>稽核事件，最新的在最前面</caption><thead role="rowgroup"><tr role="row">${columns}</tr></thead><tbody role="rowgroup">${rows}</tbody></table>`;
}

// 日曆投影工作的狀態呈現。這是**合成示範**：工作臺不真的呼叫 Google，
// 權威的重試／退避／死信邏輯在 apps/worker（Emulator 已驗證）。這裡只把
// 「操作者的死信補回入口」畫出來——列出工作、死信可一鍵重新排入。
const OUTBOX_STATUS = {
  pending: { label: '待同步', chip: 'is-reserved', dot: 'event-dot-neutral' },
  completed: { label: '已同步', chip: 'is-available', dot: '' },
  dead_letter: {
    label: '死信 · 需人工',
    chip: 'status-cancellation_requested',
    dot: 'event-dot-neutral'
  }
};

export function renderOutbox(state) {
  if (state.outboxJobs.length === 0)
    return '<li class="empty-event">尚無日曆投影意圖。</li>';
  return [...state.outboxJobs]
    .reverse()
    .map((job) => {
      const status = OUTBOX_STATUS[job.status] ?? OUTBOX_STATUS.pending;
      // 刪除沒有對應的預約狀態（那筆已經不存在），因此單獨命名。worker 對任何
      // 非 upsert 狀態都是 cancel，所以這筆走的是移除事件。
      const kind =
        job.followUpSourceId !== undefined
          ? job.appointmentStatus === 'follow_up_required'
            ? '建立／更新回診提醒'
            : '移除回診提醒'
          : job.appointmentStatus === 'deleted'
            ? '刪除紀錄並移除日曆事件'
            : (APPOINTMENT_STATUS_LABELS[job.appointmentStatus] ??
              job.appointmentStatus);
      const requeued = job.requeuedBy
        ? `<span class="code">已由 ${escapeHtml(job.requeuedBy)} 重新排入</span>`
        : '';
      const action =
        job.status === 'dead_letter'
          ? `<button class="button button-tertiary" type="button" data-outbox-requeue="${escapeHtml(job.id)}">重新排入</button>`
          : '';
      const error = job.lastError
        ? `<span class="code detail-line">${escapeHtml(job.lastError)}</span>`
        : '';
      return `<li class="outbox-row"><span class="event-dot ${status.dot}"></span><div><strong>${escapeHtml(kind)}</strong><span class="status-chip ${status.chip}">${status.label}</span><span class="code">${escapeHtml(job.appointmentId)}</span>${error}${requeued}</div>${action}</li>`;
    })
    .join('');
}
