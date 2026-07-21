import { WEEKDAY_LABELS } from './constants.js';
import {
  emptyState,
  escapeHtml,
  formatDateTime,
  formatFullDate,
  formatTime,
  roleLabel
} from './ui-format.js';
const appointmentLabels = {
  confirmed: '預約成立',
  cancellation_requested: '取消待確認',
  cancelled: '已取消',
  completed: '已完成到診'
};
const auditLabels = {
  appointment_confirmed: '建立預約',
  cancellation_requested: '提出取消',
  appointment_cancelled: '確認取消',
  appointment_completed: '完成到診',
  follow_up_decided: '記錄回診決定',
  case_manager_assigned: '指派個管師',
  case_manager_reassigned: '改派個管師',
  schedule_published: '發布排班',
  account_created: '建立帳號',
  account_status_changed: '變更帳號狀態',
  announcement_saved: '儲存公告',
  maintenance_saved: '儲存維護設定',
  release_recorded: '新增發布紀錄'
};
function patientLabel(state, id) {
  return state.patients.find((item) => item.id === id)?.label ?? id;
}
function managerLabel(state, id) {
  return state.caseManagers.find((item) => item.id === id)?.label ?? id;
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
      href: '#follow-up-section',
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
export function renderSlots(state, patientId) {
  const slots = state.slots
    .filter((slot) => slot.reservationId === undefined)
    .slice(0, 18);
  return slots.length === 0
    ? emptyState('目前沒有可預約時段', '請先由管理者發布新的排班草稿。')
    : slots
        .map(
          (slot) =>
            `<article class="slot-card"><div class="slot-card-heading"><span class="slot-date">${escapeHtml(formatFullDate(slot.startsAt))}</span><span class="status-chip is-available">可預約</span></div><p class="slot-time">${escapeHtml(formatTime(slot.startsAt))}–${escapeHtml(formatTime(slot.endsAt))}</p><p class="slot-description">${escapeHtml(patientLabel(state, patientId))} · 合成諮詢</p><button class="button button-primary" type="button" data-reserve-slot="${escapeHtml(slot.id)}">建立合成預約</button></article>`
        )
        .join('');
}
export function renderAppointments(state, filters) {
  const list = state.appointments.filter(
    (item) =>
      (filters.status === 'all' || item.status === filters.status) &&
      (filters.patientId === 'all' || item.patientId === filters.patientId)
  );
  if (list.length === 0)
    return emptyState('沒有符合條件的預約', '可調整篩選或從上方建立合成預約。');
  return [...list]
    .reverse()
    .map((appointment) => {
      const slot = state.slots.find((item) => item.id === appointment.slotId);
      const canComplete = appointment.status === 'confirmed';
      const canCancel = ['confirmed', 'cancellation_requested'].includes(
        appointment.status
      );
      return `<article class="appointment-card"><div class="appointment-main"><span class="status-chip status-${escapeHtml(appointment.status)}">${escapeHtml(appointmentLabels[appointment.status] ?? appointment.status)}</span><div><strong>${escapeHtml(patientLabel(state, appointment.patientId))}</strong><p>${slot ? `${escapeHtml(formatFullDate(slot.startsAt))} ${escapeHtml(formatTime(slot.startsAt))}` : escapeHtml(appointment.slotId)}</p><span class="code">${escapeHtml(appointment.id)} · ${appointment.bookingType === 'follow_up' ? '回診' : '初次諮詢'}</span></div></div><div class="actions"><button class="button button-tertiary" type="button" data-appointment-action="cancel" data-appointment-id="${escapeHtml(appointment.id)}" ${canCancel ? '' : 'disabled'}>${appointment.status === 'cancellation_requested' ? '確認取消' : '櫃台取消'}</button><button class="button button-primary" type="button" data-appointment-action="complete" data-appointment-id="${escapeHtml(appointment.id)}" ${canComplete ? '' : 'disabled'}>完成到診</button></div></article>`;
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
  return `<div class="schedule-display"><p class="code">TIME ZONE · ${escapeHtml(schedule.timeZone)}</p><div><h4>每週時段</h4><ul>${weekly}</ul></div><div><h4>日期例外</h4><ul>${exceptions}</ul></div></div>`;
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
  return [...completed]
    .reverse()
    .map((appointment) => {
      const decision = state.followUps.find(
        (item) => item.appointmentId === appointment.id
      );
      return `<form class="decision-card" data-follow-up-form="${escapeHtml(appointment.id)}"><div><span class="status-chip ${decision ? 'is-available' : 'is-reserved'}">${decision ? (decision.status === 'required' ? '需要回診' : '目前無需回診') : '待確認'}</span><strong>${escapeHtml(patientLabel(state, appointment.patientId))}</strong><span class="code">${escapeHtml(appointment.id)}</span></div><label>決定<select name="status"><option value="required" ${decision?.status === 'required' ? 'selected' : ''}>需要回診</option><option value="not_required" ${decision?.status === 'not_required' ? 'selected' : ''}>目前無需回診</option></select></label><label>目標日期<input name="dueDate" type="date" value="${escapeHtml(decision?.dueDate ?? '2030-01-15')}"></label><button class="button button-primary" type="submit">儲存逐筆決定</button></form>`;
    })
    .join('');
}
export function renderCaseAssignments(state) {
  const completed = state.appointments.filter(
    (item) => item.status === 'completed'
  );
  if (completed.length === 0)
    return emptyState('尚無待指派個案', '完成到診後才會出現個管指派工作。');
  return [...completed]
    .reverse()
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
        `<article class="workload-card"><div class="workload-overview"><p class="code">${escapeHtml(managerLabel(state, entry.managerId))} · ${escapeHtml(entry.payrollPeriod)}</p><strong>${entry.uniquePatientCount} <span>位不重複患者</span></strong><p>${entry.visitCount} 次完成到診 · ${entry.creditCount} 筆合成 credit</p></div><ul class="workload-breakdown"><li><span>completed_unique_patient / synthetic-v1</span><strong>${entry.uniquePatientCount} 位</strong></li></ul></article>`
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
    if (filter === 'appointment')
      return [
        'appointment_confirmed',
        'cancellation_requested',
        'appointment_cancelled',
        'appointment_completed'
      ].includes(event.action);
    if (filter === 'schedule') return event.action === 'schedule_published';
    return ![
      'appointment_confirmed',
      'cancellation_requested',
      'appointment_cancelled',
      'appointment_completed',
      'schedule_published'
    ].includes(event.action);
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
export function renderOutbox(state) {
  return state.outboxJobs.length
    ? [...state.outboxJobs]
        .reverse()
        .map(
          (job) =>
            `<li><span class="event-dot event-dot-neutral"></span><div><strong>${escapeHtml(appointmentLabels[job.appointmentStatus] ?? job.appointmentStatus)}</strong><span>${escapeHtml(job.appointmentId)} · 合成投影待處理</span></div></li>`
        )
        .join('')
    : '<li class="empty-event">尚無日曆投影意圖。</li>';
}
