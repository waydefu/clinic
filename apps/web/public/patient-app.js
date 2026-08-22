// Trusted Types 的 default policy。必須第一個匯入：它要在任何模組
// 有機會寫 innerHTML 之前就註冊好。
import './modules/trusted-html.js';
import {
  BOOKING_KIND_LABELS,
  CLINIC,
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
import {
  PATIENT_LOOKUP_ERROR,
  patientCancellationEligibility
} from './modules/patient-booking-management.js';
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
const bookingResultPanel = document.querySelector('[data-booking-result]');

let state;
let selectedBookingType = 'initial';
let selectedServiceId;
let selectedSlotId;
let completedAppointmentId;
let completedAppointment;
let activeSlotDate;
let activeSlotMonth;
let bookingLookupMode = 'phone';
let managedAppointments = [];
let lastLookupVerification;
let bookingManagementReturnFocus;
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
  bookingResultPanel.hidden = true;
  document.body.dataset.bookingFlowStep = String(step);
  elements['patient-hero'].hidden = step !== 1;
  elements['patient-preview-warning'].hidden = step !== 1;
  // 第二、三步已經由步驟標題與就地錯誤提供視覺回饋；頂端 aria-live 留在
  // 無障礙樹中播報即可，不再用兩條重複訊息把主要操作往下推。
  elements['patient-status'].classList.toggle('visually-hidden', step !== 1);
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

function showBookingResult() {
  elements['patient-hero'].hidden = true;
  panels.forEach((panel) => {
    panel.hidden = true;
  });
  indicators.forEach((indicator) => {
    indicator.classList.remove('is-active');
    indicator.classList.add('is-complete');
    indicator.removeAttribute('aria-current');
  });
  bookingResultPanel.hidden = false;
  elements['booking-complete-heading'].setAttribute('tabindex', '-1');
  elements['booking-complete-heading'].focus({ preventScroll: true });
  bookingResultPanel.scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'auto'
      : 'smooth',
    block: 'start'
  });
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

function clinicHoursSummary() {
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
  return lines.length > 0
    ? `門診時間：${lines.join('；')}`
    : '目前未開放門診時間';
}

