import {
  APPOINTMENT_ACTIONS,
  APPOINTMENT_STATUS_LABELS,
  BOOKING_KIND_LABELS,
  BOOKING_NOTE_TAGS,
  DELETE_APPOINTMENT_REASONS,
  FOLLOW_UP_NOTE_TAGS,
  PERMISSIONS,
  WEEKDAY_LABELS
} from './constants.js';
import { maskNationalId } from './patient-registry.js';
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
  appointment_no_show: '標記未到',
  appointment_rescheduled: '改期',
  appointment_deleted: '刪除預約紀錄',
  follow_up_decided: '記錄回診決定',
  case_manager_assigned: '指派個管師',
  case_manager_reassigned: '改派個管師',
  schedule_published: '發布排班',
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
  return `${escapeHtml(record.phone)} · ${escapeHtml(record.birthDate)} · ${escapeHtml(maskNationalId(record.nationalId))} · 健保卡${record.hasNhiCard ? '已帶' : '未帶'}`;
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
      return appointment.status === 'confirmed';
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
      label: decided ? '查看回診' : '記錄回診',
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
  )
    .map(
      (action) =>
        `<button type="button"${action.id === 'delete' ? ' class="danger-text"' : ''} data-appointment-action="${escapeHtml(action.id)}" data-appointment-id="${escapeHtml(appointment.id)}">${escapeHtml(action.label)}</button>`
    )
    .join('');
  if (items === '') return '';
  return `<details class="action-menu"><summary><span class="action-menu-icon" aria-hidden="true">&#8942;</span><span>更多處置</span><span class="action-menu-chevron" aria-hidden="true">&#8964;</span></summary><div class="action-menu-list">${items}</div></details>`;
}
function managerLabel(state, id) {
  return state.caseManagers.find((item) => item.id === id)?.label ?? id;
}

function tagLabels(ids, catalogue) {
  return (ids ?? [])
    .map((id) => catalogue.find((tag) => tag.id === id)?.label)
    .filter((label) => label !== undefined);
}

export function renderTasks(state) {
  const tasks = [
    {
      count: state.tasks.cancellationRequests.length,
      title: '取消待確認',
      href: '#appointments-section',
      tone: 'danger'
    },
    {
      count: state.tasks.pendingFollowUps.length,
      title: '回診尚未決定',
      href: '#appointments-section',
      tone: 'warning'
    },
    {
      count: state.tasks.pendingCaseAssignments.length,
      title: '個管尚未指派',
      href: '#case-section',
      tone: 'warning'
    },
    {
      count: state.tasks.outboxPending,
      title: '日曆投影待處理',
      href: '#audit-section',
      tone: 'neutral'
    }
  ];
  return tasks
    .map(
      (task) =>
        `<a class="task-card task-${task.tone}" href="${task.href}"><strong>${task.count}</strong><span>${task.title}</span></a>`
    )
    .join('');
}

/**
 * 備註標籤的勾選清單。
 *
 * `scope` 決定送出方式：建立預約的表單以 `data-booking-tag` 由 bootstrap
 * 逐一讀取；卡片內的修改備註表單走原生 FormData，因此需要 `name`。
 */
export function renderTagPicker(selected = [], scope = 'booking') {
  const attribute =
    scope === 'notes'
      ? `name="noteTags" value="__ID__"`
      : `data-booking-tag="__ID__"`;
  return BOOKING_NOTE_TAGS.map(
    (tag) =>
      `<label class="tag-option"><input type="checkbox" ${attribute.replace('__ID__', escapeHtml(tag.id))} ${selected.includes(tag.id) ? 'checked' : ''} />${escapeHtml(tag.label)}</label>`
  ).join('');
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
    return emptyState('目前沒有可預約時段', '請先由管理者發布新的排班草稿。');

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
//   - 已完成到診 ＋ 不需要回診 → 排除（後續無動作）
//   - 其餘 → 一般（效期＝看診時間）
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
  if (appointment.status === 'completed' && decision?.status === 'not_required')
    return undefined;
  return {
    appointment,
    decision,
    mode: 'normal',
    effectiveStart: appointment.startsAt
  };
}

