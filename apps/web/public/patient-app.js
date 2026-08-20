// Trusted Types 的 default policy。必須第一個匯入：它要在任何模組
// 有機會寫 innerHTML 之前就註冊好。
import './modules/trusted-html.js';
import {
  BOOKING_KIND_LABELS,
  PATIENT_REQUEST_TAGS,
  PATIENT_SERVICES,
  PATIENT_SOURCE_TAGS,
  SOURCE_TAGS_NEEDING_REFERRER,
  WEEKDAY_LABELS
} from './modules/constants.js';
import { renderTagOptions } from './modules/tag-picker.js';
import {
  buildGoogleCalendarUrl,
  downloadIcs
} from './modules/calendar-export.js';
import { confirmDialog } from './modules/confirm-dialog.js';
import { openPolicyDialog } from './modules/policy-dialog.js';
import { fieldErrors } from './modules/patient-registry.js';
import { isUpcomingSlot } from './modules/schedule-engine.js';
import { storageKey } from './modules/state-schema.js';
import {
  emptyState,
  escapeHtml,
  formatFullDate,
  formatTime,
  groupSlotsByDate
} from './modules/ui-format.js';
import { apiClient } from './modules/api-client.js';
import { runPendingAction } from './modules/async-action.js';

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
let activeBookingStep = 1;
// 時段清單一次只展開幾天，避免一口氣塞滿整月；可按「顯示更多日期」加載，
// 或用日期選擇器直接跳到某一天。切換看診類型時重置。
const SLOT_DAYS_PAGE = 5;
let slotVisibleDays = SLOT_DAYS_PAGE;
let slotDateFilter = '';
// 診所資料（門診時段、公告）是非同步載入的。在它到達之前，選項可以先畫出來
// 佔住版面，但**不能可按**：按下去會走進需要 state 的路徑。
let dataReady = false;
let maintenanceWasActive = false;
let maintenanceResumeTimer;

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

// 頂端 #patient-status 是唯一的 aria-live 播報點；anchorId 把同一句話放到
// 送出鈕旁，避免使用者在表單位置看不到失敗原因。
let inlineStatus;
function message(text, tone = 'info', anchorId, retry) {
  elements['patient-status'].textContent = text;
  elements['patient-status'].dataset.state = tone;
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
  const retryTarget = target ?? elements['patient-status'];
  if (retry !== undefined) {
    const retryButton = document.createElement('button');
    retryButton.className = 'button button-tertiary inline-retry';
    retryButton.type = 'button';
    retryButton.textContent = '重試';
    retryButton.addEventListener('click', async () => {
      await retry();
    });
    retryTarget.append(' ', retryButton);
  }
}

async function runUiAction({
  control,
  pendingLabel,
  pendingMessage,
  anchorId,
  action,
  onSuccess,
  failureMessage = (error) => error.message
}) {
  if (pendingMessage !== undefined) message(pendingMessage, 'info', anchorId);
  const outcome = await runPendingAction({ control, pendingLabel, action });
  if (outcome.ok) {
    await onSuccess(outcome.value);
    return true;
  }
  const retry =
    outcome.retry === undefined
      ? undefined
      : () =>
          runUiAction({
            control,
            pendingLabel,
            pendingMessage,
            anchorId,
            action,
            onSuccess,
            failureMessage
          });
  message(failureMessage(outcome.error), 'error', anchorId, retry);
  return false;
}

function showStep(step, { focusHeading = true, scroll = true } = {}) {
  activeBookingStep = step;
  panels.forEach((panel) => {
    panel.hidden = Number(panel.dataset.bookingStep) !== step;
  });
  indicators.forEach((indicator) => {
    const value = Number(indicator.dataset.stepIndicator);
    indicator.classList.toggle('is-active', value === step);
    indicator.classList.toggle('is-complete', value < step);
    // 目前步驟不能只靠 class 的顏色表達，輔助科技讀 aria-current。
    if (value === step) indicator.setAttribute('aria-current', 'step');
    else indicator.removeAttribute('aria-current');
  });
  const panel = document.querySelector(`[data-booking-step="${step}"]`);
  renderBookingSummary();
  if (scroll && panel !== null) {
    const bounds = panel.getBoundingClientRect();
    const outsideUsefulViewport =
      bounds.top < 0 || bounds.top > window.innerHeight * 0.72;
    if (outsideUsefulViewport) {
      panel.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'auto'
          : 'smooth',
        block: 'start'
      });
    }
  }
  if (!focusHeading || panel === null) return;
  // 換步驟後把鍵盤焦點帶到新步驟的標題，鍵盤與報讀使用者才不會停在原地。
  const heading = document.getElementById(
    panel.getAttribute('aria-labelledby') ?? ''
  );
  if (heading !== null) {
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  }
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
  const summary =
    lines.length > 0 ? `門診時間：${lines.join('；')}` : '目前未開放門診時間';
  elements['patient-hours-summary'].textContent = summary;
  elements['patient-hours-booking'].textContent = summary;
  // 頁尾也顯示門診時間：手機版 hero 會收起聯絡卡，時間資訊改由頁尾承接。
  if (elements['patient-hours-footer'] !== undefined)
    elements['patient-hours-footer'].textContent = summary;
}