function renderHours() {
  const summary = clinicHoursSummary();
  elements['patient-hours-summary'].textContent = summary;
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

const patientContactIcons = Object.freeze({
  電話: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3h3l1.5 4-2 1.5a15 15 0 0 0 6 6l1.5-2 4 1.5v3a4 4 0 0 1-4 4C9.3 20.2 3.8 14.7 3 7a4 4 0 0 1 4-4Z"/></svg>',
  LINE: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11.5c0 4.1-3.8 7.5-8.5 7.5-.8 0-1.7-.1-2.4-.3L5 21l1.2-3.5C4.2 16.1 3 13.9 3 11.5 3 7.4 6.8 4 11.5 4S20 7.4 20 11.5Z"/><path d="M7.5 10v3h1.7m1-3v3m1.2-3v3m0-3 2 3v-3m1.2 0h2v3h-2m0-1.5h1.6"/></svg>',
  Instagram:
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>',
  Messenger:
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.5 8.5 0 0 1-12.4 7.6L4 21l1.2-4A8.5 8.5 0 1 1 21 11.5Z"/><path d="m8 14 3-3 2 2 3-3"/></svg>',
  Facebook:
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M13.5 20v-7h2.4l.4-3h-2.8V8.5c0-.9.3-1.5 1.6-1.5h1.4V4.3c-.5-.1-1.3-.2-2.2-.2-2.3 0-3.8 1.4-3.8 4V10H8v3h2.5v7"/></svg>'
});

function patientContactIcon(label, { round = false } = {}) {
  const icon = patientContactIcons[label] ?? '';
  if (!round) return icon;
  return icon
    .replace(
      'viewBox="0 0 24 24" width="20" height="20"',
      'viewBox="-12 -12 48 48" width="48" height="48"'
    )
    .replace('stroke="currentColor"', 'stroke="var(--forest-dark)"')
    .replace(
      'aria-hidden="true">',
      'aria-hidden="true"><circle cx="12" cy="12" r="23" fill="var(--surface)" stroke="var(--line-strong)"/>'
    );
}

function renderPatientContactLinks() {
  const compact = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const socialLinks = CLINIC.socialLinks
    .map(({ label, href }) =>
      compact
        ? `<a class="brand patient-contact-link" href="${escapeHtml(href)}" target="_blank" rel="noreferrer" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">${patientContactIcon(label, { round: true })}</a>`
        : `<a class="button button-secondary patient-contact-link" href="${escapeHtml(href)}" target="_blank" rel="noreferrer" aria-label="${escapeHtml(label)}">${patientContactIcon(label)}&nbsp;<span>${escapeHtml(label)}</span></a>`
    )
    .join('');
  const socialLayout = compact
    ? 'booking-social-fallback patient-contact-socials'
    : 'patient-contact-grid patient-contact-socials';
  elements['patient-contact-options'].innerHTML =
    `<strong>需要其他協助？</strong><p>急事請直接來電；社群訊息可能無法即時回覆，也不會自動送出或更改預約。</p><a class="button button-primary patient-contact-link patient-contact-phone" href="${escapeHtml(CLINIC.phoneHref)}">${patientContactIcon('電話')}&nbsp;<span>${escapeHtml(CLINIC.phoneDisplay)}</span></a><span>其他聯絡方式</span><div class="${socialLayout}" data-contact-layout="${compact ? 'compact' : 'labeled'}" aria-label="其他聯絡方式">${socialLinks}</div>`;
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
}

function renderDayGroup(group) {
  const periods = [
    { label: '上午', accepts: (hour) => hour < 12 },
    { label: '中午', accepts: (hour) => hour >= 12 && hour < 17 },
    { label: '晚間', accepts: (hour) => hour >= 17 }
  ];
  return periods
    .map(({ label, accepts }) => {
      const slots = group.slots.filter((slot) =>
        accepts(Number(formatTime(slot.startsAt).slice(0, 2)))
      );
      if (slots.length === 0) return '';
      const buttons = slots
        .map((slot) => {
          const selected = slot.id === selectedSlotId;
          return `<button class="slot-chip${selected ? ' is-selected' : ''}" type="button" data-patient-slot="${escapeHtml(slot.id)}" aria-pressed="${selected}">${escapeHtml(formatTime(slot.startsAt))}${selected ? '<span class="slot-chip-mark" aria-hidden="true">✓</span>' : ''}</button>`;
        })
        .join('');
      return `<section class="slot-period" aria-label="${label}時段"><h4>${label}</h4><div class="slot-chip-row">${buttons}</div></section>`;
    })
    .join('');
}

function monthLabel(monthKey) {
  const [year, month] = monthKey.split('-');
  return `${year} 年 ${Number(month)} 月`;
}

function compactDateLabel(dateKey) {
  const [, month, day] = dateKey.split('-');
  const weekday = new Date(`${dateKey}T12:00:00Z`).getUTCDay();
  return {
    weekday: WEEKDAY_LABELS[weekday],
    date: `${Number(month)}/${Number(day)}`
  };
}

function renderSlots() {
  renderBookingContext();
  const slots = availableSlots();
  elements['slot-choice-description'].textContent =
    selectedBookingType === 'follow_up'
      ? '回診開放每小時 15 分與 45 分，時間以 Asia/Taipei（台北時間）顯示。'
      : '初診開放整點與 30 分，時間以 Asia/Taipei（台北時間）顯示。';

  const groups = groupSlotsByDate(slots);

  if (groups.length === 0) {
    activeSlotDate = undefined;
    activeSlotMonth = undefined;
    elements['patient-slot-months'].replaceChildren();
    elements['patient-slot-dates'].replaceChildren();
    elements['active-slot-date-label'].textContent = '目前沒有可預約日期';
    elements['patient-slots'].innerHTML = emptyState(
      '目前沒有可預約時段',
      '診所發布新的營業時間後，時段會自動更新。'
    );
    return;
  }

  const months = [...new Set(groups.map((group) => group.key.slice(0, 7)))];
  if (!months.includes(activeSlotMonth))
    activeSlotMonth = activeSlotDate?.slice(0, 7) ?? months[0];
  const monthGroups = groups.filter((group) =>
    group.key.startsWith(activeSlotMonth)
  );
  if (!monthGroups.some((group) => group.key === activeSlotDate))
    activeSlotDate = monthGroups[0].key;
  elements['patient-slot-months'].innerHTML = months
    .map((month) => {
      const selected = month === activeSlotMonth;
      return `<button class="patient-slot-month" type="button" role="tab" data-slot-month="${escapeHtml(month)}" aria-selected="${selected}" tabindex="${selected ? '0' : '-1'}">${escapeHtml(monthLabel(month))}</button>`;
    })
    .join('');
  elements['patient-slot-dates'].innerHTML = monthGroups
    .map((group) => {
      const selected = group.key === activeSlotDate;
      const label = compactDateLabel(group.key);
      return `<button class="patient-slot-date" type="button" role="tab" data-slot-date="${escapeHtml(group.key)}" aria-label="${escapeHtml(group.label)}，${group.slots.length} 個時段" aria-selected="${selected}" tabindex="${selected ? '0' : '-1'}"><strong>${escapeHtml(label.weekday)}</strong><span>${escapeHtml(label.date)}</span><small>${group.slots.length} 個時段${selected ? ' · ✓ 已選' : ''}</small></button>`;
    })
    .join('');
  const active = groups.find((group) => group.key === activeSlotDate);
  elements['active-slot-date-label'].textContent =
    `${active.label} · ${active.slots.length} 個可預約時段`;
  elements['patient-slots'].innerHTML = renderDayGroup(active);
}

function selectedService() {
  return PATIENT_SERVICES.find((service) => service.id === selectedServiceId);
}

function renderConfirmation() {
  const slot = state.slots.find((item) => item.id === selectedSlotId);
  if (slot === undefined) return;
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
      cancellation_requested: '取消處理中'
    }[status] ?? status
  );
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
}

