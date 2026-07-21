import { stagingRequest } from './staging-store.js';

const apiBaseUrl = 'http://127.0.0.1:3000/v1/test-only';
const isOnlineSyntheticPreview = !['127.0.0.1', 'localhost'].includes(window.location.hostname);

const elements = {
  accountForm: document.querySelector('#account-form'),
  accountLabel: document.querySelector('#account-label'),
  accountList: document.querySelector('#account-list'),
  accountRole: document.querySelector('#account-role'),
  announcementBody: document.querySelector('#announcement-body'),
  announcementForm: document.querySelector('#announcement-form'),
  announcementStatus: document.querySelector('#announcement-status'),
  announcementTitle: document.querySelector('#announcement-title'),
  appointments: document.querySelector('#appointments'),
  auditEvents: document.querySelector('#audit-events'),
  availableCount: document.querySelector('#available-count'),
  completedCount: document.querySelector('#completed-count'),
  confirmedCount: document.querySelector('#confirmed-count'),
  currentRoleCard: document.querySelector('#current-role-card'),
  dateExceptionForm: document.querySelector('#date-exception-form'),
  exceptionDate: document.querySelector('#exception-date'),
  exceptionEnd: document.querySelector('#exception-end'),
  exceptionKind: document.querySelector('#exception-kind'),
  exceptionStart: document.querySelector('#exception-start'),
  followUp: document.querySelector('#follow-up'),
  followUpDate: document.querySelector('#follow-up-date'),
  followUpForm: document.querySelector('#follow-up-form'),
  followUpStatus: document.querySelector('#follow-up-status'),
  mainContent: document.querySelector('#main-content'),
  maintenanceBody: document.querySelector('#maintenance-body'),
  maintenanceEnabled: document.querySelector('#maintenance-enabled'),
  maintenanceForm: document.querySelector('#maintenance-form'),
  maintenanceResumeAt: document.querySelector('#maintenance-resume-at'),
  maintenanceTitle: document.querySelector('#maintenance-title'),
  operationsAnnouncement: document.querySelector('#operations-announcement'),
  outboxJobs: document.querySelector('#outbox-jobs'),
  policyVersion: document.querySelector('#policy-version'),
  releaseForm: document.querySelector('#release-form'),
  releaseList: document.querySelector('#release-list'),
  releaseSummary: document.querySelector('#release-summary'),
  releaseVersion: document.querySelector('#release-version'),
  resetButton: document.querySelector('#reset-button'),
  scheduleSummary: document.querySelector('#schedule-summary'),
  skipLink: document.querySelector('.skip-link'),
  slots: document.querySelector('#slots'),
  statusMessage: document.querySelector('#status-message'),
  weekdayCheckboxes: [...document.querySelectorAll('.weekday-picker input[type="checkbox"]')],
  weeklyEnd: document.querySelector('#weekly-end'),
  weeklyScheduleForm: document.querySelector('#weekly-schedule-form'),
  weeklyStart: document.querySelector('#weekly-start'),
  workload: document.querySelector('#workload'),
  workloadPatientCount: document.querySelector('#workload-patient-count'),
  workspaceRole: document.querySelector('#workspace-role')
};

let currentSchedule;
let currentWorkspace;

const appointmentLabels = {
  cancellation_requested: '已提出取消',
  completed: '已完成到診',
  confirmed: '待處理'
};

const auditLabels = {
  appointment_completed: '完成到診',
  appointment_confirmed: '建立預約',
  cancellation_requested: '提出取消'
};

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatSlotDate(value) {
  return new Intl.DateTimeFormat('zh-TW', {
    day: 'numeric',
    month: 'long',
    weekday: 'short',
    timeZone: 'Asia/Taipei'
  }).format(new Date(value));
}

function formatSlotTime(value) {
  return new Intl.DateTimeFormat('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Taipei'
  }).format(new Date(value));
}

function formatTime(value) {
  return new Intl.DateTimeFormat('zh-TW', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Taipei'
  }).format(new Date(value));
}

function showStatus(message, state = 'info') {
  elements.statusMessage.textContent = message;
  elements.statusMessage.dataset.state = state;
}