// 回診版卡片：已確認需要回診、尚未安排下次門診。主要時間顯示回診目標日
// （＝日曆上的回診日）。「調整回診」把該筆重新放回逐筆回診確認可再改決定。
function followUpQueueCard(state, entry, permissions) {
  const { appointment, decision, effectiveStart } = entry;
  const notes = tagLabels(decision.tags, FOLLOW_UP_NOTE_TAGS);
  if (decision.noteText) notes.push(decision.noteText);
  const noteRow =
    notes.length === 0
      ? ''
      : `<p class="note-row">${notes.map((note) => `<span class="note-chip">${escapeHtml(note)}</span>`).join('')}</p>`;
  // 缺 session 時（測試夾具、登入前）不顯示「調整回診」，而非拋錯。
  const adjust = permissions.includes(PERMISSIONS.MANAGE_FOLLOW_UP)
    ? `<button class="button appointment-primary-action appointment-follow-up-button" type="button" data-follow-up-edit="${escapeHtml(appointment.id)}"><span aria-hidden="true">&#8635;</span>調整回診</button>`
    : '';
  // 回診版卡片同樣要能刪除：誤建的紀錄卡在回診佇列時，管理者需要清得掉。
  // 這張卡的來源預約已是 completed，其餘處置本來就不適用，選單實際上只會
  // 留下刪除。
  return `<tr class="appointment-row follow-up-pending" data-appointment-card="${escapeHtml(appointment.id)}" data-follow-up-pending="${escapeHtml(appointment.id)}"><td data-label="時間"><span class="cell-date">${escapeHtml(formatFullDate(effectiveStart))}</span><strong class="cell-time">${escapeHtml(formatTime(effectiveStart))}</strong></td><td data-label="患者"><strong>${escapeHtml(patientLabel(state, appointment.patientId))}</strong>${detailRow(state, appointment.patientId)}</td><td data-label="掛號別"><span class="appointment-kind">回診</span></td><td data-label="療程">回診提醒已上日曆<span class="detail-line">來源 <span class="code">${escapeHtml(appointment.id)}</span></span></td><td data-label="狀態"><span class="status-chip is-reserved"><span class="status-icon" aria-hidden="true">&#8635;</span>待安排回診</span>${noteRow}</td><td data-label="處置"><div class="appointment-controls">${adjust}${actionMenu(appointment, undefined, permissions)}</div></td></tr>`;
}

export function renderAppointments(state, filters) {
  const query = filters.query.trim().toLocaleLowerCase('zh-Hant');
  const today = taipeiTodayDate();
  const entries = state.appointments
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
    // 一律依效期（回診版用回診日）由近到遠排序。
    .sort((left, right) =>
      String(left.effectiveStart).localeCompare(String(right.effectiveStart))
    );

  if (entries.length === 0)
    return emptyState(
      filters.status === 'today' ? '今日尚無預約' : '沒有符合條件的預約',
      filters.status === 'today'
        ? '合成資料多在未來日期；改看「全部狀態」即可瀏覽。'
        : '可調整篩選，或展開下方「建立新預約」。'
    );

  // session 可能還沒建立（測試夾具、登入前的初始畫面）。缺 session 時一律
  // 視為沒有任何權限：隱藏管理控制項，而不是整個清單拋錯。
  const permissions = state.session?.permissions ?? [];
  const canManageFollowUp = permissions.includes(PERMISSIONS.MANAGE_FOLLOW_UP);
  const rows = entries
    .map((entry) => {
      if (entry.mode === 'followup')
        return followUpQueueCard(state, entry, permissions);
      const appointment = entry.appointment;
      const notes = tagLabels(appointment.noteTags, BOOKING_NOTE_TAGS);
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
          : `<tr class="appointment-forms" data-appointment-forms="${escapeHtml(appointment.id)}"><td colspan="6">${rescheduleForm}${notesForm}</td></tr>`;
      return `<tr class="appointment-row" data-appointment-card="${escapeHtml(appointment.id)}"><td data-label="時間"><span class="cell-date">${escapeHtml(formatFullDate(appointment.startsAt))}</span><strong class="cell-time">${escapeHtml(formatTime(appointment.startsAt))}</strong></td><td data-label="患者"><strong>${escapeHtml(patientLabel(state, appointment.patientId))}</strong>${detailRow(state, appointment.patientId)}</td><td data-label="掛號別"><span class="appointment-kind">${escapeHtml(BOOKING_KIND_LABELS[appointment.bookingKind] ?? '')}</span></td><td data-label="療程">${escapeHtml(appointment.itemLabel ?? '')}<span class="detail-line"><span class="code">${escapeHtml(appointment.id)}</span></span></td><td data-label="狀態"><span class="status-chip status-${escapeHtml(appointment.status)}"><span class="status-icon" aria-hidden="true">${statusIcons[appointment.status] ?? ''}</span>${escapeHtml(APPOINTMENT_STATUS_LABELS[appointment.status] ?? appointment.status)}</span>${noteRow}</td><td data-label="處置"><div class="appointment-controls">${primary.html}${notesControl}${actionMenu(appointment, primary.id, permissions)}</div></td></tr>${forms}`;
    })
    .join('');

  // 真正的表格，不是一疊卡片。櫃台在這裡做的事是掃描與比對——同一欄的時間、
  // 姓名與狀態要能垂直對齊才快；卡片把每一筆都包成一個獨立區塊，一屏看得到的
  // 筆數少，欄位也對不齊。
  //
  // `<caption>` 給螢幕閱讀器交代這張表是什麼；視覺上的標題已經在表格外面，
  // 所以它只在無障礙樹裡存在。
  return `<table class="data-table appointment-table"><caption>櫃台處理清單，依時間由近到遠排序</caption><thead><tr><th scope="col">時間</th><th scope="col">患者</th><th scope="col">掛號別</th><th scope="col">療程</th><th scope="col">狀態</th><th scope="col">處置</th></tr></thead><tbody>${rows}</tbody></table>`;
}

