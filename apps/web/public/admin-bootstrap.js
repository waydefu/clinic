import { stagingRequest } from './store.js';
import {
  renderAccounts,
  renderAppointments,
  renderAudit,
  renderCaseAssignments,
  renderFollowUps,
  renderOutbox,
  renderReleases,
  renderSchedule,
  renderSlots,
  renderTagPicker,
  renderTasks,
  renderWorkload
} from './modules/admin-view.js';
import { confirmDialog } from './modules/confirm-dialog.js';
import { WORKBENCH_PROCEDURES } from './modules/constants.js';
import { followUpDueTimes } from './modules/schedule-engine.js';
import {
  applyWorkspacePanel,
  initWorkspaceTabs
} from './modules/workspace-tabs.js';
import {
  escapeHtml,
  formatFullDate,
  formatTime,
  roleLabel
} from './modules/ui-format.js';

// 工作臺的標記與樣式直接寫在 index.html 裡，不再於執行期 fetch 一份 shell
// 再抽換 document.body。那個做法多一次往返、會讓畫面從假骨架跳成真介面，
// 而且是先前 CSP 事故的成因（connect-src 少了 'self' 就整頁掛掉）。
const elements = Object.fromEntries(
  [...document.querySelectorAll('[id]')].map((element) => [element.id, element])
);
const isOnline = !['127.0.0.1', 'localhost'].includes(window.location.hostname);

let state;
let filters = { status: 'all', kind: 'all', patientId: 'all' };
let slotKind = 'initial';
let selectedSlotId;

// 頂端 #status 是唯一的 aria-live 播報點；anchorId 則把同一句話放到剛按下的
// 按鈕旁邊。長頁面上只寫頂端等於沒有回饋——操作者看不到成功或失敗的原因。
let inlineStatus;
function message(text, tone = 'info', anchorId) {
  elements.status.textContent = text;
  elements.status.dataset.state = tone;
  const target = anchorId === undefined ? undefined : elements[anchorId];
  if (inlineStatus !== undefined && inlineStatus !== target) {
    inlineStatus.hidden = true;
    inlineStatus.textContent = '';
  }
  inlineStatus = target;
  if (target !== undefined) {
    target.textContent = text;
    target.dataset.state = tone;
    target.hidden = false;
  }
}

async function post(path, body = {}) {
  state = await stagingRequest(path, {
    method: 'POST',
    body: JSON.stringify(body)
  });
  render();
  return state;
}

function options(items, selectedId, label) {
  return items
    .map(
      (item) =>
        `<option value="${escapeHtml(item.id)}" ${item.id === selectedId ? 'selected' : ''}>${escapeHtml(label(item))}</option>`
    )
    .join('');
}

function renderSession() {
  const active = state.workspace.accounts.filter(
    (item) => item.status === 'active'
  );
  elements['workspace-account'].innerHTML = options(
    active,
    state.session.account.id,
    (item) => `${item.label} · ${roleLabel(item.role)}`
  );
  elements['current-account-label'].textContent =
    `${state.session.account.label} · ${roleLabel(state.session.account.role)}`;
  elements['current-account-boundary'].textContent =
    state.session.account.role === 'admin'
      ? '可設定排班、回診、個管、帳號與系統治理。'
      : '只保留預約、取消、改期與到診處置的日常權限。';
  const admin = state.session.account.role === 'admin';
  // 導覽連結直接隱藏；工作區只標記「被權限擋下」，實際的 hidden 由分頁模組
  // 統一決定——兩邊各自寫 hidden 會互相蓋掉（櫃台切到排班會看到空白頁）。
  document.querySelectorAll('[data-admin-nav]').forEach((element) => {
    element.hidden = !admin;
  });
  document.querySelectorAll('[data-admin-only]').forEach((element) => {
    element.dataset.restricted = String(!admin);
  });
  applyWorkspacePanel();
}