document.querySelectorAll('[data-booking-type]').forEach((button) =>
  button.addEventListener('click', () => {
    const type = button.dataset.bookingType;
    if (type === 'follow_up' && latestFollowUp() === undefined) {
      message('目前沒有已由醫師確認、且尚未安排的回診需求。', 'error');
      return;
    }
    selectedBookingType = type;
    // 換看診類型等於換一批時段，回到該類型的第一個可預約日期。
    activeSlotDate = undefined;
    activeSlotMonth = undefined;
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
  const button = event.target.closest('[data-patient-slot]');
  if (button === null) return;
  selectedSlotId = button.dataset.patientSlot;
  renderSlots();
  renderConfirmation();
  showStep(3);
});

elements['patient-slot-dates'].addEventListener('click', (event) => {
  const button = event.target.closest('[data-slot-date]');
  if (button === null) return;
  activeSlotDate = button.dataset.slotDate;
  renderSlots();
});

elements['patient-slot-months'].addEventListener('click', (event) => {
  const button = event.target.closest('[data-slot-month]');
  if (button === null) return;
  activeSlotMonth = button.dataset.slotMonth;
  activeSlotDate = undefined;
  renderSlots();
});

elements['patient-slot-dates'].addEventListener('keydown', (event) => {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  const tabs = [
    ...elements['patient-slot-dates'].querySelectorAll('[data-slot-date]')
  ];
  const current = tabs.indexOf(document.activeElement);
  if (current === -1) return;
  event.preventDefault();
  const offset = event.key === 'ArrowRight' ? 1 : -1;
  const target = tabs[(current + offset + tabs.length) % tabs.length];
  activeSlotDate = target.dataset.slotDate;
  renderSlots();
  elements['patient-slot-dates']
    .querySelector(`[data-slot-date="${activeSlotDate}"]`)
    ?.focus();
});

elements['patient-slot-months'].addEventListener('keydown', (event) => {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  const tabs = [
    ...elements['patient-slot-months'].querySelectorAll('[data-slot-month]')
  ];
  const current = tabs.indexOf(document.activeElement);
  if (current === -1) return;
  event.preventDefault();
  const offset = event.key === 'ArrowRight' ? 1 : -1;
  const target = tabs[(current + offset + tabs.length) % tabs.length];
  activeSlotMonth = target.dataset.slotMonth;
  activeSlotDate = undefined;
  renderSlots();
  elements['patient-slot-months']
    .querySelector(`[data-slot-month="${activeSlotMonth}"]`)
    ?.focus();
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
  void openPolicyDialog({
    onRead: () => {
      elements['privacy-consent'].checked = true;
      elements['privacy-consent-error'].hidden = true;
      elements['privacy-consent-error'].textContent = '';
      updateSubmitState();
      message('已標記為讀過告知草稿；系統未保存正式同意紀錄。', 'success');
    }
  });
});

// P9：勾選來源標籤時同步介紹人欄位的顯示。
elements['patient-source-tags'].addEventListener('change', syncReferrerField);

// P10：勾選「外籍人士」時改問護照。切換時把另一欄清空——留著上一次的輸入，
// 使用者換回來時會看到一個他以為已經刪掉的號碼，而那是身分識別資料。
elements['patient-request-tags'].addEventListener('change', () => {
  syncIdentityDocumentField();
  updateSubmitState();
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
      showBookingResult();
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

function restartBooking() {
  elements['patient-booking-form'].reset();
  touched.clear();
  selectedBookingType = 'initial';
  selectedSlotId = undefined;
  selectedServiceId = undefined;
  activeSlotDate = undefined;
  activeSlotMonth = undefined;
  syncSelectedBookingType();
  syncReferrerField();
  syncIdentityDocumentField();
  renderAll();
  showStep(1);
}

elements['book-another'].addEventListener('click', restartBooking);
elements['booking-restart'].addEventListener('click', restartBooking);

function lookupVerification() {
  return {
    mode: bookingLookupMode,
    birthDate: elements['booking-lookup-birth'].value,
    ...(bookingLookupMode === 'phone'
      ? { phone: elements['booking-lookup-phone'].value }
      : { documentNumber: elements['booking-lookup-document'].value })
  };
}

function renderLookupMode() {
  document.querySelectorAll('[data-booking-lookup-mode]').forEach((button) => {
    const selected = button.dataset.bookingLookupMode === bookingLookupMode;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  const usePhone = bookingLookupMode === 'phone';
  elements['booking-lookup-phone-field'].hidden = !usePhone;
  elements['booking-lookup-document-field'].hidden = usePhone;
  if (usePhone) elements['booking-lookup-document'].value = '';
  else elements['booking-lookup-phone'].value = '';
}

function renderManagedAppointments() {
  elements['booking-lookup-results'].innerHTML = managedAppointments
    .map((appointment) => {
      const eligibility = patientCancellationEligibility(
        appointment,
        Date.now()
      );
      const status = statusLabel(appointment.status);
      const action = eligibility.allowed
        ? `<button class="button button-primary" type="button" data-managed-cancel="${escapeHtml(appointment.id)}">取消這筆預約</button>`
        : ['phone_required', 'time_unavailable'].includes(eligibility.code)
          ? cancellationContactFallback()
          : '';
      return `<article class="booking-lookup-card"><div class="booking-lookup-card-heading"><strong>${escapeHtml(formatFullDate(appointment.startsAt))} ${escapeHtml(formatTime(appointment.startsAt))}</strong><span class="status-chip status-${escapeHtml(appointment.status)}">${escapeHtml(status)}</span></div><span>${escapeHtml(BOOKING_KIND_LABELS[appointment.bookingKind] ?? '')} · ${escapeHtml(appointment.itemLabel)}</span><span class="code">預約末碼 ${escapeHtml(appointment.id.slice(-4))}</span>${action}</article>`;
    })
    .join('');
}

function cancellationContactFallback() {
  const social = CLINIC.socialLinks
    .map(
      ({ label, href }) =>
        `<a class="button button-tertiary" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`
    )
    .join('');
  return `<div class="booking-cancel-contact"><strong>距離預約時間不足 20 分鐘，如需取消或更改，建議直接來電診所。</strong><a class="button button-primary booking-phone-fallback" href="${escapeHtml(CLINIC.phoneHref)}">立即撥打 ${escapeHtml(CLINIC.phoneDisplay)}</a><span>其他聯絡方式：</span><div class="booking-social-fallback" aria-label="其他聯絡方式">${social}</div><p class="booking-contact-disclaimer">社群訊息不保證即時回覆；急件請直接來電。以上連結會開啟外部網站，且不會自動取消預約。</p></div>`;
}

function openBookingManagement(trigger) {
  bookingManagementReturnFocus = trigger;
  elements['booking-management-dialog'].showModal();
  elements['booking-management-heading'].setAttribute('tabindex', '-1');
  elements['booking-management-heading'].focus();
}

for (const id of ['booking-management-open', 'booking-result-manage'])
  elements[id].addEventListener('click', (event) =>
    openBookingManagement(event.currentTarget)
  );

elements['booking-management-close'].addEventListener('click', () => {
  elements['booking-management-dialog'].close();
});

elements['booking-management-dialog'].addEventListener('close', () => {
  bookingManagementReturnFocus?.focus({ preventScroll: true });
  bookingManagementReturnFocus = undefined;
});

document.querySelectorAll('[data-booking-lookup-mode]').forEach((button) =>
  button.addEventListener('click', () => {
    bookingLookupMode = button.dataset.bookingLookupMode;
    renderLookupMode();
    const target =
      bookingLookupMode === 'phone'
        ? elements['booking-lookup-phone']
        : elements['booking-lookup-document'];
    target.focus();
  })
);

elements['booking-lookup-form'].addEventListener('submit', async (event) => {
  event.preventDefault();
  const verification = lookupVerification();
  const secondField =
    bookingLookupMode === 'phone'
      ? verification.phone
      : verification.documentNumber;
  if (
    verification.birthDate === '' ||
    String(secondField ?? '').trim() === ''
  ) {
    elements['booking-lookup-status'].hidden = false;
    elements['booking-lookup-status'].dataset.state = 'error';
    elements['booking-lookup-status'].textContent = PATIENT_LOOKUP_ERROR;
    return;
  }
  const control = elements['booking-lookup-form'].querySelector(
    'button[type="submit"]'
  );
  await runUiAction({
    control,
    pendingLabel: '查詢中…',
    pendingMessage: '正在查詢預約。',
    anchorId: 'booking-lookup-status',
    action: () =>
      apiClient.request('/patient/bookings/lookup', {
        method: 'POST',
        body: JSON.stringify(verification)
      }),
    onSuccess: (result) => {
      lastLookupVerification = verification;
      managedAppointments = result.appointments;
      renderManagedAppointments();
      message(
        `找到 ${managedAppointments.length} 筆預約。`,
        'success',
        'booking-lookup-status'
      );
    },
    failureMessage: () => PATIENT_LOOKUP_ERROR
  });
});

elements['booking-lookup-results'].addEventListener('click', async (event) => {
  const button = event.target.closest('[data-managed-cancel]');
  if (button === null || lastLookupVerification === undefined) return;
  const appointment = managedAppointments.find(
    (item) => item.id === button.dataset.managedCancel
  );
  if (appointment === undefined) return;
  const description = `${formatFullDate(appointment.startsAt)} ${formatTime(appointment.startsAt)}，${BOOKING_KIND_LABELS[appointment.bookingKind] ?? ''}，${appointment.itemLabel}`;
  if (
    !(await confirmDialog(`確定取消 ${description}？取消後時段會立即釋出。`, {
      confirmLabel: '確認取消',
      danger: true
    }))
  )
    return;
  await runUiAction({
    control: button,
    pendingLabel: '取消中…',
    pendingMessage: '正在取消預約。',
    anchorId: 'booking-lookup-status',
    action: () =>
      apiClient.request(`/patient/bookings/${appointment.id}/self-cancel`, {
        method: 'POST',
        body: JSON.stringify(lastLookupVerification)
      }),
    onSuccess: (result) => {
      state = result.state;
      managedAppointments = managedAppointments.map((item) =>
        item.id === result.appointment.id ? result.appointment : item
      );
      renderManagedAppointments();
      if (appointment.id === completedAppointmentId) {
        elements['booking-complete-mark'].textContent = '✓';
        elements['booking-complete-eyebrow'].textContent = 'BOOKING CANCELLED';
        elements['booking-complete-heading'].textContent = '預約已取消';
        elements['booking-complete-description'].textContent =
          '取消已完成，原時段已釋出。';
        elements['booking-complete-reminder'].hidden = true;
        elements['booking-result'].innerHTML =
          `<strong>預約末碼：${escapeHtml(completedAppointmentId.slice(-4))}</strong><span>狀態：已取消</span>`;
      }
      renderSlots();
      message('預約已取消，原時段已釋出。', 'success', 'booking-lookup-status');
    },
    failureMessage: (error) =>
      error.message.includes('已取消')
        ? '這筆預約已取消。'
        : '此預約無法線上取消，請來電 02-2577-1314。'
  });
});

renderLookupMode();

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
renderPatientContactLinks();
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
