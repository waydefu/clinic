import { stagingRequest } from './staging-store.js';

const apiBaseUrl = 'http://127.0.0.1:3000/v1/test-only';
const isOnlineSyntheticPreview = !['127.0.0.1', 'localhost'].includes(window.location.hostname);

const elements = {
  announcement: document.querySelector('#patient-announcement'),
  appointments: document.querySelector('#patient-appointments'),
  bookingApp: document.querySelector('#patient-booking-app'),
  bookingCompleteDescription: document.querySelector('#booking-complete-description'),
  bookingCompleteEyebrow: document.querySelector('#booking-complete-eyebrow'),
  bookingCompleteHeading: document.querySelector('#booking-complete-heading'),
  bookingCompleteMark: document.querySelector('#booking-complete-mark'),
  bookingResult: document.querySelector('#booking-result'),
  bookingSummary: document.querySelector('#patient-booking-summary'),
  bookAnother: document.querySelector('#book-another'),
  confirmation: document.querySelector('#synthetic-confirmation'),
  confirmBooking: document.querySelector('#confirm-patient-booking'),
  followUpChoiceStatus: document.querySelector('#follow-up-choice-status'),
  maintenance: document.querySelector('#patient-maintenance'),
  maintenanceBody: document.querySelector('#maintenance-page-body'),
  maintenanceResume: document.querySelector('#maintenance-page-resume'),
  maintenanceTitle: document.querySelector('#maintenance-page-title'),
  main: document.querySelector('#patient-main'),
  slots: document.querySelector('#patient-slots'),
  status: document.querySelector('#patient-status'),
  stepIndicators: [...document.querySelectorAll('[data-step-indicator]')],
  stepPanels: [...document.querySelectorAll('[data-booking-step]')]
};

let snapshot;
let workspace;
let selectedBookingType;
let selectedSlotId;
let completedAppointmentId;

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatDate(value) {
  return new Intl.DateTimeFormat('zh-TW', { dateStyle: 'full', timeZone: 'Asia/Taipei' }).format(new Date(value));
}

function formatTime(value) {
  return new Intl.DateTimeFormat('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Taipei' }).format(new Date(value));
}

function message(text, state = 'info') {
  elements.status.textContent = text;
  elements.status.dataset.state = state;
}