function renderFilters() {
  elements['appointment-patient-filter'].innerHTML =
    `<option value="all">全部患者</option>${options(state.patients, filters.patientId, (item) => item.name)}`;
  elements['appointment-status-filter'].value = filters.status;
  elements['appointment-kind-filter'].value = filters.kind;
  elements['slot-kind-filter'].value = slotKind;
}

function renderSummary() {
  elements['available-count'].textContent = String(
    state.slots.filter((slot) => slot.reservationId === undefined).length
  );
  elements['confirmed-count'].textContent = String(
    state.appointments.filter((item) =>
      ['confirmed', 'cancellation_requested'].includes(item.status)
    ).length
  );
  elements['completed-count'].textContent = String(
    state.appointments.filter((item) => item.status === 'completed').length
  );
  elements['workload-count'].textContent = String(
    state.workload.reduce((sum, item) => sum + item.uniquePatientCount, 0)
  );
  elements['task-list'].innerHTML = renderTasks(state);
  elements['schedule-version-chip'].textContent =
    `已發布排班 v${state.scheduleMeta.publishedVersion}`;
}

function renderBookingForm() {
  if (elements['booking-item'].innerHTML === '')
    elements['booking-item'].innerHTML = options(
      WORKBENCH_PROCEDURES,
      undefined,
      (item) => item.label
    );
  if (elements['booking-tags'].querySelector('label') === null)
    elements['booking-tags'].insertAdjacentHTML('beforeend', renderTagPicker());
  const slot = state.slots.find((item) => item.id === selectedSlotId);
  elements['booking-slot-hint'].textContent =
    slot === undefined
      ? '請先於下方「可預約時段」選擇一個時間點。'
      : `已選擇時段：${new Date(slot.startsAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`;
}

function renderCommunicationForms() {
  const a = state.workspace.announcement;
  elements['operations-announcement'].hidden = a.status !== 'published';
  elements['operations-announcement'].innerHTML =
    a.status === 'published'
      ? `<strong>${escapeHtml(a.title)}</strong><span>${escapeHtml(a.body)}</span>`
      : '';
  elements['announcement-status'].value = a.status;
  elements['announcement-title'].value = a.title;
  elements['announcement-body'].value = a.body;
  const m = state.workspace.maintenance;
  elements['maintenance-enabled'].checked = m.enabled;
  elements['maintenance-title'].value = m.title;
  elements['maintenance-body'].value = m.body;
  elements['maintenance-starts-at'].value = m.startsAt ?? '';
  elements['maintenance-resume-at'].value = m.resumeAt ?? '';
  elements['release-list'].innerHTML = renderReleases(state.workspace);
}

function renderBlockedTimesForm() {
  const blocked = state.scheduleDraft.blockedTimes ?? {
    initial: [],
    follow_up: []
  };
  if (document.activeElement !== elements['blocked-initial'])
    elements['blocked-initial'].value = (blocked.initial ?? []).join('、');
  if (document.activeElement !== elements['blocked-follow-up'])
    elements['blocked-follow-up'].value = (blocked.follow_up ?? []).join('、');
}

function render() {
  renderSession();
  renderFilters();
  renderSummary();
  renderBookingForm();
  elements.slots.innerHTML = renderSlots(state, slotKind, selectedSlotId);
  elements.appointments.innerHTML = renderAppointments(state, filters);
  elements['published-schedule'].innerHTML = renderSchedule(
    state.schedule,
    false
  );
  elements['draft-schedule'].innerHTML = renderSchedule(
    state.scheduleDraft,
    true
  );
  renderBlockedTimesForm();
  elements['schedule-draft-status'].textContent = state.scheduleMeta.draftDirty
    ? '有未發布變更'
    : '草稿與發布版本一致';
  elements['schedule-draft-status'].className =
    `status-chip ${state.scheduleMeta.draftDirty ? 'is-reserved' : 'is-available'}`;
  elements['publish-schedule'].disabled = !state.scheduleMeta.draftDirty;
  elements['discard-schedule'].disabled = !state.scheduleMeta.draftDirty;
  elements['follow-up-list'].innerHTML = renderFollowUps(state);
  elements['case-assignment-list'].innerHTML = renderCaseAssignments(state);
  elements.workload.innerHTML = renderWorkload(state);
  elements['account-list'].innerHTML = renderAccounts(state.workspace);
  renderCommunicationForms();
  elements['audit-events'].innerHTML = renderAudit(
    state,
    elements['audit-filter'].value
  );
  elements['outbox-jobs'].innerHTML = renderOutbox(state);
}

