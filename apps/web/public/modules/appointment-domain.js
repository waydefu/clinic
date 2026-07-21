import { SYNTHETIC_PATIENTS } from './constants.js';
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
function syntheticPatient(patientId) {
  return SYNTHETIC_PATIENTS.find((patient) => patient.id === patientId);
}
export function createBooking(state, input, actorId) {
  const slot = state.slots.find((item) => item.id === input.slotId);
  if (slot === undefined || slot.reservationId !== undefined)
    throw new Error('合成時段已無法預約。');
  if (syntheticPatient(input.patientId) === undefined)
    throw new Error('只能使用預先定義的合成患者。');
  const bookingType =
    input.bookingType === 'follow_up' ? 'follow_up' : 'initial';
  let sourceFollowUp;
  if (bookingType === 'follow_up') {
    sourceFollowUp = state.followUps.find(
      (item) =>
        item.appointmentId === input.sourceFollowUpId &&
        item.patientId === input.patientId &&
        item.status === 'required' &&
        item.scheduledAppointmentId === undefined
    );
    if (sourceFollowUp === undefined)
      throw new Error('找不到可使用的合成回診決定。');
  }
  const suffix = String(state.sequence).padStart(3, '0');
  const appointmentId = `appointment_test_${suffix}`;
  const now = new Date().toISOString();
  const appointment = {
    id: appointmentId,
    slotId: slot.id,
    patientId: input.patientId,
    serviceId: state.serviceId,
    bookingType,
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
}
export function transitionAppointment(state, appointmentId, action, actorId) {
  const appointment = state.appointments.find(
    (item) => item.id === appointmentId
  );
  if (appointment === undefined) throw new Error('找不到合成預約。');
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
      throw new Error('只有預約成立狀態可完成到診。');
    appointment.status = 'completed';
    appointment.completedAt = now;
    appendAudit(state, 'appointment_completed', appointmentId, actorId);
  } else throw new Error('不支援的合成預約動作。');
  appointment.updatedAt = now;
  appendOutbox(state, appointment);
}
export function recordFollowUp(state, appointmentId, status, dueDate, actorId) {
  const appointment = state.appointments.find(
    (item) => item.id === appointmentId
  );
  if (appointment === undefined || appointment.status !== 'completed')
    throw new Error('只有已完成到診可記錄回診決定。');
  if (!['required', 'not_required'].includes(status))
    throw new Error('回診狀態無效。');
  if (status === 'required' && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate ?? ''))
    throw new Error('需要回診時必須設定目標日期。');
  const now = new Date().toISOString();
  const existing = state.followUps.find(
    (item) => item.appointmentId === appointmentId
  );
  const next = {
    appointmentId,
    patientId: appointment.patientId,
    status,
    ...(status === 'required' ? { dueDate } : {}),
    decidedBy: actorId,
    decidedAt: now,
    ...(existing?.scheduledAppointmentId === undefined
      ? {}
      : { scheduledAppointmentId: existing.scheduledAppointmentId })
  };
  if (existing === undefined) state.followUps.push(next);
  else Object.assign(existing, next);
  appendAudit(state, 'follow_up_decided', appointmentId, actorId);
}