async function request(path, options = {}) {
  if (isOnlineSyntheticPreview) return stagingRequest(path, options);
  const requestOptions = {
    headers: { 'Content-Type': 'application/json' },
    ...options
  };
  if (requestOptions.method === 'POST' && requestOptions.body === undefined) {
    requestOptions.body = '{}';
  }

  const response = await fetch(`${apiBaseUrl}${path}`, requestOptions);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.message ?? `測試 API 回應 ${response.status}`);
  }
  return body;
}

async function workspaceRequest(path, body) {
  return stagingRequest(path, {
    method: body === undefined ? 'GET' : 'POST',
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
}

if (isOnlineSyntheticPreview) {
  document.querySelector('.environment-badge').lastChild.textContent = 'ONLINE SYNTHETIC PREVIEW';
  document.querySelector('.hero-facts li:last-child').textContent = 'Firebase Hosting 暫時預覽；網址持有人皆可存取';
  document.querySelector('.app-footer span:first-child').textContent = '一森渼診所 · 線上合成預覽';
}

function render(snapshot) {
  const appointments = snapshot.appointments ?? [];
  const slots = snapshot.slots ?? [];
  const workload = snapshot.workload ?? [];

  elements.policyVersion.textContent = `${snapshot.policyVersion}／${snapshot.serviceId}`;
  renderSummary(slots, appointments, workload);
  renderSlots(slots);
  renderAppointments(appointments);
  renderWorkload(workload);
  renderFollowUp(snapshot.followUp ?? { status: 'unknown' });
  currentSchedule = snapshot.schedule;
  renderSchedule(snapshot.schedule);
  renderAuditEvents(snapshot.auditEvents ?? []);
  renderOutboxJobs(snapshot.outboxJobs ?? []);
}

function renderWorkspace(workspace) {
  currentWorkspace = workspace;
  const isAdmin = workspace.currentRole === 'admin';
  elements.workspaceRole.value = workspace.currentRole;
  elements.currentRoleCard.textContent = isAdmin
    ? '管理者 · 可設定與治理'
    : '櫃台員工 · 日常預約作業';
  document.querySelectorAll('[data-admin-only]').forEach((node) => {
    node.hidden = !isAdmin;
  });

  const announcement = workspace.announcement;
  elements.operationsAnnouncement.hidden = announcement.status !== 'published';
  elements.operationsAnnouncement.innerHTML = announcement.status === 'published'
    ? `<strong>${escapeHtml(announcement.title)}</strong><span>${escapeHtml(announcement.body)}</span>`
    : '';
  elements.announcementStatus.value = announcement.status;
  elements.announcementTitle.value = announcement.title;
  elements.announcementBody.value = announcement.body;

  const maintenance = workspace.maintenance;
  elements.maintenanceEnabled.checked = maintenance.enabled;
  elements.maintenanceTitle.value = maintenance.title;
  elements.maintenanceBody.value = maintenance.body;
  elements.maintenanceResumeAt.value = maintenance.resumeAt;

  elements.accountList.innerHTML = workspace.accounts.map((account) => `
    <article class="account-row">
      <div><strong>${escapeHtml(account.label)}</strong><span class="code">${escapeHtml(account.id)}</span></div>
      <span class="status-chip ${account.status === 'active' ? 'is-available' : 'is-reserved'}">${account.status === 'active' ? '啟用' : '停用'}</span>
      <span>${account.role === 'admin' ? '管理者' : '櫃台員工'}</span>
      <button class="button button-tertiary" type="button" data-account-toggle="${escapeHtml(account.id)}">${account.status === 'active' ? '停用' : '恢復'}</button>
    </article>`).join('');

  elements.releaseList.innerHTML = workspace.releases.map((release) => `
    <article class="release-row">
      <span class="status-chip status-completed">${escapeHtml(release.version)}</span>
      <div><strong>${escapeHtml(release.summary)}</strong><span>${escapeHtml(formatTime(release.publishedAt))}</span></div>
    </article>`).join('');
  renderSchedule(currentSchedule);
}

function renderSchedule(schedule) {
  if (schedule === undefined) return;
  const labels = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
  const canEdit = currentWorkspace?.currentRole === 'admin';
  const weekly = schedule.weeklyAvailability.flatMap((entry) =>
    entry.intervals.map((item, intervalIndex) =>
      `<li><strong>${labels[entry.weekday]}</strong><span>${escapeHtml(item.startLocalTime)}–${escapeHtml(item.endLocalTime)}</span>${canEdit ? `<button class="icon-button" type="button" aria-label="刪除 ${labels[entry.weekday]} ${escapeHtml(item.startLocalTime)} 到 ${escapeHtml(item.endLocalTime)}" data-schedule-remove="${entry.weekday}:${intervalIndex}">×</button>` : ''}</li>`
    )
  ).join('') || '<li>尚未設定每週開放時段。</li>';
  const exceptions = schedule.dateExceptions.map((entry) => {
    const text = entry.kind === 'closed' ? '休診' : `加開 ${entry.intervals.map((item) => `${escapeHtml(item.startLocalTime)}–${escapeHtml(item.endLocalTime)}`).join('、')}`;
    return `<li><strong>${escapeHtml(entry.date)}</strong><span>${text}</span>${canEdit ? `<button class="icon-button" type="button" aria-label="刪除 ${escapeHtml(entry.date)} 日期例外" data-exception-remove="${escapeHtml(entry.date)}">×</button>` : ''}</li>`;
  }).join('') || '<li>尚無日期例外。</li>';
  elements.scheduleSummary.innerHTML = `<article class="schedule-display"><p class="code">TIME ZONE · ${escapeHtml(schedule.timeZone)}</p><div><h3>每週開放</h3><ul>${weekly}</ul></div><div><h3>日期例外</h3><ul>${exceptions}</ul></div></article>`;
}

async function saveSchedule(schedule, message) {
  render(await request('/schedule', { method: 'POST', body: JSON.stringify(schedule) }));
  showStatus(message, 'success');
}

function renderFollowUp(followUp) {
  const labels = {
    unknown: '尚未確認是否需回診',
    not_required: '已確認目前無需回診',
    required: '已確認需要回診'
  };
  const detail = followUp.status === 'required'
    ? `合成目標日期：${escapeHtml(followUp.dueDate ?? '未設定')}`
    : '必須由醫師或授權人員明確決定；不可由系統自動判斷。';
  elements.followUp.innerHTML = `
    <article class="workload-card follow-up-card">
      <div class="workload-overview">
        <p class="code">SYNTHETIC FOLLOW-UP DECISION</p>
        <strong>${escapeHtml(labels[followUp.status] ?? '未知狀態')}</strong>
        <p>${detail}</p>
      </div>
      <p class="follow-up-boundary">患者端只能讀取已確認的結果與可用時段；正式患者登入、個資存取、改期與通知均尚未啟用。</p>
    </article>`;
}

function renderSummary(slots, appointments, workload) {
  elements.availableCount.textContent = String(
    slots.filter((slot) => slot.reservationId === undefined).length
  );
  elements.confirmedCount.textContent = String(
    appointments.filter((appointment) => appointment.status === 'confirmed').length
  );
  elements.completedCount.textContent = String(
    appointments.filter((appointment) => appointment.status === 'completed').length
  );
  elements.workloadPatientCount.textContent = String(
    workload.reduce((total, entry) => total + entry.uniquePatientCount, 0)
  );
}

function renderSlots(slots) {
  elements.slots.innerHTML = slots
    .map((slot) => {
      const reserved = slot.reservationId !== undefined;
      const stateClass = reserved ? 'is-reserved' : 'is-available';
      const stateLabel = reserved ? '已佔用' : '可預約';
      return `
        <article class="slot-card ${stateClass}">
          <div class="slot-card-heading">
            <span class="slot-date">${escapeHtml(formatSlotDate(slot.startsAt))}</span>
            <span class="status-chip ${stateClass}">${stateLabel}</span>
          </div>
          <p class="slot-time">${escapeHtml(formatSlotTime(slot.startsAt))} – ${escapeHtml(formatSlotTime(slot.endsAt))}</p>
          <p class="slot-description">測試諮詢 · 合成流程驗證</p>
          <button
            class="button button-primary slot-action"
            type="button"
            data-action="reserve"
            data-slot-id="${escapeHtml(slot.id)}"
            ${reserved ? 'disabled' : ''}
          >
            ${reserved ? '此時段已佔用' : '建立合成預約'}
          </button>
        </article>`;
    })
    .join('');
}

function renderAppointments(appointments) {
  elements.appointments.innerHTML = appointments.length
    ? appointments
        .map((appointment) => {
          const isConfirmed = appointment.status === 'confirmed';
          const label = appointmentLabels[appointment.status] ?? appointment.status;
          return `
            <article class="appointment-card">
              <div class="appointment-main">
                <span class="status-chip status-${escapeHtml(appointment.status)}">${escapeHtml(label)}</span>
                <div>
                  <p class="code">${escapeHtml(appointment.id)}</p>
                  <p class="appointment-meta">${escapeHtml(appointment.slotId)} · 已最小化顯示</p>
                </div>
              </div>
              <div class="actions" aria-label="合成預約測試動作">
                <button
                  class="button button-tertiary"
                  type="button"
                  data-action="cancel"
                  data-appointment-id="${escapeHtml(appointment.id)}"
                  ${isConfirmed ? '' : 'disabled'}
                >病患取消</button>
                <button
                  class="button button-primary"
                  type="button"
                  data-action="complete"
                  data-appointment-id="${escapeHtml(appointment.id)}"
                  ${isConfirmed ? '' : 'disabled'}
                >櫃檯完成到診</button>
              </div>
            </article>`;
        })
        .join('')
    : emptyState('尚無合成預約', '建立時段後，可在此測試取消與完成到診。');
}

function renderWorkload(workload) {
  elements.workload.innerHTML = workload.length
    ? workload
        .map(
          (entry) => `
            <article class="workload-card">
              <div class="workload-overview">
                <p class="code">${escapeHtml(entry.managerId)} · ${escapeHtml(entry.payrollPeriod)}</p>
                <strong>${entry.uniquePatientCount} <span>位不重複患者</span></strong>
                <p>${entry.creditCount} 筆合成 credit；不代表薪資金額。</p>
              </div>
              <ul class="workload-breakdown" aria-label="規則版本明細">
                ${entry.ruleBreakdown
                  .map(
                    (breakdown) => `
                      <li>
                        <span>${escapeHtml(breakdown.metricCode)} / ${escapeHtml(breakdown.ruleVersion)}</span>
                        <strong>${breakdown.uniquePatientCount} 位 · ${breakdown.creditCount} 筆</strong>
                      </li>`
                  )
                  .join('')}
              </ul>
            </article>`
        )
        .join('')
    : emptyState('尚無月度工作量', '完成到診後，才會產生不重複患者的合成統計。');
}

function renderAuditEvents(events) {
  elements.auditEvents.innerHTML = events.length
    ? events
        .map(
          (event) => `
            <li>
              <span class="event-dot" aria-hidden="true"></span>
              <div>
                <strong>${escapeHtml(auditLabels[event.action] ?? event.action)}</strong>
                <span>${escapeHtml(event.appointmentId)} · ${escapeHtml(formatTime(event.occurredAt))}</span>
              </div>
            </li>`
        )
        .join('')
    : '<li class="empty-event">尚無合成稽核事件。</li>';
}

function renderOutboxJobs(jobs) {
  elements.outboxJobs.innerHTML = jobs.length
    ? jobs
        .map(
          (job) => `
            <li>
              <span class="event-dot event-dot-neutral" aria-hidden="true"></span>
              <div>
                <strong>${escapeHtml(appointmentLabels[job.appointmentStatus] ?? job.appointmentStatus)}</strong>
                <span>${escapeHtml(job.appointmentId)} · 僅建立本機投影意圖</span>
              </div>
            </li>`
        )
        .join('')
    : '<li class="empty-event">尚無 outbox 投影意圖。</li>';
}

function emptyState(title, description) {
  return `
    <div class="empty-state">
      <span class="empty-state-icon" aria-hidden="true">○</span>
      <div>
        <strong>${title}</strong>
        <p>${description}</p>
      </div>
    </div>`;
}

async function refresh({ announce = true } = {}) {
  const [snapshot, workspace] = await Promise.all([
    request('/state'),
    workspaceRequest('/workspace')
  ]);
  render(snapshot);
  renderWorkspace(workspace);
  if (announce) {
    showStatus('測試環境已就緒。所有顯示內容皆為合成資料。', 'info');
  }
}

async function handleAction(event) {
  const button = event.target.closest('button[data-action]');
  if (button === null) return;

  button.disabled = true;
  try {
    if (button.dataset.action === 'reserve') {
      render(
        await request('/bookings', {
          method: 'POST',
          body: JSON.stringify({ slotId: button.dataset.slotId })
        })
      );
      showStatus('合成預約已建立；僅產生本機稽核與 outbox 意圖。', 'success');
      return;
    }
    if (button.dataset.action === 'cancel') {
      render(
        await request(`/bookings/${button.dataset.appointmentId}/cancellation`, {
          method: 'POST'
        })
      );
      showStatus('合成取消已記錄；未呼叫任何外部日曆。', 'success');
      return;
    }
    if (button.dataset.action === 'complete') {
      render(
        await request(`/bookings/${button.dataset.appointmentId}/complete`, {
          method: 'POST'
        })
      );
      showStatus('合成櫃檯完成到診已記錄；月度工作量同步更新。', 'success');
    }
  } catch (error) {
    showStatus(error instanceof Error ? error.message : '測試動作失敗。', 'error');
    await refresh({ announce: false });
  }
}

elements.slots.addEventListener('click', handleAction);
elements.appointments.addEventListener('click', handleAction);
elements.skipLink.addEventListener('click', (event) => {
  event.preventDefault();
  window.location.hash = 'main-content';
  elements.mainContent.focus({ preventScroll: true });
});
elements.resetButton.addEventListener('click', async () => {
  elements.resetButton.disabled = true;
  try {
    const snapshot = await request('/reset', { method: 'POST' });
    if (!isOnlineSyntheticPreview) await workspaceRequest('/reset', {});
    render(snapshot);
    renderWorkspace(await workspaceRequest('/workspace'));
    showStatus('合成測試狀態已重設，所有記憶體資料均已清除。', 'success');
  } catch (error) {
    showStatus(error instanceof Error ? error.message : '重設失敗。', 'error');
  } finally {
    elements.resetButton.disabled = false;
  }
});

elements.weeklyScheduleForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (currentSchedule === undefined) return;
  const weekdays = elements.weekdayCheckboxes
    .filter((checkbox) => checkbox.checked)
    .map((checkbox) => Number(checkbox.value));
  if (weekdays.length === 0) {
    showStatus('請至少選擇一個星期。', 'error');
    return;
  }
  const interval = { startLocalTime: elements.weeklyStart.value, endLocalTime: elements.weeklyEnd.value };
  let weeklyAvailability = currentSchedule.weeklyAvailability.map((entry) => ({ ...entry, intervals: [...entry.intervals] }));
  for (const weekday of weekdays) {
    const previous = weeklyAvailability.find((entry) => entry.weekday === weekday);
    weeklyAvailability = previous === undefined
      ? [...weeklyAvailability, { weekday, intervals: [interval] }]
      : weeklyAvailability.map((entry) => entry.weekday === weekday ? { ...entry, intervals: [...entry.intervals, interval] } : entry);
  }
  try {
    await saveSchedule({ ...currentSchedule, weeklyAvailability }, `已為 ${weekdays.length} 個星期加入合成時段。`);
  } catch (error) {
    showStatus(error instanceof Error ? error.message : '無法儲存合成時段。', 'error');
  }
});

