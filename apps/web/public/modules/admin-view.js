import {
  APPOINTMENT_ACTIONS,
  APPOINTMENT_STATUS_LABELS,
  BOOKING_KIND_LABELS,
  BOOKING_NOTE_TAGS,
  FOLLOW_UP_NOTE_TAGS,
  WEEKDAY_LABELS
} from './constants.js';
import { maskNationalId } from './patient-registry.js';
import { followUpDueTimes } from './schedule-engine.js';
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
  'appointment_rescheduled'
]);

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
    default:
      return active;
  }
}

function actionMenu(appointment, decided) {
  const items = APPOINTMENT_ACTIONS.map((action) => {
    const suffix =
      action.id === 'follow_up_confirm' && decided ? '（已記錄）' : '';
    return `<button type="button" data-appointment-action="${escapeHtml(action.id)}" data-appointment-id="${escapeHtml(appointment.id)}" ${actionEnabled(action.id, appointment) ? '' : 'disabled'}>${escapeHtml(action.label)}${suffix}</button>`;
  }).join('');
  return `<details class="action-menu"><summary>處置</summary><div class="action-menu-list">${items}</div></details>`;
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
    (slot) => slot.reservationId === undefined && slot.kind === kind
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
        slot.kind === appointment.bookingKind
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

export function renderAppointments(state, filters) {
  const list = state.appointments.filter(
    (item) =>
      (filters.status === 'all' || item.status === filters.status) &&
      (filters.kind === 'all' || item.bookingKind === filters.kind) &&
      (filters.patientId === 'all' || item.patientId === filters.patientId)
  );
  if (list.length === 0)
    return emptyState('沒有符合條件的預約', '可調整篩選或從上方建立預約。');

  // state.appointments 已由 store 依看診時間排序（越接近現在越前面）。
  return list
    .map((appointment) => {
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
        ? `<button class="text-button" type="button" data-notes-toggle="${escapeHtml(appointment.id)}" aria-expanded="false">修改備註</button>`
        : '';
      const notesForm = editable
        ? `<form class="notes-form" data-notes-form="${escapeHtml(appointment.id)}" hidden><fieldset class="tag-picker"><legend>備註（可複選）</legend>${renderTagPicker(appointment.noteTags ?? [], 'notes')}</fieldset><label>自填備註<input name="noteText" type="text" maxlength="120" value="${escapeHtml(appointment.noteText ?? '')}"></label><div class="notes-form-actions"><button class="button button-primary" type="submit">儲存備註</button><button class="text-button" type="button" data-notes-cancel="${escapeHtml(appointment.id)}">取消</button></div></form>`
        : '';
      return `<article class="appointment-card"><div class="appointment-main"><span class="status-chip status-${escapeHtml(appointment.status)}">${escapeHtml(APPOINTMENT_STATUS_LABELS[appointment.status] ?? appointment.status)}</span><div><strong>${escapeHtml(patientLabel(state, appointment.patientId))}</strong><p>${escapeHtml(formatFullDate(appointment.startsAt))} ${escapeHtml(formatTime(appointment.startsAt))}</p><span class="code detail-line">${escapeHtml(BOOKING_KIND_LABELS[appointment.bookingKind] ?? '')} · ${escapeHtml(appointment.itemLabel ?? '')} · ${escapeHtml(appointment.id)}</span>${detailRow(state, appointment.patientId)}${noteRow}</div></div><div class="appointment-controls">${notesControl}${actionMenu(appointment, decided)}</div>${rescheduleForm}${notesForm}</article>`;
    })
    .join('');
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

export function renderFollowUps(state) {
  const completed = state.appointments.filter(
    (item) => item.status === 'completed'
  );
  if (completed.length === 0)
    return emptyState(
      '尚無可判斷的到診紀錄',
      '櫃台完成到診後，管理者才會在此逐筆確認。'
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
        .map(
          (event) =>
            `<li><span class="event-dot"></span><div><strong>${escapeHtml(auditLabels[event.action] ?? event.action)}</strong><span>${escapeHtml(event.appointmentId)} · ${escapeHtml(formatDateTime(event.occurredAt))}</span></div></li>`
        )
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
      const kind =
        APPOINTMENT_STATUS_LABELS[job.appointmentStatus] ??
        job.appointmentStatus;
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