function renderWorkspace() {
  const a = state.workspace.announcement;
  elements['patient-announcement'].hidden = a.status !== 'published';
  elements['patient-announcement'].innerHTML =
    a.status === 'published'
      ? `<div><strong>${escapeHtml(a.title)}</strong><span>${escapeHtml(a.body)}</span></div>`
      : '';
  const active = state.maintenanceActive === true;
  elements['patient-maintenance'].hidden = !active;
  elements['patient-booking-app'].hidden = active;
  if (active) {
    elements['patient-booking-app'].setAttribute('inert', '');
    elements['patient-booking-app'].setAttribute('aria-hidden', 'true');
    const m = state.workspace.maintenance;
    elements['maintenance-page-title'].textContent = m.title;
    elements['maintenance-page-body'].textContent = m.body;
    elements['maintenance-page-resume'].textContent = m.resumeAt
      ? `預計恢復：${m.resumeAt.replace('T', ' ')}（Asia/Taipei）`
      : '恢復時間尚待診所確認。';
    if (!maintenanceWasActive) {
      elements['maintenance-page-title'].setAttribute('tabindex', '-1');
      elements['maintenance-page-title'].focus({ preventScroll: true });
    }
  } else {
    elements['patient-booking-app'].removeAttribute('inert');
    elements['patient-booking-app'].removeAttribute('aria-hidden');
  }
  maintenanceWasActive = active;
  scheduleMaintenanceResume();
}

function scheduleMaintenanceResume() {
  if (maintenanceResumeTimer !== undefined)
    window.clearTimeout(maintenanceResumeTimer);
  maintenanceResumeTimer = undefined;
  const resumeAt = state.workspace.maintenance.resumeAt;
  if (!state.maintenanceActive || !resumeAt) return;
  const delay = new Date(`${resumeAt}:00+08:00`).getTime() - Date.now();
  if (!Number.isFinite(delay) || delay <= 0) return;
  maintenanceResumeTimer = window.setTimeout(
    async () => {
      state = await apiClient.request('/state');
      renderAll();
    },
    Math.min(delay + 50, 2_147_000_000)
  );
}

// 回診狀態自 2026-07-27 起顯示在按鈕**外面**（P1b）。因此這句話必須自己說得
// 完整——先前它是 `<small>` 夾在按鈕裡，靠位置就知道在講回診。
//
// 兩顆按鈕都以 aria-describedby 指向它，所以這一句同時要交代「為什麼現在不能
// 選回診」與「為什麼現在不能選初診」（P2）。
function renderFollowUpChoice() {
  const followUp = latestFollowUp();
  elements['follow-up-choice-status'].textContent =
    followUp === undefined
      ? '回診狀態：尚待醫師確認。醫師登錄回診指示後，這裡才會開放回診。'
      : `回診狀態：醫師已登錄回診指示（建議 ${followUp.dueDate}${followUp.dueTime ? ` ${followUp.dueTime}` : ''}），這次請改約回診；初診暫不開放。`;
}

function renderServices() {
  elements['patient-services'].innerHTML = PATIENT_SERVICES.map(
    (service) =>
      `<button class="service-choice${service.id === selectedServiceId ? ' is-selected' : ''}" type="button" data-service="${escapeHtml(service.id)}" aria-pressed="${service.id === selectedServiceId}"${dataReady ? '' : ' disabled'}><strong>${escapeHtml(service.label)}</strong><span>${escapeHtml(service.note)}</span></button>`
  ).join('');
}