elements.dateExceptionForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (currentSchedule === undefined) return;
  const date = elements.exceptionDate.value;
  const exception = elements.exceptionKind.value === 'closed'
    ? { date, kind: 'closed', reasonCode: 'TEST_CLOSED' }
    : { date, kind: 'extra_open', reasonCode: 'TEST_EXTRA_OPEN', intervals: [{ startLocalTime: elements.exceptionStart.value, endLocalTime: elements.exceptionEnd.value }] };
  const dateExceptions = [...currentSchedule.dateExceptions.filter((entry) => entry.date !== date), exception];
  try {
    await saveSchedule({ ...currentSchedule, dateExceptions }, '合成日期例外已儲存於本機記憶體。');
  } catch (error) {
    showStatus(error instanceof Error ? error.message : '無法儲存合成日期例外。', 'error');
  }
});

elements.followUpForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const status = elements.followUpStatus.value;
  const body = status === 'required' ? { status, dueDate: elements.followUpDate.value } : { status };
  try {
    render(await request('/follow-up/decision', { method: 'POST', body: JSON.stringify(body) }));
    showStatus('合成回診決定已由授權測試角色記錄。', 'success');
  } catch (error) {
    showStatus(error instanceof Error ? error.message : '無法記錄合成回診決定。', 'error');
  }
});