async function request(path, options = {}) {
  if (isOnlineSyntheticPreview) return stagingRequest(path, options);
  const response = await fetch(`${apiBaseUrl}${path}`, { headers: { 'Content-Type': 'application/json' }, ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message ?? `測試 API 回應 ${response.status}`);
  return body;
}

function showStep(step) {
  elements.stepPanels.forEach((panel) => { panel.hidden = Number(panel.dataset.bookingStep) !== step; });
  elements.stepIndicators.forEach((indicator) => {
    const indicatorStep = Number(indicator.dataset.stepIndicator);
    indicator.classList.toggle('is-active', indicatorStep === step);
    indicator.classList.toggle('is-complete', indicatorStep < step);
  });
  document.querySelector(`[data-booking-step="${step}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderEnvironment() {
  if (!isOnlineSyntheticPreview) return;
  document.title = '一森渼診所｜線上預約（企業合成預覽）';
  document.querySelector('.environment-badge').lastChild.textContent = 'ONLINE SYNTHETIC PREVIEW';
  document.querySelector('#patient-env-boundary').textContent = '公開網址持有人可存取 · 無真實資料';
}

function renderWorkspaceState() {
  const announcement = workspace.announcement;
  elements.announcement.hidden = announcement.status !== 'published';
  elements.announcement.innerHTML = announcement.status === 'published'
    ? `<div><strong>${escapeHtml(announcement.title)}</strong><span>${escapeHtml(announcement.body)}</span></div>`
    : '';

  const maintenance = workspace.maintenance;
  elements.maintenance.hidden = !maintenance.enabled;
  elements.bookingApp.hidden = maintenance.enabled;
  if (maintenance.enabled) {
    elements.maintenanceTitle.textContent = maintenance.title;
    elements.maintenanceBody.textContent = maintenance.body;
    elements.maintenanceResume.textContent = maintenance.resumeAt
      ? `預計恢復：${maintenance.resumeAt.replace('T', ' ')}（Asia/Taipei）`
      : '恢復時間待公告';
  }
}

function renderFollowUpChoice() {
  const decision = snapshot.followUp ?? { status: 'unknown' };
  elements.followUpChoiceStatus.textContent = decision.status === 'required'
    ? `已確認 · 目標日期 ${decision.dueDate}`
    : decision.status === 'not_required'
      ? '目前已確認無需回診'
      : '尚待授權人員確認';
}

function availableSlots() {
  return (snapshot.slots ?? []).filter((slot) => slot.reservationId === undefined);
}

function renderSlots() {
  const slots = availableSlots();
  elements.slots.innerHTML = slots.length
    ? slots.map((slot) => `
      <button class="patient-slot-option" type="button" data-patient-slot="${escapeHtml(slot.id)}">
        <span class="patient-slot-date">${escapeHtml(formatDate(slot.startsAt))}</span>
        <strong>${escapeHtml(formatTime(slot.startsAt))}–${escapeHtml(formatTime(slot.endsAt))}</strong>
        <span>30 分鐘 · 合成諮詢</span><small>可預約</small>
      </button>`).join('')
    : '<div class="empty-state"><span class="empty-state-icon" aria-hidden="true">○</span><div><strong>目前沒有可用合成時段</strong><p>可返回工作臺重設測試狀態或調整合成排班。</p></div></div>';
}

function renderConfirmation() {
  const slot = snapshot.slots.find((item) => item.id === selectedSlotId);
  if (slot === undefined) return;
  elements.bookingSummary.innerHTML = `
    <p class="eyebrow">APPOINTMENT SUMMARY</p>
    <h3>${selectedBookingType === 'follow_up' ? '回診預約' : '初次諮詢'}</h3>
    <dl><div><dt>日期</dt><dd>${escapeHtml(formatDate(slot.startsAt))}</dd></div><div><dt>時間</dt><dd>${escapeHtml(formatTime(slot.startsAt))}–${escapeHtml(formatTime(slot.endsAt))}</dd></div><div><dt>地點</dt><dd>一森渼診所 · 合成顯示</dd></div><div><dt>服務</dt><dd>30 分鐘合成諮詢</dd></div></dl>`;
  elements.confirmation.checked = false;
  elements.confirmBooking.disabled = true;
}

function renderAppointments() {
  const appointments = snapshot.appointments ?? [];
  elements.appointments.innerHTML = appointments.length
    ? appointments.map((appointment) => {
      const slot = snapshot.slots.find((item) => item.id === appointment.slotId);
      const cancellable = appointment.status === 'confirmed';
      const statusLabel = appointment.status === 'confirmed' ? '預約成立' : appointment.status === 'completed' ? '已完成' : '取消處理中';
      return `<article class="patient-appointment-card"><div><span class="status-chip ${cancellable ? 'is-available' : 'is-reserved'}">${statusLabel}</span><strong>${slot ? `${escapeHtml(formatDate(slot.startsAt))} ${escapeHtml(formatTime(slot.startsAt))}` : escapeHtml(appointment.slotId)}</strong><span class="code">${escapeHtml(appointment.id)}</span></div><button class="button button-tertiary" type="button" data-patient-cancel="${escapeHtml(appointment.id)}" ${cancellable ? '' : 'disabled'}>取消合成預約</button></article>`;
    }).join('')
    : '<div class="empty-state"><span class="empty-state-icon" aria-hidden="true">○</span><div><strong>目前沒有合成預約</strong><p>完成上方流程後，預約摘要會出現在這裡。</p></div></div>';
}

function renderAll() {
  renderWorkspaceState();
  renderFollowUpChoice();
  renderSlots();
  renderAppointments();
}

document.querySelectorAll('[data-booking-type]').forEach((button) => {
  button.addEventListener('click', () => {
    const type = button.dataset.bookingType;
    if (type === 'follow_up' && snapshot.followUp?.status !== 'required') {
      message('回診預約尚未開放：須先由授權人員確認需要回診。', 'error');
      return;
    }
    selectedBookingType = type;
    renderSlots();
    message(type === 'follow_up' ? '已選擇回診預約，請挑選合成時段。' : '已選擇初次諮詢，請挑選合成時段。', 'success');
    showStep(2);
  });
});

document.querySelectorAll('[data-booking-back]').forEach((button) => {
  button.addEventListener('click', () => showStep(Number(button.dataset.bookingBack)));
});

elements.slots.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-patient-slot]');
  if (button === null) return;
  selectedSlotId = button.dataset.patientSlot;
  renderConfirmation();
  showStep(3);
});

elements.confirmation.addEventListener('change', () => {
  elements.confirmBooking.disabled = !elements.confirmation.checked;
});

elements.confirmBooking.addEventListener('click', async () => {
  elements.confirmBooking.disabled = true;
  try {
    snapshot = await request('/bookings', { method: 'POST', body: JSON.stringify({ slotId: selectedSlotId }) });
    const appointment = snapshot.appointments.at(-1);
    completedAppointmentId = appointment?.id;
    elements.bookingCompleteMark.textContent = '✓';
    elements.bookingCompleteEyebrow.textContent = 'BOOKING COMPLETE';
    elements.bookingCompleteHeading.textContent = '合成預約已建立';
    elements.bookingCompleteDescription.textContent = '這筆資料只存在目前瀏覽器，未連線診所、日曆或通知服務。';
    elements.bookingResult.innerHTML = `<strong>預約編號：${escapeHtml(appointment?.id ?? 'appointment_test')}</strong><span>狀態：合成預約成立</span>`;
    renderAppointments();
    showStep(4);
    message('合成預約已建立；未傳送任何真實通知。', 'success');
  } catch (error) {
    message(error instanceof Error ? error.message : '無法建立合成預約。', 'error');
    elements.confirmBooking.disabled = false;
  }
});

elements.bookAnother.addEventListener('click', () => {
  selectedBookingType = undefined;
  selectedSlotId = undefined;
  renderSlots();
  showStep(1);
});

elements.appointments.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-patient-cancel]');
  if (button === null) return;
  button.disabled = true;
  try {
    const appointmentId = button.dataset.patientCancel;
    snapshot = await request(`/bookings/${appointmentId}/cancellation`, { method: 'POST' });
    if (appointmentId === completedAppointmentId) {
      elements.bookingCompleteMark.textContent = '↻';
      elements.bookingCompleteEyebrow.textContent = 'CANCELLATION REQUESTED';
      elements.bookingCompleteHeading.textContent = '取消處理已送出';
      elements.bookingCompleteDescription.textContent = '這是目前瀏覽器中的合成取消狀態，未通知診所或外部服務。';
      elements.bookingResult.innerHTML = `<strong>預約編號：${escapeHtml(appointmentId)}</strong><span>狀態：取消處理中</span>`;
    }
    renderAppointments();
    message('合成取消已記錄；正式取消期限尚待核准。', 'success');
  } catch (error) {
    message(error instanceof Error ? error.message : '無法取消合成預約。', 'error');
  }
});

document.querySelector('.skip-link').addEventListener('click', (event) => {
  event.preventDefault();
  window.location.hash = 'patient-main';
  elements.main.focus({ preventScroll: true });
});

renderEnvironment();
Promise.all([request('/state'), stagingRequest('/workspace')])
  .then(([state, workspaceState]) => {
    snapshot = state;
    workspace = workspaceState;
    renderAll();
    showStep(1);
    message('合成預約服務已就緒。', 'info');
  })
  .catch((error) => message(error instanceof Error ? error.message : '無法載入合成預約資料。', 'error'));