export function renderSchedule(schedule, editable) {
  const weekly =
    schedule.weeklyAvailability
      .flatMap((entry) =>
        entry.intervals.map(
          (interval, index) =>
            `<li><strong>${WEEKDAY_LABELS[entry.weekday]}</strong><span>${escapeHtml(interval.startLocalTime)}–${escapeHtml(interval.endLocalTime)}</span>${editable ? `<button class="text-button danger-text" type="button" data-remove-weekly="${entry.weekday}:${index}">刪除時段</button>` : ''}</li>`
        )
      )
      .join('') || '<li>尚未設定每週時段。</li>';
  const exceptions =
    schedule.dateExceptions
      .map(
        (entry) =>
          `<li><strong>${escapeHtml(entry.date)}</strong><span>${entry.kind === 'closed' ? '休診' : `加開 ${entry.intervals.map((item) => `${escapeHtml(item.startLocalTime)}–${escapeHtml(item.endLocalTime)}`).join('、')}`}</span>${editable ? `<button class="text-button danger-text" type="button" data-remove-exception="${escapeHtml(entry.date)}">刪除例外</button>` : ''}</li>`
      )
      .join('') || '<li>尚無日期例外。</li>';
  const blocked = schedule.blockedTimes ?? { initial: [], follow_up: [] };
  return `<div class="schedule-display"><p class="code">TIME ZONE · ${escapeHtml(schedule.timeZone)}</p><div><h4>每週時段</h4><ul>${weekly}</ul></div><div><h4>日期例外</h4><ul>${exceptions}</ul></div><div><h4>固定不開放</h4><ul><li><strong>初診</strong><span>${escapeHtml((blocked.initial ?? []).join('、') || '無')}</span></li><li><strong>回診</strong><span>${escapeHtml((blocked.follow_up ?? []).join('、') || '無')}</span></li></ul></div></div>`;
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
      const dueDate = decision?.dueDate ?? firstFollowUpDate ?? '2030-01-16';
      const dueTimes = followUpDueTimes(state.schedule, dueDate);
      const dueTimeOptions = dueTimes.length
        ? dueTimes
            .map(
              (time) =>
                `<option value="${escapeHtml(time)}" ${decision?.dueTime === time ? 'selected' : ''}>${escapeHtml(time)}</option>`
            )
            .join('')
        : '<option value="">當天未營業</option>';
      // 個管指派在這裡是「順手做完」的捷徑，與「個案管理」分頁用的是同一個
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
      const managerField = `<label>個案管理師<select name="managerId"><option value="">${assignment ? '維持目前指派' : '暫不指派'}</option>${managerOptions}</select><span class="field-hint">${assignment ? `目前：${escapeHtml(managerLabel(state, assignment.managerId))}` : '完成到診後可在此或「個案管理」分頁指派'}</span></label>`;
      return `<form class="decision-card" data-follow-up-form="${escapeHtml(appointment.id)}"><div><span class="status-chip ${decision ? 'is-available' : 'is-reserved'}">${decision ? (decision.status === 'required' ? '需要回診' : '目前無需回診') : '待確認'}</span><strong>${escapeHtml(patientLabel(state, appointment.patientId))}</strong><span class="code">${escapeHtml(appointment.id)} · ${escapeHtml(appointment.itemLabel ?? '')}</span></div><label>決定<select name="status"><option value="required" ${decision?.status === 'required' ? 'selected' : ''}>需要回診</option><option value="not_required" ${decision?.status === 'not_required' ? 'selected' : ''}>目前無需回診</option></select></label><label>目標日期<input name="dueDate" type="date" value="${escapeHtml(dueDate)}"></label><label>目標時間<select name="dueTime">${dueTimeOptions}</select></label>${managerField}<fieldset class="tag-picker"><legend>回診項目（可複選）</legend>${tags}</fieldset><label>自填備註<input name="noteText" type="text" maxlength="120" value="${escapeHtml(decision?.noteText ?? '')}"></label><label>診斷書份數<input name="certificateCopies" type="number" min="0" max="10" value="${escapeHtml(String(decision?.certificateCopies ?? 0))}"></label><button class="button button-primary" type="submit">儲存逐筆決定</button></form>`;
    })
    .join('');
}