async function updateDraft(mutator, text, anchorId) {
  const draft = structuredClone(state.scheduleDraft);
  mutator(draft);
  await post('/schedule/draft', draft);
  message(text, 'success', anchorId);
}

function parseTimeList(value) {
  return value
    .split(/[、,，\s]+/)
    .map((item) => item.trim())
    .filter((item) => item !== '');
}

elements['workspace-account'].addEventListener('change', async () => {
  try {
    await post('/workspace/session', {
      accountId: elements['workspace-account'].value
    });
    message(`已切換為 ${state.session.account.label}。`, 'success');
  } catch (error) {
    message(error.message, 'error');
  }
});

elements['reset-state'].addEventListener('click', async () => {
  if (
    !(await confirmDialog(
      '確定清除目前瀏覽器保存的全部預約與患者資料？此動作無法復原。',
      { danger: true, confirmLabel: '清除資料' }
    ))
  )
    return;
  state = await stagingRequest('/reset', { method: 'POST', body: '{}' });
  filters = { status: 'all', kind: 'all', patientId: 'all' };
  selectedSlotId = undefined;
  render();
  message('本機資料已清除。', 'success');
});

elements['slot-kind-filter'].addEventListener('change', () => {
  slotKind = elements['slot-kind-filter'].value;
  elements['booking-kind'].value = slotKind;
  selectedSlotId = undefined;
  elements.slots.innerHTML = renderSlots(state, slotKind, selectedSlotId);
  renderBookingForm();
});

elements['booking-kind'].addEventListener('change', () => {
  slotKind = elements['booking-kind'].value;
  elements['slot-kind-filter'].value = slotKind;
  selectedSlotId = undefined;
  elements.slots.innerHTML = renderSlots(state, slotKind, selectedSlotId);
  renderBookingForm();
});

elements['appointment-status-filter'].addEventListener('change', () => {
  filters.status = elements['appointment-status-filter'].value;
  elements.appointments.innerHTML = renderAppointments(state, filters);
});
elements['appointment-kind-filter'].addEventListener('change', () => {
  filters.kind = elements['appointment-kind-filter'].value;
  elements.appointments.innerHTML = renderAppointments(state, filters);
});
elements['appointment-patient-filter'].addEventListener('change', () => {
  filters.patientId = elements['appointment-patient-filter'].value;
  elements.appointments.innerHTML = renderAppointments(state, filters);
});

elements.slots.addEventListener('click', (event) => {
  const button = event.target.closest('[data-select-slot]');
  if (button === null) return;
  selectedSlotId = button.dataset.selectSlot;
  elements.slots.innerHTML = renderSlots(state, slotKind, selectedSlotId);
  renderBookingForm();
  message(
    '已選擇時段，請確認上方預約資料後建立。',
    'success',
    'booking-form-status'
  );
});