// P2（業主 2026-07-27）：醫師已登錄回診指示時，這位患者這一次要走的是回診，
// 初診鍵停用。讀法採規劃文件的「A 為主」：判準是 `latestFollowUp()` 有值，
// 而不是「已經訂到回診時段」——後者由既有的 ensureWithinActiveBookingLimit 擋。
//
// 停用之後還要把已選類型換掉，否則畫面停在一個按不到的選擇上：使用者按下看診
// 項目時會拿到初診的時段，而初診那顆是灰的。
function bookingTypeAvailability() {
  // 這個函式會在**資料到達之前**被呼叫一次：第一次繪製刻意先把常數內容畫出來
  // 佔住版面（見檔案末端關於 CLS 的註解）。此時 `state` 還是 undefined，而
  // `latestFollowUp()` 會去讀 `state.followUps`——對回訪的患者（本機已記著
  // patientId）那是一個會炸掉整個模組初始化的存取，症狀是「頁面看起來畫好了，
  // 但所有按鈕都沒有反應」。兩顆按鈕在 dataReady 之前本來就一律停用，所以這裡
  // 回什麼都不影響使用者。
  if (state === undefined) return { initial: true, follow_up: true };
  const hasFollowUp = latestFollowUp() !== undefined;
  return { initial: !hasFollowUp, follow_up: hasFollowUp };
}

function syncSelectedBookingType() {
  if (!dataReady) return;
  const available = bookingTypeAvailability();
  if (available[selectedBookingType]) return;
  const fallback = Object.keys(available).find((kind) => available[kind]);
  if (fallback !== undefined) selectedBookingType = fallback;
}

// 選取狀態不能只靠顏色：is-selected 之外同步 aria-pressed。
function renderBookingTypeButtons() {
  const available = bookingTypeAvailability();
  document.querySelectorAll('[data-booking-type]').forEach((button) => {
    const kind = button.dataset.bookingType;
    const selected = kind === selectedBookingType;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
    // 資料還沒到就按，處理器會去讀還不存在的時段。停用比讓它安靜失敗誠實。
    // 資料到齊後改由回診狀態決定：兩顆之中永遠只有一顆可按，理由寫在
    // #follow-up-choice-status，兩顆都以 aria-describedby 指向它。
    button.disabled = !dataReady || !available[kind];
  });
}

// P9：兩組可複選標籤。選項是常數，畫一次就好——它們不隨診所資料變動，
// 而且重畫會清掉使用者已經勾好的選擇。
function renderPatientTags() {
  elements['patient-request-tags'].innerHTML = renderTagOptions(
    PATIENT_REQUEST_TAGS,
    [],
    { data: 'data-request-tag' }
  );
  elements['patient-source-tags'].innerHTML = renderTagOptions(
    PATIENT_SOURCE_TAGS,
    [],
    { data: 'data-source-tag' }
  );
}

function checkedTagIds(containerId, attribute) {
  return [
    ...elements[containerId].querySelectorAll(`[${attribute}]:checked`)
  ].map((input) => input.getAttribute(attribute));
}

// 介紹人欄位只在真的有人介紹時出現。收起來時一併清空：留著上一次輸入的名字，
// 使用者取消勾選之後仍會被送出去，那是他沒有同意提供的第三人姓名。
function syncReferrerField() {
  const needed = checkedTagIds('patient-source-tags', 'data-source-tag').some(
    (id) => SOURCE_TAGS_NEEDING_REFERRER.includes(id)
  );
  elements['patient-referrer-field'].hidden = !needed;
  if (!needed) elements['patient-referrer'].value = '';
}

// P10：身分證與護照擇一，畫面上一次只出現一個。`required` 跟著搬——留在收起來
// 的那一欄上，瀏覽器會拒絕送出一個使用者根本看不到的欄位（而且不會說是哪一個）。
function syncIdentityDocumentField() {
  const foreign = isForeignNational();
  elements['patient-national-id-field'].hidden = foreign;
  elements['patient-passport-field'].hidden = !foreign;
  elements['patient-national-id'].required = !foreign;
  elements['patient-passport'].required = foreign;
  if (foreign) elements['patient-national-id'].value = '';
  else elements['patient-passport'].value = '';
}

function availableSlots() {
  return state.slots
    .filter(
      (slot) =>
        slot.reservationId === undefined &&
        slot.kind === selectedBookingType &&
        isUpcomingSlot(slot)
    )
    .sort((left, right) =>
      String(left.startsAt).localeCompare(String(right.startsAt))
    );
}