export function renderCaseAssignments(state) {
  const completed = state.appointments.filter(
    (item) => item.status === 'completed'
  );
  if (completed.length === 0)
    return emptyState('尚無待指派個案', '完成到診後才會出現個管指派工作。');
  return completed
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
      return `<form class="decision-card" data-case-form="${escapeHtml(appointment.id)}"><div><span class="status-chip ${assignment ? 'is-available' : 'is-reserved'}">${assignment ? '已指派' : '待指派'}</span><strong>${escapeHtml(patientLabel(state, appointment.patientId))}</strong><span class="code">${escapeHtml(appointment.id)}</span></div><label>個案管理師<select name="managerId">${managers}</select></label><button class="button button-primary" type="submit">${assignment ? '改派個管師' : '指派個管師'}</button></form>`;
    })
    .join('');
}

export function renderWorkload(state) {
  if (state.workload.length === 0)
    return emptyState('尚無月度工作量', '完成到診並指派個管師後才會產生統計。');
  return state.workload
    .map(
      (entry) =>
        `<article class="workload-card"><div class="workload-overview"><p class="code">${escapeHtml(managerLabel(state, entry.managerId))} · ${escapeHtml(entry.payrollPeriod)}</p><strong>${entry.uniquePatientCount} <span>位不重複患者</span></strong><p>${entry.visitCount} 次完成到診 · ${entry.creditCount} 筆 credit</p></div><ul class="workload-breakdown"><li><span>completed_unique_patient / synthetic-v1</span><strong>${entry.uniquePatientCount} 位</strong></li></ul></article>`
    )
    .join('');
}

export function renderAccounts(workspace) {
  return workspace.accounts
    .map(
      (account) =>
        `<article class="account-row"><div><strong>${escapeHtml(account.label)}</strong><span class="code">${escapeHtml(account.id)}</span></div><span class="status-chip ${account.status === 'active' ? 'is-available' : 'is-reserved'}">${account.status === 'active' ? '啟用' : '停用'}</span><span>${escapeHtml(roleLabel(account.role))}</span><button class="button button-tertiary" type="button" data-account-toggle="${escapeHtml(account.id)}">${account.status === 'active' ? '停用' : '恢復'}</button></article>`
    )
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
  return events.length
    ? [...events]
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
              : `<span class="code detail-line">${escapeHtml(reason.label)}<span aria-hidden="true">·</span>刪除前狀態 ${escapeHtml(APPOINTMENT_STATUS_LABELS[event.previousStatus] ?? event.previousStatus ?? '未知')}</span>`;
          return `<li><span class="event-dot"></span><div><strong>${escapeHtml(auditLabels[event.action] ?? event.action)}</strong><span>${escapeHtml(event.appointmentId)} · ${escapeHtml(formatDateTime(event.occurredAt))}</span>${detail}</div></li>`;
        })
        .join('')
    : '<li class="empty-event">尚無符合條件的稽核事件。</li>';
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