elements['booking-form'].addEventListener('submit', async (event) => {
  event.preventDefault();
  if (selectedSlotId === undefined)
    return message(
      '尚未建立：請先於下方「可預約時段」選擇一個時間點。',
      'error',
      'booking-form-status'
    );
  const noteTags = [
    ...elements['booking-tags'].querySelectorAll('[data-booking-tag]:checked')
  ].map((item) => item.dataset.bookingTag);
  const bookedSlotId = selectedSlotId;
  try {
    await post('/bookings', {
      slotId: bookedSlotId,
      bookingKind: elements['booking-kind'].value,
      itemId: elements['booking-item'].value,
      noteTags,
      noteText: elements['booking-note'].value,
      patient: {
        name: elements['booking-name'].value,
        phone: elements['booking-phone'].value,
        birthDate: elements['booking-birth'].value,
        nationalId: elements['booking-national-id'].value,
        hasNhiCard: elements['booking-nhi-card'].checked
      },
      origin: 'staff'
    });
    // 成功訊息要講清楚建立了哪一筆，操作者不必捲到預約清單才能確認。
    const created = state.appointments.find(
      (item) => item.slotId === bookedSlotId && item.status === 'confirmed'
    );
    selectedSlotId = undefined;
    elements['booking-form'].reset();
    render();
    message(
      created === undefined
        ? '預約已建立，可於下方「預約清單」查看。'
        : `預約已建立：${created.id} · ${formatFullDate(created.startsAt)} ${formatTime(created.startsAt)}。`,
      'success',
      'booking-form-status'
    );
  } catch (error) {
    message(`未建立預約：${error.message}`, 'error', 'booking-form-status');
  }
});