// 第 2 步顯示目前的類型與項目：選錯的人在這裡就會發現，
// 並知道可以按「返回類型與項目」重選，不必等到最後一步。
function renderBookingContext() {
  const service = selectedService();
  elements['booking-context'].textContent =
    `目前選擇：${BOOKING_KIND_LABELS[selectedBookingType]}${service ? ` · ${service.label}` : ''}。選錯了嗎？可按上方「返回類型與項目」重選。`;
  renderBookingSummary();
}

function renderDayGroup(group) {
  const buttons = group.slots
    .map((slot) => {
      const selected = slot.id === selectedSlotId;
      return `<button class="slot-chip${selected ? ' is-selected' : ''}" type="button" data-patient-slot="${escapeHtml(slot.id)}" aria-pressed="${selected}">${escapeHtml(formatTime(slot.startsAt))}${selected ? '<span class="slot-chip-mark" aria-hidden="true">✓</span>' : ''}</button>`;
    })
    .join('');
  return `<section class="slot-day"><h3 class="slot-day-label">${escapeHtml(group.label)}<span class="slot-day-count">${group.slots.length} 個時段</span></h3><div class="slot-chip-row">${buttons}</div></section>`;
}

// 依可預約範圍設定日期選擇器的上下限，並在無資料時停用，避免使用者跳到
// 一個沒有時段的日期。
function syncSlotDateInput(dayKeys) {
  const input = elements['patient-slot-date'];
  const clear = elements['patient-slot-date-clear'];
  if (input === undefined) return;
  if (dayKeys.length === 0) {
    input.value = '';
    input.disabled = true;
    if (clear !== undefined) clear.hidden = true;
    return;
  }
  input.disabled = false;
  input.min = dayKeys[0];
  input.max = dayKeys[dayKeys.length - 1];
  input.value = slotDateFilter;
  if (clear !== undefined) clear.hidden = slotDateFilter === '';
}

function renderSlots() {
  renderBookingContext();
  const slots = availableSlots();
  elements['slot-choice-description'].textContent =
    selectedBookingType === 'follow_up'
      ? '回診開放每小時 15 分與 45 分，時間以 Asia/Taipei（台北時間）顯示。'
      : '初診開放整點與 30 分，時間以 Asia/Taipei（台北時間）顯示。';

  const groups = groupSlotsByDate(slots);
  syncSlotDateInput(groups.map((group) => group.key));

  if (groups.length === 0) {
    elements['patient-slots'].innerHTML = emptyState(
      '目前沒有可預約時段',
      '診所發布新的營業時間後，時段會自動更新。'
    );
    return;
  }

  // 有指定日期時只顯示那一天；否則逐頁展開最近幾天，其餘用「顯示更多日期」。
  if (slotDateFilter !== '') {
    const match = groups.find((group) => group.key === slotDateFilter);
    elements['patient-slots'].innerHTML = match
      ? renderDayGroup(match)
      : emptyState(
          '這一天沒有可預約時段',
          '請改選其他日期，或清除日期查看全部。'
        );
    return;
  }

  const shown = groups.slice(0, slotVisibleDays);
  const remaining = groups.length - shown.length;
  const moreButton =
    remaining > 0
      ? `<button class="button slot-load-more" type="button" data-load-more-days>顯示更多日期<span class="slot-load-more-count">還有 ${remaining} 天</span></button>`
      : '';
  elements['patient-slots'].innerHTML =
    shown.map(renderDayGroup).join('') + moreButton;
}

function selectedService() {
  return PATIENT_SERVICES.find((service) => service.id === selectedServiceId);
}

function renderBookingSummary() {
  const stepLabels = ['類型與項目', '日期時段', '基本資料', '完成'];
  elements['booking-summary-step'].textContent =
    `目前步驟 ${activeBookingStep}／4 · ${stepLabels[activeBookingStep - 1]}`;
  const slot = state?.slots.find((item) => item.id === selectedSlotId);
  const service = selectedService();
  const rows = [
    ['掛號別', BOOKING_KIND_LABELS[selectedBookingType]],
    ['看診項目', service?.label ?? '尚未選擇'],
    ['日期', slot === undefined ? '尚未選擇' : formatFullDate(slot.startsAt)],
    ['時間', slot === undefined ? '尚未選擇' : formatTime(slot.startsAt)]
  ];
  elements['patient-booking-summary'].innerHTML = rows
    .map(
      ([label, value]) =>
        `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`
    )
    .join('');
}

