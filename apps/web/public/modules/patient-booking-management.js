import { isWithinSelfCancelWindow } from '../vendor/domain/appointment-rules.js';
import { resolveReturnCandidate } from '../vendor/domain/patient-identity.js';
import {
  rescheduleAppointment,
  transitionAppointment
} from './appointment-domain.js';
import {
  isUpcomingSlot,
  isWithinSyntheticBookingWindow
} from './schedule-engine.js';

export const PATIENT_LOOKUP_ERROR = '查無符合的可管理預約。';

export class PatientBookingManagementError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PatientBookingManagementError';
    this.code = code;
  }
}

function managementError(code, message = PATIENT_LOOKUP_ERROR) {
  return new PatientBookingManagementError(code, message);
}

function normalizedPhone(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.startsWith('886') ? `0${digits.slice(3)}` : digits;
}

// 回診查詢只有「電話＋月日」一種方式（BOOKING-MINIMIZATION-2026-09-22）。
function normalizedVerification(input) {
  const birthDate = String(input?.birthDate ?? '').trim();
  if (!/^--\d{2}-\d{2}$/.test(birthDate))
    throw managementError('lookup_failed');
  const phone = normalizedPhone(input?.phone);
  if (phone.length < 9) throw managementError('lookup_failed');
  return { birthDate, phone };
}

// 瀏覽器端的舊紀錄保存了完整生日原值，可以合法換算成月日比對；只存雜湊的
// 伺服器舊紀錄不在這裡，也不會被猜。
function storedMonthDay(stored) {
  const value = String(stored ?? '');
  if (/^--\d{2}-\d{2}$/.test(value)) return value;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `--${value.slice(5)}` : '';
}

function patientMatches(patient, verification) {
  return (
    storedMonthDay(patient.birthDate) === verification.birthDate &&
    normalizedPhone(patient.phone) === verification.phone
  );
}

/**
 * 以電話＋月日尋找這位患者的預約。只有唯一一位患者符合時才成立；沒有、或有
 * 好幾位（同一支電話、同月日的家人）都回同一個錯誤，不透露是哪一種。
 * 回傳完整物件只在 request-local state 內使用；UI 取得的是 store 產生的最小摘要。
 */
export function lookupPatientAppointments(state, input) {
  const verification = normalizedVerification(input);
  const patientId = resolveReturnCandidate(
    state.patients
      .filter((patient) => patientMatches(patient, verification))
      .map((patient) => patient.id)
  );
  if (patientId === undefined) throw managementError('lookup_failed');
  const appointments = state.appointments
    .filter((appointment) => appointment.patientId === patientId)
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
  if (appointments.length === 0) throw managementError('lookup_failed');
  return appointments;
}

/**
 * 患者自助取消截止：預約當日 10:00（Asia/Taipei），逾期改來電
 *（Q6／D-005 方向；計算見領域 isWithinSelfCancelWindow）。
 * Synthetic browser preview 以呼叫端傳入的 `nowMs` 做邊界證明。正式服務不可相信
 * 瀏覽器時鐘：必須使用可信伺服器時間；時間不可取得或解析時一律 fail closed。
 */
export function patientCancellationEligibility(appointment, nowMs) {
  if (!Number.isFinite(nowMs))
    return { allowed: false, code: 'time_unavailable' };
  if (appointment.status === 'cancelled')
    return { allowed: false, code: 'already_cancelled' };
  if (!['confirmed', 'cancellation_requested'].includes(appointment.status))
    return { allowed: false, code: 'not_cancelable' };
  try {
    if (!isWithinSelfCancelWindow(appointment.startsAt, nowMs))
      return { allowed: false, code: 'phone_required' };
  } catch {
    return { allowed: false, code: 'time_unavailable' };
  }
  return { allowed: true, code: 'allowed' };
}

function requireSelfServiceAppointment(
  state,
  appointmentId,
  verificationInput,
  nowMs,
  deniedMessage
) {
  const appointment = lookupPatientAppointments(state, verificationInput).find(
    (item) => item.id === appointmentId
  );
  if (appointment === undefined) throw managementError('lookup_failed');
  const eligibility = patientCancellationEligibility(appointment, nowMs);
  if (!eligibility.allowed)
    throw managementError(
      eligibility.code,
      eligibility.code === 'already_cancelled'
        ? '這筆預約已取消。'
        : deniedMessage
    );
  return appointment;
}

export function patientRescheduleTargets(state, appointment, nowMs) {
  return state.slots.filter(
    (slot) =>
      slot.kind === appointment.bookingKind &&
      slot.id !== appointment.slotId &&
      slot.reservationId === undefined &&
      isUpcomingSlot(slot, nowMs) &&
      isWithinSyntheticBookingWindow(slot, nowMs)
  );
}

export function reschedulePatientAppointment(
  state,
  appointmentId,
  targetSlotId,
  verificationInput,
  actorId,
  nowMs
) {
  requireSelfServiceAppointment(
    state,
    appointmentId,
    verificationInput,
    nowMs,
    '此預約無法線上改期，請來電由櫃台協助。'
  );
  const target = state.slots.find((item) => item.id === targetSlotId);
  if (
    target === undefined ||
    !isUpcomingSlot(target, nowMs) ||
    !isWithinSyntheticBookingWindow(target, nowMs)
  ) {
    throw managementError(
      'horizon_closed',
      '此時段不在目前開放的 1 個月預約範圍內。'
    );
  }
  return rescheduleAppointment(state, appointmentId, targetSlotId, actorId);
}

/** 所有 guards 都在 canonical transition 之前；任何拒絕皆不會改動 state。 */
export function cancelPatientAppointment(
  state,
  appointmentId,
  verificationInput,
  actorId,
  nowMs
) {
  requireSelfServiceAppointment(
    state,
    appointmentId,
    verificationInput,
    nowMs,
    '此預約無法線上取消，請來電由櫃台協助。'
  );
  return transitionAppointment(state, appointmentId, 'cancel', actorId);
}

export function managedAppointmentSummary(appointment) {
  return {
    id: appointment.id,
    slotId: appointment.slotId,
    startsAt: appointment.startsAt,
    bookingKind: appointment.bookingKind,
    itemLabel: appointment.itemLabel ?? '',
    status: appointment.status
  };
}
