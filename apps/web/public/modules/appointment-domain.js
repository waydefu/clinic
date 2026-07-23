import {
  ACTIVE_BOOKING_STATUSES,
  BOOKING_KINDS,
  BOOKING_NOTE_TAGS,
  FOLLOW_UP_NOTE_TAGS,
  PATIENT_SERVICES,
  WORKBENCH_PROCEDURES
} from './constants.js';
import {
  ensureReschedulable,
  ensureSlotBookable,
  ensureTransitionAllowed,
  ensureWithinActiveBookingLimit
} from './domain-rules.js';
import { identityKey, upsertPatient } from './patient-registry.js';
import { followUpDueTimes } from './schedule-engine.js';
import { taipeiIso } from './taipei-time.js';
import {
  calendarEventIdForAppointment,
  calendarEventIdForFollowUp
} from '../vendor/domain/index.js';

const MAX_NOTE_LENGTH = 120;
const MAX_CERTIFICATE_COPIES = 10;

function appendAudit(state, action, appointmentId, actorId) {
  state.auditEvents.push({
    id: `audit_${appointmentId}_${action}_${Date.now()}`,
    action,
    appointmentId,
    actorId,
    occurredAt: new Date().toISOString()
  });
}

function appendOutbox(state, appointment) {
  state.outboxJobs.push({
    id: `outbox_${appointment.id}_${appointment.status}_${Date.now()}`,
    type: 'calendar_projection_requested',
    appointmentId: appointment.id,
    appointmentStatus: appointment.status,
    // 預覽的投影意圖不會真的送到日曆，但鍵仍由共用產生器產生：格式只有
    // 一個來源，預覽看到的就是正式路徑會用的鍵（ADR-0002、ADR-0004）。
    idempotencyKey: calendarEventIdForAppointment(appointment.id),
    status: 'pending'
  });
}

// 以下兩個函式是**合成示範**：工作臺不真的呼叫 Google。權威的重試、退避、
// 死信與冪等在 apps/worker（Emulator 已驗證）；這裡只把操作者會用到的兩個
// 動作畫出來——一次同步的成敗，以及死信的重新排入。
export function simulateCalendarSync(state, fail, actorId) {
  const pending = state.outboxJobs.filter((job) => job.status === 'pending');
  if (pending.length === 0) throw new Error('目前沒有待同步的日曆投影工作。');
  for (const job of pending) {
    if (fail) {
      job.status = 'dead_letter';
      job.needsOperator = true;
      job.lastError = '合成失敗：外部日曆連續失敗，已進入死信。';
      appendAudit(
        state,
        'calendar_projection_dead_lettered',
        job.appointmentId,
        actorId
      );
    } else {
      job.status = 'completed';
      delete job.needsOperator;
      delete job.lastError;
      appendAudit(
        state,
        'calendar_projection_synced',
        job.appointmentId,
        actorId
      );
    }
  }
  return pending.length;
}

export function requeueOutboxJob(state, jobId, actorId) {
  const job = state.outboxJobs.find((item) => item.id === jobId);
  if (job === undefined) throw new Error('找不到這筆日曆投影工作。');
  // 只作用於死信，對映 apps/worker 的 requeue：正在跑或已完成的工作不可人工插手。
  if (job.status !== 'dead_letter')
    throw new Error('只有死信工作可以重新排入。');
  job.status = 'pending';
  job.needsOperator = false;
  job.requeuedBy = actorId;
  job.requeuedAt = new Date().toISOString();
  delete job.lastError;
  appendAudit(
    state,
    'calendar_projection_requeued',
    job.appointmentId,
    actorId
  );
}

function optionalNote(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length > MAX_NOTE_LENGTH)
    throw new Error(`備註不可超過 ${MAX_NOTE_LENGTH} 個字元。`);
  return text;
}