function renderConfirmation() {
  const slot = state.slots.find((item) => item.id === selectedSlotId);
  if (slot === undefined) return;
  renderBookingSummary();
  updateSubmitState();
}

const formFields = [
  'patient-name',
  'patient-phone',
  'patient-birth-year',
  'patient-birth-month',
  'patient-birth-day',
  'patient-national-id',
  'patient-passport'
];

/** 勾了「外籍人士」就改填護照。這是 PATIENT_REQUEST_TAGS 的其中一個選項。 */
function isForeignNational() {
  return checkedTagIds('patient-request-tags', 'data-request-tag').includes(
    'foreign_national'
  );
}

// 三格拼回 domain 認得的字串。月與日補零，年份留白就走 `--MM-DD`（XSD gMonthDay）。
// 填了一半（只有月或只有日）一律回空字串，讓 domain 報 `required`——那比「格式
// 不正確」誠實：使用者沒有填錯，是還沒填完。
function birthDateValue() {
  const pad = (value) => (value.length === 1 ? `0${value}` : value);
  const year = elements['patient-birth-year'].value.trim();
  const month = elements['patient-birth-month'].value.trim();
  const day = elements['patient-birth-day'].value.trim();
  if (month === '' || day === '') return '';
  const monthDay = `${pad(month)}-${pad(day)}`;
  return year === '' ? `--${monthDay}` : `${year}-${monthDay}`;
}

function patientInput() {
  const foreign = isForeignNational();
  return {
    name: elements['patient-name'].value,
    phone: elements['patient-phone'].value,
    birthDate: birthDateValue(),
    // 只送使用者看得到的那一欄。另一欄即使還留著上一次的輸入，也不該跟著出去。
    nationalId: foreign ? '' : elements['patient-national-id'].value,
    passportNumber: foreign ? elements['patient-passport'].value : '',
    hasNhiCard: elements['patient-nhi-card'].checked
  };
}

// domain 的欄位名 → 畫面上「該把錯誤放哪裡、焦點帶到哪裡」。
// 生日拆成三格之後，錯誤訊息仍然只有一則（那是一個邏輯資料），掛在分組下方；
// 焦點帶到月份，因為那是必填的第一格。
const FIELD_UI = {
  name: { input: 'patient-name', error: 'patient-name-error' },
  phone: { input: 'patient-phone', error: 'patient-phone-error' },
  birthDate: { input: 'patient-birth-month', error: 'patient-birth-error' }
};

// 證件那三個欄位名（身分證／護照／兩者皆空）都指向**目前看得到的那一欄**。
// 對著使用者根本沒顯示的欄位報錯，等於告訴他去修一個不存在的東西。
function documentUi() {
  return isForeignNational()
    ? { input: 'patient-passport', error: 'patient-passport-error' }
    : { input: 'patient-national-id', error: 'patient-national-id-error' };
}

function fieldUi(field) {
  return FIELD_UI[field] ?? documentUi();
}

// 只對「使用者已經離開過」的欄位顯示錯誤，避免一進表單就滿江紅。
const touched = new Set();

function showFieldErrors(only = touched) {
  const errors = fieldErrors(patientInput());
  // 先清空所有錯誤位置再逐一填：證件欄會依「外籍人士」切換，只更新目前這一欄
  // 會把另一欄上一輪的紅字留在畫面上。
  for (const id of [
    'patient-name-error',
    'patient-phone-error',
    'patient-birth-error',
    'patient-national-id-error',
    'patient-passport-error'
  ]) {
    elements[id].textContent = '';
    elements[id].hidden = true;
  }
  for (const id of formFields) {
    elements[id].setAttribute('aria-invalid', 'false');
    elements[id].closest('label')?.classList.remove('has-error');
  }

  for (const [field, message] of Object.entries(errors)) {
    const ui = fieldUi(field);
    // 三格生日只要有一格被造訪過，就算這個邏輯欄位已經被造訪。
    const seen =
      field === 'birthDate'
        ? [
            'patient-birth-year',
            'patient-birth-month',
            'patient-birth-day'
          ].some((id) => only.has(id))
        : only.has(ui.input);
    if (!seen) continue;
    elements[ui.error].textContent = message;
    elements[ui.error].hidden = false;
    elements[ui.input].setAttribute('aria-invalid', 'true');
    elements[ui.input].closest('label')?.classList.add('has-error');
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
  // 維護期間不重畫或重新初始化實際流程；若使用者正在填表，由 inert + hidden
  // 完整隔離並保留原狀，直到自動恢復或另一分頁解除維護後再繼續。
  if (state.maintenanceActive) return;
  renderFollowUpChoice();
  syncSelectedBookingType();
  renderBookingTypeButtons();
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
    // 換看診類型等於換一批時段，重置日期展開與跳轉。
    slotVisibleDays = SLOT_DAYS_PAGE;
    slotDateFilter = '';
    renderBookingTypeButtons();
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
  if (event.target.closest('[data-load-more-days]') !== null) {
    slotVisibleDays += SLOT_DAYS_PAGE;
    renderSlots();
    return;
  }
  const button = event.target.closest('[data-patient-slot]');
  if (button === null) return;
  selectedSlotId = button.dataset.patientSlot;
  renderSlots();
  renderConfirmation();
  showStep(3);
});