elements.scheduleSummary.addEventListener('click', async (event) => {
  const scheduleButton = event.target.closest('button[data-schedule-remove]');
  const exceptionButton = event.target.closest('button[data-exception-remove]');
  if (currentSchedule === undefined || (scheduleButton === null && exceptionButton === null)) return;
  try {
    if (scheduleButton !== null) {
      const [weekdayValue, intervalValue] = scheduleButton.dataset.scheduleRemove.split(':').map(Number);
      const weeklyAvailability = currentSchedule.weeklyAvailability
        .map((entry) => entry.weekday === weekdayValue
          ? { ...entry, intervals: entry.intervals.filter((_, index) => index !== intervalValue) }
          : entry)
        .filter((entry) => entry.intervals.length > 0);
      await saveSchedule({ ...currentSchedule, weeklyAvailability }, '合成每週時段已刪除。');
    } else {
      const dateExceptions = currentSchedule.dateExceptions.filter((entry) => entry.date !== exceptionButton.dataset.exceptionRemove);
      await saveSchedule({ ...currentSchedule, dateExceptions }, '合成日期例外已刪除。');
    }
  } catch (error) {
    showStatus(error instanceof Error ? error.message : '無法刪除合成排班。', 'error');
  }
});

elements.workspaceRole.addEventListener('change', async () => {
  try {
    const state = await workspaceRequest('/workspace/role', { role: elements.workspaceRole.value });
    renderWorkspace(state.workspace);
    showStatus(`已切換為${elements.workspaceRole.value === 'admin' ? '管理者' : '櫃台員工'}模擬視角。`, 'success');
  } catch (error) {
    showStatus(error instanceof Error ? error.message : '無法切換合成角色。', 'error');
  }
});