elements.appointments.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-appointment-action]');
  if (button === null) return;
  const action = button.dataset.appointmentAction;
  const id = button.dataset.appointmentId;

  if (action === 'follow_up_confirm') {
    document
      .querySelector(`[data-follow-up-form="${id}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    message('請於下方「逐筆回診確認」記錄決定。', 'info');
    return;
  }
  if (action === 'reschedule') {
    const form = document.querySelector(`[data-reschedule-form="${id}"]`);
    if (form !== null) {
      form.hidden = !form.hidden;
      if (!form.hidden) form.querySelector('select')?.focus();
    }
    return;
  }

  const questions = {
    cancel: '確認取消此預約並釋放時段？',
    no_show: '確認將此預約標記為未到？時段會釋放。',
    complete: '確認此患者已完成到診？'
  };
  const confirmed = await confirmDialog(questions[action], {
    danger: action !== 'complete',
    confirmLabel: {
      cancel: '取消預約',
      no_show: '標記未到',
      complete: '完成到診'
    }[action]
  });
  if (!confirmed) return;
  const paths = { cancel: 'cancel', no_show: 'no-show', complete: 'complete' };
  try {
    await post(`/bookings/${id}/${paths[action]}`);
    const done = {
      cancel: '預約已取消並釋放時段。',
      no_show: '已標記未到並釋放時段。',
      complete: '到診已記錄，請接續處理回診與個管指派。'
    };
    message(done[action], 'success');
  } catch (error) {
    message(error.message, 'error');
  }
});

// 修改備註：展開／收合卡片內的表單。備註不改狀態也不動時段，因此不放進
// 「處置」選單，直接一鍵可按。
elements.appointments.addEventListener('click', (event) => {
  const toggle = event.target.closest('[data-notes-toggle]');
  const cancel = event.target.closest('[data-notes-cancel]');
  const id = toggle?.dataset.notesToggle ?? cancel?.dataset.notesCancel;
  if (id === undefined) return;
  const form = document.querySelector(`[data-notes-form="${id}"]`);
  const button = document.querySelector(`[data-notes-toggle="${id}"]`);
  if (form === null || button === null) return;
  form.hidden = cancel !== null ? true : !form.hidden;
  button.setAttribute('aria-expanded', String(!form.hidden));
  if (!form.hidden) form.querySelector('input')?.focus();
  else button.focus();
});

elements.appointments.addEventListener('submit', async (event) => {
  const notesForm = event.target.closest('[data-notes-form]');
  if (notesForm !== null) {
    event.preventDefault();
    const data = new FormData(notesForm);
    try {
      await post(`/bookings/${notesForm.dataset.notesForm}/notes`, {
        noteTags: data.getAll('noteTags'),
        noteText: data.get('noteText')
      });
      message('備註已更新。', 'success');
    } catch (error) {
      message(`未更新備註：${error.message}`, 'error');
    }
    return;
  }

  const form = event.target.closest('[data-reschedule-form]');
  if (form === null) return;
  event.preventDefault();
  const slotId = new FormData(form).get('slotId');
  if (!slotId) return message('沒有可改期的時段。', 'error');
  try {
    await post(`/bookings/${form.dataset.rescheduleForm}/reschedule`, {
      slotId
    });
    message('預約已改期。', 'success');
  } catch (error) {
    message(error.message, 'error');
  }
});

elements['weekly-form'].addEventListener('submit', async (event) => {
  event.preventDefault();
  const weekdays = [
    ...document.querySelectorAll('.weekday-picker input:checked')
  ].map((item) => Number(item.value));
  if (weekdays.length === 0)
    return message(
      '未加入草稿：至少選擇一個星期。',
      'error',
      'weekly-form-status'
    );
  try {
    await updateDraft(
      (draft) => {
        for (const weekday of weekdays) {
          let entry = draft.weeklyAvailability.find(
            (item) => item.weekday === weekday
          );
          if (entry === undefined) {
            entry = { weekday, intervals: [] };
            draft.weeklyAvailability.push(entry);
          }
          entry.intervals.push({
            startLocalTime: elements['weekly-start'].value,
            endLocalTime: elements['weekly-end'].value
          });
          entry.intervals.sort((a, b) =>
            a.startLocalTime.localeCompare(b.startLocalTime)
          );
        }
        draft.weeklyAvailability.sort((a, b) => a.weekday - b.weekday);
      },
      `已為 ${weekdays.length} 個星期加入排班草稿。`,
      'weekly-form-status'
    );
  } catch (error) {
    message(`未加入草稿：${error.message}`, 'error', 'weekly-form-status');
  }
});

elements['date-exception-form'].addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await updateDraft(
      (draft) => {
        const kind = elements['exception-kind'].value;
        const entry = {
          date: elements['exception-date'].value,
          kind,
          intervals:
            kind === 'extra_open'
              ? [
                  {
                    startLocalTime: elements['exception-start'].value,
                    endLocalTime: elements['exception-end'].value
                  }
                ]
              : []
        };
        draft.dateExceptions = [
          ...draft.dateExceptions.filter((item) => item.date !== entry.date),
          entry
        ].sort((a, b) => a.date.localeCompare(b.date));
      },
      '日期例外已加入排班草稿。',
      'date-exception-form-status'
    );
  } catch (error) {
    message(
      `未加入草稿：${error.message}`,
      'error',
      'date-exception-form-status'
    );
  }
});

elements['blocked-times-form'].addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await updateDraft(
      (draft) => {
        draft.blockedTimes = {
          initial: parseTimeList(elements['blocked-initial'].value),
          follow_up: parseTimeList(elements['blocked-follow-up'].value)
        };
      },
      '固定不開放時間已加入排班草稿。',
      'blocked-times-form-status'
    );
  } catch (error) {
    message(`未套用：${error.message}`, 'error', 'blocked-times-form-status');
  }
});

elements['draft-schedule'].addEventListener('click', async (event) => {
  const weekly = event.target.closest('[data-remove-weekly]');
  const exception = event.target.closest('[data-remove-exception]');
  if (weekly === null && exception === null) return;
  if (
    !(await confirmDialog('確定從排班草稿刪除此設定？', {
      danger: true,
      confirmLabel: '刪除'
    }))
  )
    return;
  try {
    await updateDraft(
      (draft) => {
        if (weekly !== null) {
          const [weekdayText, indexText] =
            weekly.dataset.removeWeekly.split(':');
          const entry = draft.weeklyAvailability.find(
            (item) => item.weekday === Number(weekdayText)
          );
          entry.intervals.splice(Number(indexText), 1);
          draft.weeklyAvailability = draft.weeklyAvailability.filter(
            (item) => item.intervals.length > 0
          );
        } else
          draft.dateExceptions = draft.dateExceptions.filter(
            (item) => item.date !== exception.dataset.removeException
          );
      },
      '排班草稿項目已刪除。',
      'schedule-toolbar-status'
    );
  } catch (error) {
    message(`未刪除：${error.message}`, 'error', 'schedule-toolbar-status');
  }
});

elements['publish-schedule'].addEventListener('click', async () => {
  if (
    !(await confirmDialog(
      '發布後將重新產生患者可預約時段。系統會阻擋影響既有預約的變更，是否繼續？',
      { confirmLabel: '發布排班' }
    ))
  )
    return;
  try {
    await post('/schedule/publish');
    message(
      '排班已發布，患者端可預約時段已同步更新。',
      'success',
      'schedule-toolbar-status'
    );
  } catch (error) {
    message(`未發布：${error.message}`, 'error', 'schedule-toolbar-status');
  }
});

elements['discard-schedule'].addEventListener('click', async () => {
  if (
    !(await confirmDialog('確定捨棄所有未發布的排班變更？', {
      danger: true,
      confirmLabel: '捨棄草稿'
    }))
  )
    return;
  await post('/schedule/discard');
  message('未發布排班變更已捨棄。', 'success', 'schedule-toolbar-status');
});

// 目標日期改變時，重建當天的回診時間選單；未營業日直接標示，
// 不留下可送出的空值（送出端 domain 仍會再擋一次）。
elements['follow-up-list'].addEventListener('change', (event) => {
  const dateInput = event.target.closest('input[name="dueDate"]');
  if (dateInput === null) return;
  const select = dateInput
    .closest('[data-follow-up-form]')
    ?.querySelector('select[name="dueTime"]');
  if (select === undefined || select === null) return;
  const times = followUpDueTimes(state.schedule, dateInput.value);
  select.innerHTML = times.length
    ? times
        .map((time) => `<option value="${escapeHtml(time)}">${time}</option>`)
        .join('')
    : '<option value="">當天未營業</option>';
  if (times.length === 0)
    message('目標日期當天未營業，請改選有門診的日期。', 'error');
});

elements['follow-up-list'].addEventListener('submit', async (event) => {
  const form = event.target.closest('[data-follow-up-form]');
  if (form === null) return;
  event.preventDefault();
  const data = new FormData(form);
  try {
    const managerId = data.get('managerId');
    await post(`/follow-ups/${form.dataset.followUpForm}`, {
      status: data.get('status'),
      dueDate: data.get('dueDate'),
      dueTime: data.get('dueTime'),
      tags: data.getAll('tags'),
      noteText: data.get('noteText'),
      certificateCopies: Number(data.get('certificateCopies') ?? 0),
      managerId
    });
    message(
      managerId ? '逐筆回診決定與個管指派已記錄。' : '逐筆回診決定已記錄。',
      'success'
    );
  } catch (error) {
    message(error.message, 'error');
  }
});

elements['case-assignment-list'].addEventListener('submit', async (event) => {
  const form = event.target.closest('[data-case-form]');
  if (form === null) return;
  event.preventDefault();
  const data = new FormData(form);
  try {
    await post('/case-assignments', {
      appointmentId: form.dataset.caseForm,
      managerId: data.get('managerId')
    });
    message('個管指派已更新，月度不重複患者統計已重新計算。', 'success');
  } catch (error) {
    message(error.message, 'error');
  }
});

elements['account-form'].addEventListener('submit', async (event) => {
  event.preventDefault();
  const label = elements['account-label'].value;
  try {
    await post('/workspace/accounts', {
      label,
      role: elements['account-role'].value
    });
    // 成功即清空輸入，避免殘留的標籤被再按一次送出。
    elements['account-form'].reset();
    message(
      `帳號「${label.trim()}」已建立。`,
      'success',
      'account-form-status'
    );
  } catch (error) {
    message(`未建立帳號：${error.message}`, 'error', 'account-form-status');
  }
});

elements['account-list'].addEventListener('click', async (event) => {
  const button = event.target.closest('[data-account-toggle]');
  if (button === null) return;
  if (
    !(await confirmDialog('確定變更此帳號的啟用狀態？', {
      confirmLabel: '變更狀態'
    }))
  )
    return;
  try {
    await post(`/workspace/accounts/${button.dataset.accountToggle}/toggle`);
    message('帳號狀態已更新。', 'success');
  } catch (error) {
    message(error.message, 'error');
  }
});

elements['announcement-form'].addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await post('/workspace/announcement', {
      status: elements['announcement-status'].value,
      title: elements['announcement-title'].value,
      body: elements['announcement-body'].value
    });
    message('患者公告已儲存。', 'success', 'announcement-form-status');
  } catch (error) {
    message(`未儲存：${error.message}`, 'error', 'announcement-form-status');
  }
});

elements['maintenance-form'].addEventListener('submit', async (event) => {
  event.preventDefault();
  if (
    elements['maintenance-enabled'].checked &&
    !(await confirmDialog(
      '啟用後，生效時間內患者端將無法建立預約。確定套用？',
      { danger: true, confirmLabel: '套用維護模式' }
    ))
  )
    return;
  try {
    await post('/workspace/maintenance', {
      enabled: elements['maintenance-enabled'].checked,
      title: elements['maintenance-title'].value,
      body: elements['maintenance-body'].value,
      startsAt: elements['maintenance-starts-at'].value,
      resumeAt: elements['maintenance-resume-at'].value
    });
    message(
      state.maintenanceActive
        ? '患者端維護模式目前生效中。'
        : '維護排程已儲存，目前尚未生效或已自動恢復。',
      'success',
      'maintenance-form-status'
    );
  } catch (error) {
    message(`未套用：${error.message}`, 'error', 'maintenance-form-status');
  }
});

elements['release-form'].addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await post('/workspace/releases', {
      version: elements['release-version'].value,
      summary: elements['release-summary'].value
    });
    message(
      '發布紀錄已新增；未觸發真實部署。',
      'success',
      'release-form-status'
    );
  } catch (error) {
    message(`未新增：${error.message}`, 'error', 'release-form-status');
  }
});

elements['audit-filter'].addEventListener('change', () => {
  elements['audit-events'].innerHTML = renderAudit(
    state,
    elements['audit-filter'].value
  );
});

// 日曆投影的合成示範：模擬一次同步（可設為失敗以產生死信）。
elements['outbox-simulate'].addEventListener('click', async () => {
  const fail = elements['outbox-fail-next'].checked;
  try {
    await post('/outbox/simulate', { fail });
    elements['outbox-fail-next'].checked = false;
    message(
      fail
        ? '已模擬同步失敗，工作進入死信，可在下方重新排入。'
        : '已模擬同步成功。',
      'success',
      'outbox-form-status'
    );
  } catch (error) {
    message(`未能模擬同步：${error.message}`, 'error', 'outbox-form-status');
  }
});

// 死信補回入口：對映 apps/worker 的 requeue，只作用於死信。
elements['outbox-jobs'].addEventListener('click', async (event) => {
  const button = event.target.closest('[data-outbox-requeue]');
  if (button === null) return;
  try {
    await post('/outbox/requeue', { jobId: button.dataset.outboxRequeue });
    message(
      '死信已重新排入，狀態回到待同步。',
      'success',
      'outbox-form-status'
    );
  } catch (error) {
    message(`未能重新排入：${error.message}`, 'error', 'outbox-form-status');
  }
});

document.querySelector('.skip-link').addEventListener('click', (event) => {
  event.preventDefault();
  window.location.hash = 'main-content';
  elements['main-content'].focus({ preventScroll: true });
});

if (!isOnline) elements['environment-label'].textContent = 'LOCAL TEST ONLY';

try {
  state = await stagingRequest('/state');
  render();
  initWorkspaceTabs();
  message('工作臺已就緒。資料只保存在這台裝置的瀏覽器。', 'success');
} catch (error) {
  message(error instanceof Error ? error.message : '無法載入工作臺。', 'error');
}
