import { stagingRequest } from './store.js';
import {
  BOOKING_KIND_LABELS,
  PATIENT_SERVICES,
  WEEKDAY_LABELS
} from './modules/constants.js';
import {
  buildGoogleCalendarUrl,
  downloadIcs
} from './modules/calendar-export.js';
import { fieldErrors } from './modules/patient-registry.js';
import {
  emptyState,
  escapeHtml,
  formatFullDate,
  formatTime,
  groupSlotsByDate
} from './modules/ui-format.js';

const identityKeyStorage = 'beauessence_patient_last_identity';
const isOnline = !['127.0.0.1', 'localhost'].includes(window.location.hostname);
const elements = Object.fromEntries(
  [...document.querySelectorAll('[id]')].map((element) => [element.id, element])
);
const panels = [...document.querySelectorAll('[data-booking-step]')];
const indicators = [...document.querySelectorAll('[data-step-indicator]')];

let state;
let selectedBookingType = 'initial';
let selectedServiceId;
let selectedSlotId;
let completedAppointmentId;
let completedAppointment;

function myPatientId() {
  try {
    return window.localStorage.getItem(identityKeyStorage) ?? undefined;
  } catch {
    return undefined;
  }
}
function rememberPatient(patientId) {
  try {
    window.localStorage.setItem(identityKeyStorage, patientId);
  } catch {
    /* 無痕模式等情境下略過記憶 */
  }
}

function message(text, tone = 'info') {
  elements['patient-status'].textContent = text;
  elements['patient-status'].dataset.state = tone;
}

