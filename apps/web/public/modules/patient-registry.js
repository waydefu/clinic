// Patient identity for the booking form. Two things matter here:
//   1. the identity key, which is how "one active booking per person" is
//      enforced without needing an account system;
//   2. masking, so a national ID is never rendered in full into a list that
//      someone could be shouting across a front desk or screen-sharing.
// This module holds no policy: retention, lawful basis and the real identity
// model are D-001…D-003 and are not settled here.

const namePattern = /^.{1,30}$/;
const phonePattern = /^[0-9+\-() ]{8,20}$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const nationalIdPattern = /^[A-Za-z][12][0-9]{8}$/;

export function maskNationalId(value) {
  if (typeof value !== 'string' || value.length < 6) return '——';
  return `${value.slice(0, 3)}****${value.slice(-3)}`;
}

export function identityKey(patient) {
  if (typeof patient?.nationalId === 'string' && patient.nationalId !== '')
    return `id:${patient.nationalId.toUpperCase()}`;
  return `contact:${patient?.phone ?? ''}|${patient?.birthDate ?? ''}`;
}

function requireText(value, label, pattern) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!pattern.test(text)) throw new Error(`${label}格式不正確。`);
  return text;
}

export function validatePatientInput(input) {
  const name = requireText(input?.name, '姓名', namePattern);
  const phone = requireText(input?.phone, '電話', phonePattern);
  const birthDate = requireText(input?.birthDate, '生日', datePattern);

  const parsed = new Date(`${birthDate}T00:00:00+08:00`);
  if (Number.isNaN(parsed.getTime())) throw new Error('生日格式不正確。');
  const year = Number(birthDate.slice(0, 4));
  if (year < 1900 || year > 2100) throw new Error('生日請填西元年。');
  if (parsed.getTime() > Date.now()) throw new Error('生日不可晚於今天。');

  // Format only. A checksum check would reject the made-up numbers this
  // preview is meant to be tested with.
  const nationalId = requireText(
    input?.nationalId,
    '身分證字號',
    nationalIdPattern
  ).toUpperCase();

  return {
    name,
    phone,
    birthDate,
    nationalId,
    hasNhiCard: input?.hasNhiCard === true
  };
}

export function findPatientByIdentity(state, patient) {
  const key = identityKey(patient);
  return state.patients.find((item) => identityKey(item) === key);
}

export function upsertPatient(state, input) {
  const details = validatePatientInput(input);
  const existing = findPatientByIdentity(state, details);
  if (existing !== undefined) {
    Object.assign(existing, details, { updatedAt: new Date().toISOString() });
    return existing;
  }
  const suffix = String(state.patientSequence ?? 1).padStart(3, '0');
  const patient = {
    id: `patient_${suffix}`,
    ...details,
    createdAt: new Date().toISOString()
  };
  state.patients.push(patient);
  state.patientSequence = (state.patientSequence ?? 1) + 1;
  return patient;
}