elements.accountForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const state = await workspaceRequest('/workspace/accounts', { label: elements.accountLabel.value, role: elements.accountRole.value });
    renderWorkspace(state.workspace);
    showStatus('合成工作帳號已建立。', 'success');
  } catch (error) {
    showStatus(error instanceof Error ? error.message : '無法建立合成帳號。', 'error');
  }
});

elements.accountList.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-account-toggle]');
  if (button === null) return;
  try {
    const state = await workspaceRequest(`/workspace/accounts/${button.dataset.accountToggle}/toggle`, {});
    renderWorkspace(state.workspace);
    showStatus('合成帳號狀態已更新。', 'success');
  } catch (error) {
    showStatus(error instanceof Error ? error.message : '無法更新合成帳號。', 'error');
  }
});

elements.announcementForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const state = await workspaceRequest('/workspace/announcement', {
      status: elements.announcementStatus.value,
      title: elements.announcementTitle.value,
      body: elements.announcementBody.value
    });
    renderWorkspace(state.workspace);
    showStatus('患者端公告設定已更新。', 'success');
  } catch (error) {
    showStatus(error instanceof Error ? error.message : '無法更新公告。', 'error');
  }
});

elements.maintenanceForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const state = await workspaceRequest('/workspace/maintenance', {
      enabled: elements.maintenanceEnabled.checked,
      title: elements.maintenanceTitle.value,
      body: elements.maintenanceBody.value,
      resumeAt: elements.maintenanceResumeAt.value
    });
    renderWorkspace(state.workspace);
    showStatus(elements.maintenanceEnabled.checked ? '患者端維護模式已啟用。' : '患者端維護模式已關閉。', 'success');
  } catch (error) {
    showStatus(error instanceof Error ? error.message : '無法更新維護模式。', 'error');
  }
});

elements.releaseForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const state = await workspaceRequest('/workspace/releases', {
      version: elements.releaseVersion.value,
      summary: elements.releaseSummary.value
    });
    renderWorkspace(state.workspace);
    showStatus('合成發布紀錄已新增。', 'success');
  } catch (error) {
    showStatus(error instanceof Error ? error.message : '無法新增發布紀錄。', 'error');
  }
});

refresh().catch((error) => {
  showStatus(error instanceof Error ? error.message : '無法載入測試 API。', 'error');
});
