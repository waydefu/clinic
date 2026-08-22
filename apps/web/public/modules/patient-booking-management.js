import { transitionAppointment } from './appointment-domain.js';

export const SELF_CANCEL_CUTOFF_MINUTES = 20;
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

function normalizedDocument(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase();
}

function normalizedVerification(input) {
  const mode = input?.mode;
  const birthDate = String(input?.birthDate ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate))
    throw managementError('lookup_failed');
  if (mode === 'phone') {
    const phone = normalizedPhone(input?.phone);
    if (phone.length < 9) throw managementError('lookup_failed');
    return { mode, birthDate, phone };
  }
  if (mode === 'document') {
    const documentNumber = normalizedDocument(input?.documentNumber);
    if (documentNumber.length < 6) throw managementError('lookup_failed');
    return { mode, birthDate, documentNumber };
  }
  throw managementError('lookup_failed');
}

function birthDateMatches(stored, requested) {
  const value = String(stored ?? '');
  return value.startsWith('--')
    ? value.slice(2) === requested.slice(4)
    : value === requested;
}

function patientMatches(patient, verification) {
  if (!birthDateMatches(patient.birthDate, verification.birthDate))
    return false;
  if (verification.mode === 'phone')
    return normalizedPhone(patient.phone) === verification.phone;
  return [patient.nationalId, patient.passportNumber].some(
    (value) =>
      value !== undefined &&
      normalizedDocument(value) === verification.documentNumber
  );
}

/**
 * 以兩欄位組合尋找這位患者的預約。所有 mismatch 都只回同一個錯誤，避免洩漏
 * 到底是電話、生日或證件哪一欄命中。回傳完整物件只在 request-local state 內使用；
 * UI 取得的是 store 產生的最小摘要。
 */
export function lookupPatientAppointments(state, input) {
  const verification = normalizedVerification(input);
  const patientIds = new Set(
    state.patients
      .filter((patient) => patientMatches(patient, verification))
      .map((patient) => patient.id)
  );
  const appointments = state.appointments
    .filter((appointment) => patientIds.has(appointment.patientId))
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
  if (appointments.length === 0) throw managementError('lookup_failed');
  return appointments;
}

/**
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
  const startsAtMs = Date.parse(appointment.startsAt);
  if (!Number.isFinite(startsAtMs))
    return { allowed: false, code: 'time_unavailable' };
  const remainingMinutes = (startsAtMs - nowMs) / 60_000;
  if (remainingMinutes <= SELF_CANCEL_CUTOFF_MINUTES)
    return { allowed: false, code: 'phone_required', remainingMinutes };
  return { allowed: true, code: 'allowed', remainingMinutes };
}

/** 所有 guards 都在 canonical transition 之前；任何拒絕皆不會改動 state。 */
export function cancelPatientAppointment(
  state,
  appointmentId,
  verificationInput,
  actorId,
  nowMs
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
        : '此預約無法線上取消，請來電由櫃台協助。'
    );
  return transitionAppointment(state, appointmentId, 'cancel', actorId);
}

export function managedAppointmentSummary(appointment) {
  return {
    id: appointment.id,
    startsAt: appointment.startsAt,
    bookingKind: appointment.bookingKind,
    itemLabel: appointment.itemLabel ?? '',
    status: appointment.status
  };
}