elements['patient-slot-date'].addEventListener('change', (event) => {
  slotDateFilter = event.target.value;
  renderSlots();
});

elements['patient-slot-date-clear'].addEventListener('click', () => {
  slotDateFilter = '';
  slotVisibleDays = SLOT_DAYS_PAGE;
  renderSlots();
});

for (const field of [
  ...formFields,
  'patient-nhi-card',
  'synthetic-confirmation',
  'privacy-consent'
])
  elements[field].addEventListener('input', updateSubmitState);

// 告知入口是真的 `<a href="/privacy">`：沒有 JavaScript 時它仍然是一條走得到
// 完整告知的路（個資法要的是蒐集**前**告知，不是「有腳本才告知」）。有腳本時
// 才攔下來就地展開，讓讀完的人回到填到一半的表單。
// 修飾鍵與中鍵不攔：使用者要另開分頁是他的選擇。
elements['open-privacy-policy'].addEventListener('click', (event) => {
  if (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  event.preventDefault();
  void openPolicyDialog();
});

// P9：勾選來源標籤時同步介紹人欄位的顯示。
elements['patient-source-tags'].addEventListener('change', syncReferrerField);

// P10：勾選「外籍人士」時改問護照。切換時把另一欄清空——留著上一次的輸入，
// 使用者換回來時會看到一個他以為已經刪掉的號碼，而那是身分識別資料。
elements['patient-request-tags'].addEventListener('change', () => {
  syncIdentityDocumentField();
  updateSubmitState();
});

// P13：窄螢幕的漢堡選單。開合狀態由 aria-expanded 與 class 同時表達——前者給
// 輔助技術，後者給 CSS。點連結或按 Escape 都要收起來，否則導航之後（同頁錨點）
// 選單會留在畫面上蓋住內容。
const menuButton = document.querySelector('.patient-menu-button');
function closePatientMenu() {
  menuButton.setAttribute('aria-expanded', 'false');
  elements['patient-nav'].classList.remove('is-open');
}
menuButton.addEventListener('click', () => {
  const open = menuButton.getAttribute('aria-expanded') === 'true';
  menuButton.setAttribute('aria-expanded', String(!open));
  elements['patient-nav'].classList.toggle('is-open', !open);
});
elements['patient-nav'].addEventListener('click', (event) => {
  if (event.target.closest('a') !== null) closePatientMenu();
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (menuButton.getAttribute('aria-expanded') !== 'true') return;
  closePatientMenu();
  menuButton.focus();
});

// 從政策頁按「已閱讀草稿，回到預約」回來時帶著 ?notice-read=1。
//
// 政策頁刻意沒有任何指令碼，所以 UI 閱讀狀態只能靠網址帶回來。勾選是**看得見
// 地**被打勾，而且隨時可以取消。旗標本身不含任何個人資料，也不是正式同意或
// 告知證據；目前沒有保存政策版本、顯示時間或接受紀錄。
//
// 讀完就把它從網址上抹掉：留著會讓重新整理或分享出去的連結永遠自帶已讀狀態。
function applyNoticeReadFromUrl() {
  const url = new URL(window.location.href);
  if (url.searchParams.get('notice-read') !== '1') return;
  elements['privacy-consent'].checked = true;
  elements['privacy-consent-error'].hidden = true;
  url.searchParams.delete('notice-read');
  window.history.replaceState(
    {},
    '',
    `${url.pathname}${url.search}${url.hash}`
  );
  message(
    '已套用測試用的「已閱讀草稿」勾選；系統未保存正式同意紀錄。',
    'success'
  );
}
elements['privacy-consent'].addEventListener('change', () => {
  if (elements['privacy-consent'].checked) {
    elements['privacy-consent-error'].hidden = true;
    elements['privacy-consent-error'].textContent = '';
  }
  updateSubmitState();
});
elements['synthetic-confirmation'].addEventListener('change', () => {
  if (elements['synthetic-confirmation'].checked) {
    elements['synthetic-confirmation-error'].hidden = true;
    elements['synthetic-confirmation-error'].textContent = '';
  }
  updateSubmitState();
});
// 離開欄位才提示該欄錯誤（on-blur）；輸入中只更新送出按鈕，避免邊打邊被罵。
for (const field of formFields)
  elements[field].addEventListener('blur', () => {
    touched.add(field);
    updateSubmitState();
  });

elements['patient-booking-form'].addEventListener('submit', async (event) => {
  event.preventDefault();
  // 送出時把每一欄都視為已造訪，錯誤一次講完，並把焦點帶到第一個問題欄位。
  for (const field of formFields) touched.add(field);
  const errors = showFieldErrors();
  // fieldErrors 依欄位在表單上的順序建出來（domain 保證這個順序），所以第一個
  // 鍵就是使用者往下讀時第一個會遇到的問題。
  const [firstProblem] = Object.keys(errors);
  if (firstProblem !== undefined) {
    const target = elements[fieldUi(firstProblem).input];
    target.focus();
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    message(
      '尚未送出：有欄位需要修正，請看欄位下方的提示。',
      'error',
      'patient-submit-status'
    );
    return;
  }
  // 告知草稿的 UI 閱讀 gate 與「測試資料留在本機」確認是兩件事，分開勾也
  // 分開報錯。正式政策版本、法律依據與接受證據仍待 D-003。
  if (!elements['privacy-consent'].checked) {
    elements['privacy-consent-error'].textContent =
      '請先閱讀個人資料蒐集告知草稿並勾選確認。';
    elements['privacy-consent-error'].hidden = false;
    elements['privacy-consent'].focus();
    message(
      '尚未送出：請先閱讀個人資料蒐集告知草稿並勾選確認。',
      'error',
      'patient-submit-status'
    );
    return;
  }
  if (!elements['synthetic-confirmation'].checked) {
    // 錯誤必須以文字說明，不能只默默移動焦點——那看起來像按了沒反應。
    elements['synthetic-confirmation-error'].textContent =
      '請勾選此項才能送出：確認資料只保存在這台裝置的瀏覽器。';
    elements['synthetic-confirmation-error'].hidden = false;
    elements['synthetic-confirmation'].focus();
    message(
      '尚未送出：請先勾選資料保存的確認項目。',
      'error',
      'patient-submit-status'
    );
    return;
  }

  const submitButton = elements['confirm-patient-booking'];
  await runUiAction({
    control: submitButton,
    pendingLabel: '送出中…',
    pendingMessage: '正在送出預約，請稍候。',
    anchorId: 'patient-submit-status',
    action: () =>
      apiClient.request('/bookings', {
        method: 'POST',
        body: JSON.stringify({
          slotId: selectedSlotId,
          patient: patientInput(),
          bookingKind: selectedBookingType,
          // 患者端一次只選一個項目（那一步是兩張大卡片，不是清單）；工作臺的
          // 建立表單才是可複選的（W5）。送出的形狀一致，都是陣列。
          itemIds: [selectedServiceId],
          // 患者自述的欄位（P7／P9）。與櫃台的 noteTags／noteText 分開送，
          // 由 appointment-domain 各自驗證各自的清單。
          requestTags: checkedTagIds(
            'patient-request-tags',
            'data-request-tag'
          ),
          sourceTags: checkedTagIds('patient-source-tags', 'data-source-tag'),
          referrerName: elements['patient-referrer'].value,
          patientNote: elements['patient-note'].value,
          origin: 'patient'
        })
      }),
    onSuccess: (nextState) => {
      state = nextState;
      // A cancelled or no-show appointment keeps its original slotId even
      // after release, so only the live reservation identifies this result.
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
      elements['booking-complete-reminder'].hidden = false;
      elements['booking-result'].innerHTML =
        `<strong>預約編號：${escapeHtml(appointment.id)}</strong><span>${escapeHtml(formatFullDate(appointment.startsAt))} ${escapeHtml(formatTime(appointment.startsAt))} · ${escapeHtml(appointment.itemLabel)}</span>`;
      renderAll();
      showStep(4);
      message(`預約已建立：${appointment.id}。`, 'success');
    },
    failureMessage: (error) => `未送出預約：${error.message}`
  });
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
  if (
    !(await confirmDialog('確定提出此預約的取消要求？實際取消由櫃台確認。', {
      confirmLabel: '提出取消'
    }))
  )
    return;
  const appointmentId = button.dataset.patientCancel;
  await runUiAction({
    control: button,
    pendingLabel: '送出中…',
    pendingMessage: '正在送出取消要求，請稍候。',
    action: () =>
      apiClient.request(`/bookings/${appointmentId}/cancellation`, {
        method: 'POST',
        body: JSON.stringify({ origin: 'patient' })
      }),
    onSuccess: (nextState) => {
      state = nextState;
      if (appointmentId === completedAppointmentId) {
        elements['booking-complete-mark'].textContent = '↻';
        elements['booking-complete-eyebrow'].textContent =
          'CANCELLATION REQUESTED';
        elements['booking-complete-heading'].textContent = '取消要求已送出';
        elements['booking-complete-description'].textContent =
          '診所櫃台確認後才會釋放時段。';
        // 已提出取消就沒有門診可提醒了，行事曆警語必須跟著收起來，
        // 否則畫面會同時說「取消要求已送出」與「記得加入行事曆」。
        elements['booking-complete-reminder'].hidden = true;
        elements['booking-result'].innerHTML =
          `<strong>預約編號：${escapeHtml(completedAppointmentId)}</strong><span>狀態：取消待診所確認</span>`;
      }
      renderAppointments();
      message('取消要求已記錄，等待櫃台確認。', 'success');
    }
  });
});

document.querySelector('.skip-link').addEventListener('click', (event) => {
  event.preventDefault();
  window.location.hash = 'patient-main';
  elements['patient-main'].focus({ preventScroll: true });
});

// 鍵名從 state-schema 匯入，不再抄一份字串：SCHEMA_VERSION 一改，抄本就會對不
// 上，而症狀是「另一個分頁改了資料這裡卻不更新」——沒有錯誤、沒有紅字，只是靜
// 靜地不同步（v4→v5 當下就發生了）。
window.addEventListener('storage', async (event) => {
  if (event.key !== storageKey) return;
  state = await apiClient.request('/state');
  renderAll();
  if (state.maintenanceActive)
    message('預約系統已進入維護，請稍後再試。', 'info');
});

if (isOnline) {
  document.querySelector('.environment-badge').lastChild.textContent =
    'ONLINE PREVIEW';
  for (const link of document.querySelectorAll('[data-local-only-link]'))
    link.setAttribute('hidden', '');
  elements['patient-env-boundary'].textContent =
    '公開網址持有人可存取 · 資料只保存在本機瀏覽器';
}

// 不依賴資料的內容先畫（但停用）：看診項目與看診類型是常數，沒有理由等一次
// 往返。等資料回來才畫，第一步的選項會在載入完成的那一刻突然長出來，把底下
// 整段往下推——這正是效能預算裡 CLS 那條在量的東西（修正前實測 0.28，遠超
// 0.1 的良好界線）。先畫佔住版面、載入完成才啟用，兩個問題一起解決。
renderServices();
renderBookingTypeButtons();
// 標籤是常數，只畫一次：重畫會清掉使用者已經勾好的選擇。
renderPatientTags();
syncReferrerField();
syncIdentityDocumentField();

try {
  state = await apiClient.request('/state');
  dataReady = true;
  renderAll();
  // 初始載入不搶焦點，使用者可能正要用鍵盤操作跳過導覽。
  if (!state.maintenanceActive) {
    showStep(1, { focusHeading: false, scroll: false });
    message('已載入診所發布的門診時段。', 'success');
    // 放在載入成功之後：`?notice-read=1` 的公告要蓋掉上面那句，讓使用者知道
    // 已套用測試用閱讀確認，同時明說系統沒有保存正式同意紀錄。
    applyNoticeReadFromUrl();
  }
} catch (error) {
  message(
    error instanceof Error ? error.message : '無法載入預約資料。',
    'error'
  );
}