function selectedTags(value, allowed, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${label}格式不正確。`);
  const ids = new Set(allowed.map((tag) => tag.id));
  for (const tag of value) {
    if (!ids.has(tag)) throw new Error(`${label}包含未定義的選項。`);
  }
  return [...new Set(value)];
}

function certificateCopies(value) {
  if (value === undefined || value === '' || value === null) return 0;
  const copies = Number(value);
  if (
    !Number.isInteger(copies) ||
    copies < 0 ||
    copies > MAX_CERTIFICATE_COPIES
  )
    throw new Error(`診斷書份數必須是 0 至 ${MAX_CERTIFICATE_COPIES} 的整數。`);
  return copies;
}

function resolveItem(input) {
  const catalogue = [...PATIENT_SERVICES, ...WORKBENCH_PROCEDURES];
  const item = catalogue.find((entry) => entry.id === input);
  if (item === undefined) throw new Error('請選擇看診項目。');
  return item;
}

export function activeBookingsFor(state, patient) {
  const key = identityKey(patient);
  return state.appointments.filter((appointment) => {
    if (!ACTIVE_BOOKING_STATUSES.includes(appointment.status)) return false;
    const owner = state.patients.find(
      (item) => item.id === appointment.patientId
    );
    return owner !== undefined && identityKey(owner) === key;
  });
}

export function createBooking(state, input, actorId) {
  const slot = state.slots.find((item) => item.id === input.slotId);

  const bookingKind =
    input.bookingKind === BOOKING_KINDS.FOLLOW_UP
      ? BOOKING_KINDS.FOLLOW_UP
      : BOOKING_KINDS.INITIAL;

  // 時段可預約與掛號別相符：規則由共用斷言決定（ADR-0004）。
  ensureSlotBookable(slot, bookingKind);

  const item = resolveItem(input.itemId);
  const noteTags = selectedTags(input.noteTags, BOOKING_NOTE_TAGS, '備註');
  const noteText = optionalNote(input.noteText);

  // Check the duplicate limit against the submitted identity before the
  // patient record is created, so a repeat attempt cannot slip through by
  // registering first and colliding second.
  const patientDetails = { ...input.patient };
  const active = activeBookingsFor(state, patientDetails);
  if (input.allowDuplicate !== true)
    ensureWithinActiveBookingLimit(active.length);

  const patient = upsertPatient(state, patientDetails);

  let sourceFollowUp;
  if (bookingKind === BOOKING_KINDS.FOLLOW_UP && input.origin === 'patient') {
    sourceFollowUp = state.followUps.find(
      (entry) =>
        entry.patientId === patient.id &&
        entry.status === 'required' &&
        entry.scheduledAppointmentId === undefined
    );
    if (sourceFollowUp === undefined)
      throw new Error('目前沒有已確認的回診安排，請聯絡櫃台。');
  }

  const suffix = String(state.sequence).padStart(3, '0');
  const appointmentId = `appointment_${suffix}`;
  const now = new Date().toISOString();
  const appointment = {
    id: appointmentId,
    slotId: slot.id,
    startsAt: slot.startsAt,
    patientId: patient.id,
    bookingKind,
    itemId: item.id,
    itemLabel: item.label,
    noteTags,
    noteText,
    status: 'confirmed',
    createdAt: now,
    updatedAt: now,
    ...(sourceFollowUp === undefined
      ? {}
      : { sourceFollowUpId: sourceFollowUp.appointmentId })
  };
  slot.reservationId = appointmentId;
  state.appointments.push(appointment);
  if (sourceFollowUp !== undefined)
    sourceFollowUp.scheduledAppointmentId = appointmentId;
  appendAudit(state, 'appointment_confirmed', appointmentId, actorId);
  appendOutbox(state, appointment);
  state.sequence += 1;
  return appointment;
}

export function transitionAppointment(state, appointmentId, action, actorId) {
  const appointment = state.appointments.find(
    (item) => item.id === appointmentId
  );
  if (appointment === undefined) throw new Error('找不到這筆預約。');
  const slot = state.slots.find((item) => item.id === appointment.slotId);
  const now = new Date().toISOString();

  const TRANSITIONS = {
    request_cancellation: 'request_cancellation',
    cancel: 'cancel',
    complete: 'complete',
    no_show: 'no_show'
  };
  if (TRANSITIONS[action] === undefined) throw new Error('不支援的預約動作。');

  // 是否允許這個轉換由共用斷言決定（ADR-0004）。之後的狀態寫入、時段釋出
  // 與稽核是瀏覽器端的機制，維持原樣。
  ensureTransitionAllowed(action, appointment.status);

  if (action === 'request_cancellation') {
    appointment.status = 'cancellation_requested';
    appendAudit(state, 'cancellation_requested', appointmentId, actorId);
  } else if (action === 'cancel') {
    appointment.status = 'cancelled';
    if (slot?.reservationId === appointmentId) delete slot.reservationId;
    appendAudit(state, 'appointment_cancelled', appointmentId, actorId);
  } else if (action === 'complete') {
    appointment.status = 'completed';
    appointment.completedAt = now;
    appendAudit(state, 'appointment_completed', appointmentId, actorId);
  } else {
    appointment.status = 'no_show';
    if (slot?.reservationId === appointmentId) delete slot.reservationId;
    appendAudit(state, 'appointment_no_show', appointmentId, actorId);
  }

  appointment.updatedAt = now;
  appendOutbox(state, appointment);
  return appointment;
}

export function rescheduleAppointment(
  state,
  appointmentId,
  targetSlotId,
  actorId
) {
  const appointment = state.appointments.find(
    (item) => item.id === appointmentId
  );
  if (appointment === undefined) throw new Error('找不到這筆預約。');

  const target = state.slots.find((item) => item.id === targetSlotId);
  // 改期規則（狀態尚未結束、目標時段可預約、不可跨掛號別、不可原地）由共用
  // 斷言決定（ADR-0004）。
  ensureReschedulable(
    appointment.status,
    appointment.slotId,
    target,
    appointment.bookingKind
  );

  const previous = state.slots.find((item) => item.id === appointment.slotId);
  if (previous?.reservationId === appointmentId) delete previous.reservationId;
  target.reservationId = appointmentId;
  appointment.slotId = target.id;
  appointment.startsAt = target.startsAt;
  appointment.status = 'confirmed';
  appointment.updatedAt = new Date().toISOString();
  appendAudit(state, 'appointment_rescheduled', appointmentId, actorId);
  appendOutbox(state, appointment);
  return appointment;
}

/**
 * 修改預約的備註標籤與自填備註。
 *
 * 備註是櫃台的營運註記（當天到、國外客…），與臨床決定無關，因此**不改變
 * 狀態、不動時段、不產生日曆投影**；但仍寫稽核，因為它會影響現場判斷。
 * 已結束（取消／未到）的預約不再修改：那是已經發生的事實。
 */
export function updateAppointmentNotes(state, appointmentId, input, actorId) {
  const appointment = state.appointments.find(
    (item) => item.id === appointmentId
  );
  if (appointment === undefined) throw new Error('找不到這筆預約。');
  if (
    !['confirmed', 'cancellation_requested', 'completed'].includes(
      appointment.status
    )
  )
    throw new Error('已取消或未到的預約不可再修改備註。');

  appointment.noteTags = selectedTags(
    input?.noteTags,
    BOOKING_NOTE_TAGS,
    '備註'
  );
  appointment.noteText = optionalNote(input?.noteText);
  appointment.updatedAt = new Date().toISOString();
  appendAudit(state, 'appointment_notes_updated', appointmentId, actorId);
  return appointment;
}

export function recordFollowUp(state, appointmentId, input, actorId) {
  const appointment = state.appointments.find(
    (item) => item.id === appointmentId
  );
  if (appointment === undefined || appointment.status !== 'completed')
    throw new Error('只有已完成到診可記錄回診決定。');

  const status = input?.status;
  if (!['required', 'not_required'].includes(status))
    throw new Error('回診狀態無效。');
  const dueDate = input?.dueDate;
  const dueTime = input?.dueTime;
  if (status === 'required') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate ?? ''))
      throw new Error('需要回診時必須設定目標日期。');
    // 目標日期與時間必須落在可掛號的回診網格上：未營業日、非 :15/:45、
    // 固定不開放時間都在此擋下，與時段產生共用同一套語意。
    const validTimes = followUpDueTimes(state.schedule, dueDate);
    if (validTimes.length === 0)
      throw new Error('目標日期當天未營業，請改選有門診的日期。');
    if (!validTimes.includes(dueTime ?? ''))
      throw new Error('目標時間不在當天的回診可掛號時間內。');
  }

  const tags = selectedTags(input?.tags, FOLLOW_UP_NOTE_TAGS, '回診項目');
  const noteText = optionalNote(input?.noteText);
  const copies = certificateCopies(input?.certificateCopies);

  const now = new Date().toISOString();
  const existing = state.followUps.find(
    (item) => item.appointmentId === appointmentId
  );
  const next = {
    appointmentId,
    patientId: appointment.patientId,
    status,
    ...(status === 'required' ? { dueDate, dueTime } : {}),
    tags,
    noteText,
    certificateCopies: copies,
    decidedBy: actorId,
    decidedAt: now,
    ...(existing?.scheduledAppointmentId === undefined
      ? {}
      : { scheduledAppointmentId: existing.scheduledAppointmentId })
  };
  if (existing === undefined) state.followUps.push(next);
  else Object.assign(existing, next);
  appendAudit(state, 'follow_up_decided', appointmentId, actorId);

  // 回診確認後「上日曆」：回診提醒是與原就診分開的另一個事件（見
  // calendarEventIdForFollowUp）。每次記錄先移除同一來源的舊回診投影，
  // 再依最新決定重建——需要回診就排一筆、改成不需要就不留。
  state.outboxJobs = state.outboxJobs.filter(
    (job) => job.followUpSourceId !== appointmentId
  );
  if (status === 'required') {
    state.outboxJobs.push({
      id: `outbox_followup_${appointmentId}_${Date.now()}`,
      type: 'calendar_projection_requested',
      appointmentId,
      appointmentStatus: 'follow_up_required',
      followUpSourceId: appointmentId,
      startsAt: taipeiIso(dueDate, dueTime),
      idempotencyKey: calendarEventIdForFollowUp(appointmentId),
      status: 'pending'
    });
  }
  return next;
}

// 預約清單依看診時間排序：尚未發生的由近到遠在前，已過去的在後。
export function sortedAppointments(state, now = Date.now()) {
  return [...state.appointments].sort((left, right) => {
    const leftTime = new Date(left.startsAt ?? left.createdAt).getTime();
    const rightTime = new Date(right.startsAt ?? right.createdAt).getTime();
    const leftPast = leftTime < now;
    const rightPast = rightTime < now;
    if (leftPast !== rightPast) return leftPast ? 1 : -1;
    return leftPast ? rightTime - leftTime : leftTime - rightTime;
  });
}