function showStep(step) {
  panels.forEach((panel) => {
    panel.hidden = Number(panel.dataset.bookingStep) !== step;
  });
  indicators.forEach((indicator) => {
    const value = Number(indicator.dataset.stepIndicator);
    indicator.classList.toggle('is-active', value === step);
    indicator.classList.toggle('is-complete', value < step);
  });
  document
    .querySelector(`[data-booking-step="${step}"]`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function latestFollowUp() {
  const patientId = myPatientId();
  if (patientId === undefined) return undefined;
  return [...state.followUps]
    .reverse()
    .find(
      (item) =>
        item.patientId === patientId &&
        item.status === 'required' &&
        item.scheduledAppointmentId === undefined
    );
}

function renderHours() {
  const lines = [...state.schedule.weeklyAvailability]
    .sort((left, right) => left.weekday - right.weekday)
    .map(
      (entry) =>
        `${WEEKDAY_LABELS[entry.weekday]} ${entry.intervals
          .map(
            (interval) => `${interval.startLocalTime}–${interval.endLocalTime}`
          )
          .join('、')}`
    );
  elements['patient-hours-summary'].textContent =
    lines.length > 0 ? `門診時間：${lines.join('；')}` : '目前未開放門診時間';
}

function renderWorkspace() {
  const a = state.workspace.announcement;
  elements['patient-announcement'].hidden = a.status !== 'published';
  elements['patient-announcement'].innerHTML =
    a.status === 'published'
      ? `<div><strong>${escapeHtml(a.title)}</strong><span>${escapeHtml(a.body)}</span></div>`
      : '';
  elements['patient-maintenance'].hidden = !state.maintenanceActive;
  elements['patient-booking-app'].hidden = state.maintenanceActive;
  if (state.maintenanceActive) {
    const m = state.workspace.maintenance;
    elements['maintenance-page-title'].textContent = m.title;
    elements['maintenance-page-body'].textContent = m.body;
    elements['maintenance-page-resume'].textContent = m.resumeAt
      ? `預計恢復：${m.resumeAt.replace('T', ' ')}（Asia/Taipei）`
      : '恢復時間尚待診所確認。';
  }
}

function renderFollowUpChoice() {
  const followUp = latestFollowUp();
  elements['follow-up-choice-status'].textContent =
    followUp === undefined
      ? '尚待醫師確認回診'
      : `已確認需回診 · 建議日期 ${followUp.dueDate}`;
}

function renderServices() {
  elements['patient-services'].innerHTML = PATIENT_SERVICES.map(
    (service) =>
      `<button class="service-choice${service.id === selectedServiceId ? ' is-selected' : ''}" type="button" data-service="${escapeHtml(service.id)}"><strong>${escapeHtml(service.label)}</strong><span>${escapeHtml(service.note)}</span></button>`
  ).join('');
}

function availableSlots() {
  return state.slots
    .filter(
      (slot) =>
        slot.reservationId === undefined && slot.kind === selectedBookingType
    )
    .slice(0, 60);
}

function renderSlots() {
  const slots = availableSlots();
  elements['slot-choice-description'].textContent =
    selectedBookingType === 'follow_up'
      ? '回診開放每小時 15 分與 45 分，時間以 Asia/Taipei（台北時間）顯示。'
      : '初診開放整點與 30 分，時間以 Asia/Taipei（台北時間）顯示。';
  elements['patient-slots'].innerHTML = slots.length
    ? groupSlotsByDate(slots)
        .map((group) => {
          const buttons = group.slots
            .map((slot) => {
              const selected = slot.id === selectedSlotId;
              return `<button class="slot-chip${selected ? ' is-selected' : ''}" type="button" data-patient-slot="${escapeHtml(slot.id)}" aria-pressed="${selected}">${escapeHtml(formatTime(slot.startsAt))}${selected ? '<span class="slot-chip-mark" aria-hidden="true">✓</span>' : ''}</button>`;
            })
            .join('');
          return `<section class="slot-day"><h3 class="slot-day-label">${escapeHtml(group.label)}<span class="slot-day-count">${group.slots.length} 個時段</span></h3><div class="slot-chip-row">${buttons}</div></section>`;
        })
        .join('')
    : emptyState('目前沒有可預約時段', '診所發布新的排班後，時段會自動更新。');
}

function selectedService() {
  return PATIENT_SERVICES.find((service) => service.id === selectedServiceId);
}

function renderConfirmation() {
  const slot = state.slots.find((item) => item.id === selectedSlotId);
  if (slot === undefined) return;
  const service = selectedService();
  elements['patient-booking-summary'].innerHTML =
    `<p class="eyebrow">APPOINTMENT SUMMARY</p><h3>${escapeHtml(BOOKING_KIND_LABELS[selectedBookingType])}</h3><dl><div><dt>項目</dt><dd>${escapeHtml(service?.label ?? '—')}${service ? `（${escapeHtml(service.note)}）` : ''}</dd></div><div><dt>日期</dt><dd>${escapeHtml(formatFullDate(slot.startsAt))}</dd></div><div><dt>時間</dt><dd>${escapeHtml(formatTime(slot.startsAt))}</dd></div><div><dt>地點</dt><dd>一森渼診所</dd></div></dl>`;
  updateSubmitState();
}

const formFields = [
  'patient-name',
  'patient-phone',
  'patient-birth',
  'patient-national-id'
];

function patientInput() {
  return {
    name: elements['patient-name'].value,
    phone: elements['patient-phone'].value,
    birthDate: elements['patient-birth'].value,
    nationalId: elements['patient-national-id'].value,
    hasNhiCard: elements['patient-nhi-card'].checked
  };
}

const fieldToId = {
  name: 'patient-name',
  phone: 'patient-phone',
  birthDate: 'patient-birth',
  nationalId: 'patient-national-id'
};

// 只對「使用者已經離開過」的欄位顯示錯誤，避免一進表單就滿江紅。
const touched = new Set();

function showFieldErrors(only = touched) {
  const errors = fieldErrors(patientInput());
  for (const [field, id] of Object.entries(fieldToId)) {
    const input = elements[id];
    const hint = elements[`${id}-error`];
    const problem = only.has(id) ? errors[field] : undefined;
    hint.textContent = problem ?? '';
    hint.hidden = problem === undefined;
    input.setAttribute(
      'aria-invalid',
      problem === undefined ? 'false' : 'true'
    );
    input
      .closest('label')
      ?.classList.toggle('has-error', problem !== undefined);
  }
  return errors;
}

// 送出鈕刻意保持可按。停用的按鈕不會說明「為什麼不能按」，使用者只能自己猜；
// 改為按下後把問題逐欄指出來，並把焦點帶到第一個要修正的地方。
function updateSubmitState() {
  showFieldErrors();
}

function statusLabel(status) {
  return (
    {
      confirmed: '預約成立',
      completed: '已完成到診',
      cancelled: '已取消',
      no_show: '未到',
      cancellation_requested: '取消待診所確認'
    }[status] ?? status
  );
}

function renderAppointments() {
  const patientId = myPatientId();
  const list =
    patientId === undefined
      ? []
      : state.appointments.filter((item) => item.patientId === patientId);
  elements['patient-appointments'].innerHTML = list.length
    ? list
        .map((appointment) => {
          const cancellable = appointment.status === 'confirmed';
          return `<article class="patient-appointment-card"><div><span class="status-chip ${cancellable ? 'is-available' : 'is-reserved'}">${statusLabel(appointment.status)}</span><strong>${escapeHtml(formatFullDate(appointment.startsAt))} ${escapeHtml(formatTime(appointment.startsAt))}</strong><span>${escapeHtml(BOOKING_KIND_LABELS[appointment.bookingKind] ?? '')} · ${escapeHtml(appointment.itemLabel ?? '')}</span><span class="code">${escapeHtml(appointment.id)}</span></div><button class="button button-tertiary" type="button" data-patient-cancel="${escapeHtml(appointment.id)}" ${cancellable ? '' : 'disabled'}>提出取消</button></article>`;
        })
        .join('')
    : emptyState('目前沒有預約', '完成上方流程後，預約摘要會出現在這裡。');
}

function renderAll() {
  renderWorkspace();
  renderHours();
  renderFollowUpChoice();
  renderServices();
  renderSlots();
  renderAppointments();
}

document.querySelectorAll('[data-booking-type]').forEach((button) =>
  button.addEventListener('click', () => {
    const type = button.dataset.bookingType;
    if (type === 'follow_up' && latestFollowUp() === undefined) {
      message('目前沒有已由醫師確認、且尚未安排的回診需求。', 'error');
      return;
    }
    selectedBookingType = type;
    document
      .querySelectorAll('[data-booking-type]')
      .forEach((item) => item.classList.toggle('is-selected', item === button));
    renderSlots();
    message(
      `已選擇${BOOKING_KIND_LABELS[type]}，請接著選擇看診項目。`,
      'success'
    );
  })
);

elements['patient-services'].addEventListener('click', (event) => {
  const button = event.target.closest('[data-service]');
  if (button === null) return;
  selectedServiceId = button.dataset.service;
  renderServices();
  renderSlots();
  showStep(2);
  message('請選擇看診時段。', 'success');
});

document
  .querySelectorAll('[data-booking-back]')
  .forEach((button) =>
    button.addEventListener('click', () =>
      showStep(Number(button.dataset.bookingBack))
    )
  );

elements['patient-slots'].addEventListener('click', (event) => {
  const button = event.target.closest('[data-patient-slot]');
  if (button === null) return;
  selectedSlotId = button.dataset.patientSlot;
  renderSlots();
  renderConfirmation();
  showStep(3);
});

for (const field of [
  ...formFields,
  'patient-nhi-card',
  'synthetic-confirmation'
])
  elements[field].addEventListener('input', updateSubmitState);
elements['synthetic-confirmation'].addEventListener(
  'change',
  updateSubmitState
);
// 離開欄位才提示該欄錯誤（on-blur）；輸入中只更新送出按鈕，避免邊打邊被罵。
for (const field of formFields)
  elements[field].addEventListener('blur', () => {
    touched.add(field);
    updateSubmitState();
  });

elements['confirm-patient-booking'].addEventListener('click', async () => {
  // 送出時把每一欄都視為已造訪，錯誤一次講完，並把焦點帶到第一個問題欄位。
  for (const field of formFields) touched.add(field);
  const errors = showFieldErrors();
  const firstProblem = Object.keys(fieldToId).find(
    (field) => errors[field] !== undefined
  );
  if (firstProblem !== undefined) {
    const target = elements[fieldToId[firstProblem]];
    target.focus();
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    message('有欄位需要修正，請看欄位下方的提示。', 'error');
    return;
  }
  if (!elements['synthetic-confirmation'].checked) {
    elements['synthetic-confirmation'].focus();
    message('請先勾選下方的確認項目。', 'error');
    return;
  }

  // 送出期間必須有明確回饋。只把按鈕變灰不足以說明「系統正在處理」，
  // 使用者會以為沒按到而重複點擊。
  const submitButton = elements['confirm-patient-booking'];
  const submitLabel = submitButton.textContent;
  submitButton.disabled = true;
  submitButton.dataset.busy = 'true';
  submitButton.textContent = '送出中…';
  message('正在送出預約，請稍候。', 'info');
  try {
    state = await stagingRequest('/bookings', {
      method: 'POST',
      body: JSON.stringify({
        slotId: selectedSlotId,
        patient: patientInput(),
        bookingKind: selectedBookingType,
        itemId: selectedServiceId,
        origin: 'patient'
      })
    });
    // A cancelled or no-show appointment keeps its original slotId even after
    // the slot is released, so matching on slotId alone can return somebody
    // else's old record. Only the live reservation counts.
    const appointment = state.appointments.find(
      (item) => item.slotId === selectedSlotId && item.status === 'confirmed'
    );
    completedAppointmentId = appointment.id;
    completedAppointment = {
      id: appointment.id,
      startsAt: appointment.startsAt,
      kindLabel: BOOKING_KIND_LABELS[appointment.bookingKind]
    };
    elements['add-to-google-calendar'].href =
      buildGoogleCalendarUrl(completedAppointment);
    rememberPatient(appointment.patientId);
    elements['booking-complete-mark'].textContent = '✓';
    elements['booking-complete-eyebrow'].textContent = 'BOOKING COMPLETE';
    elements['booking-complete-heading'].textContent = '預約已建立';
    elements['booking-complete-description'].textContent =
      '請於門診時間前十分鐘抵達櫃台。資料仍只保存在目前瀏覽器。';
    elements['booking-result'].innerHTML =
      `<strong>預約編號：${escapeHtml(appointment.id)}</strong><span>${escapeHtml(formatFullDate(appointment.startsAt))} ${escapeHtml(formatTime(appointment.startsAt))} · ${escapeHtml(appointment.itemLabel)}</span>`;
    renderAll();
    showStep(4);
    message('預約已建立。', 'success');
  } catch (error) {
    message(error.message, 'error');
  } finally {
    submitButton.disabled = false;
    delete submitButton.dataset.busy;
    submitButton.textContent = submitLabel;
  }
});

elements['add-to-calendar'].addEventListener('click', () => {
  if (completedAppointment === undefined) return;
  downloadIcs(completedAppointment);
  message('行事曆檔案已下載，開啟後即可加入。', 'success');
});

elements['book-another'].addEventListener('click', () => {
  selectedSlotId = undefined;
  selectedServiceId = undefined;
  renderServices();
  showStep(1);
});

elements['patient-appointments'].addEventListener('click', async (event) => {
  const button = event.target.closest('[data-patient-cancel]');
  if (button === null) return;
  if (!window.confirm('確定提出此預約的取消要求？')) return;
  try {
    state = await stagingRequest(
      `/bookings/${button.dataset.patientCancel}/cancellation`,
      { method: 'POST', body: JSON.stringify({ origin: 'patient' }) }
    );
    if (button.dataset.patientCancel === completedAppointmentId) {
      elements['booking-complete-mark'].textContent = '↻';
      elements['booking-complete-eyebrow'].textContent =
        'CANCELLATION REQUESTED';
      elements['booking-complete-heading'].textContent = '取消要求已送出';
      elements['booking-complete-description'].textContent =
        '診所櫃台確認後才會釋放時段。';
      elements['booking-result'].innerHTML =
        `<strong>預約編號：${escapeHtml(completedAppointmentId)}</strong><span>狀態：取消待診所確認</span>`;
    }
    renderAppointments();
    message('取消要求已記錄，等待櫃台確認。', 'success');
  } catch (error) {
    message(error.message, 'error');
  }
});

document.querySelector('.skip-link').addEventListener('click', (event) => {
  event.preventDefault();
  window.location.hash = 'patient-main';
  elements['patient-main'].focus({ preventScroll: true });
});

if (isOnline) {
  document.querySelector('.environment-badge').lastChild.textContent =
    'ONLINE PREVIEW';
  elements['patient-env-boundary'].textContent =
    '公開網址持有人可存取 · 資料只保存在本機瀏覽器';
}

try {
  state = await stagingRequest('/state');
  renderAll();
  showStep(1);
  message('已載入診所發布的門診時段。', 'success');
} catch (error) {
  message(
    error instanceof Error ? error.message : '無法載入預約資料。',
    'error'
  );
}
