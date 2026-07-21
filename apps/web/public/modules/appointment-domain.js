import {
  ACTIVE_BOOKING_LIMIT,
  ACTIVE_BOOKING_STATUSES,
  BOOKING_KINDS,
  BOOKING_NOTE_TAGS,
  FOLLOW_UP_NOTE_TAGS,
  PATIENT_SERVICES,
  WORKBENCH_PROCEDURES
} from './constants.js';
import { identityKey, upsertPatient } from './patient-registry.js';

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
    idempotencyKey: `preview_${appointment.status}_${appointment.id}`,
    status: 'pending'
  });
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
  if (slot === undefined || slot.reservationId !== undefined)
    throw new Error('此時段已無法預約。');

  const bookingKind =
    input.bookingKind === BOOKING_KINDS.FOLLOW_UP
      ? BOOKING_KINDS.FOLLOW_UP
      : BOOKING_KINDS.INITIAL;
  if (slot.kind !== bookingKind)
    throw new Error(
      bookingKind === BOOKING_KINDS.FOLLOW_UP
        ? '回診請選擇 15 分或 45 分的時段。'
        : '初診請選擇整點或 30 分的時段。'
    );

  const item = resolveItem(input.itemId);
  const noteTags = selectedTags(input.noteTags, BOOKING_NOTE_TAGS, '備註');
  const noteText = optionalNote(input.noteText);

  // Check the duplicate limit against the submitted identity before the
  // patient record is created, so a repeat attempt cannot slip through by
  // registering first and colliding second.
  const patientDetails = { ...input.patient };
  const active = activeBookingsFor(state, patientDetails);
  if (active.length >= ACTIVE_BOOKING_LIMIT && input.allowDuplicate !== true)
    throw new Error(
      `同一位患者同時只能有 ${ACTIVE_BOOKING_LIMIT} 筆未完成的預約，請先完成或取消現有預約。`
    );

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

  if (action === 'request_cancellation') {
    if (appointment.status !== 'confirmed')
      throw new Error('目前狀態無法提出取消。');
    appointment.status = 'cancellation_requested';
    appendAudit(state, 'cancellation_requested', appointmentId, actorId);
  } else if (action === 'cancel') {
    if (!['confirmed', 'cancellation_requested'].includes(appointment.status))
      throw new Error('目前狀態無法取消。');
    appointment.status = 'cancelled';
    if (slot?.reservationId === appointmentId) delete slot.reservationId;
    appendAudit(state, 'appointment_cancelled', appointmentId, actorId);
  } else if (action === 'complete') {
    if (appointment.status !== 'confirmed')
      throw new Error('只有預約成立狀態可標記到診。');
    appointment.status = 'completed';
    appointment.completedAt = now;
    appendAudit(state, 'appointment_completed', appointmentId, actorId);
  } else if (action === 'no_show') {
    if (!['confirmed', 'cancellation_requested'].includes(appointment.status))
      throw new Error('目前狀態無法標記未到。');
    appointment.status = 'no_show';
    if (slot?.reservationId === appointmentId) delete slot.reservationId;
    appendAudit(state, 'appointment_no_show', appointmentId, actorId);
  } else throw new Error('不支援的預約動作。');

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
  if (!['confirmed', 'cancellation_requested'].includes(appointment.status))
    throw new Error('只有尚未結束的預約可以改期。');

  const target = state.slots.find((item) => item.id === targetSlotId);
  if (target === undefined || target.reservationId !== undefined)
    throw new Error('目標時段已無法預約。');
  if (target.kind !== appointment.bookingKind)
    throw new Error('改期後的時段必須與原掛號別相同。');

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
  if (status === 'required' && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate ?? ''))
    throw new Error('需要回診時必須設定目標日期。');

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
    ...(status === 'required' ? { dueDate } : {}),
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
