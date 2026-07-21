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

const trimmed = (value) => (typeof value === 'string' ? value.trim() : '');

function birthDateError(value) {
  if (!datePattern.test(value)) return '請以西元年月日填寫，例如 1990-05-20。';
  const parsed = new Date(`${value}T00:00:00+08:00`);
  if (Number.isNaN(parsed.getTime())) return '這不是有效的日期。';
  const year = Number(value.slice(0, 4));
  if (year < 1900 || year > 2100) return '生日請填西元年。';
  if (parsed.getTime() > Date.now()) return '生日不可晚於今天。';
  return undefined;
}

// 逐欄位的錯誤訊息，供表單即時提示使用。validatePatientInput 仍會擋下所有
// 無效輸入，介面只是提前把同一組規則說清楚。
export function fieldErrors(input) {
  const errors = {};
  const name = trimmed(input?.name);
  if (name === '') errors.name = '請填寫姓名。';
  else if (!namePattern.test(name)) errors.name = '姓名請控制在 30 字以內。';

  const phone = trimmed(input?.phone);
  if (phone === '') errors.phone = '請填寫聯絡電話。';
  else if (!phonePattern.test(phone))
    errors.phone = '請填寫 8–20 位的數字電話，例如 0912345678。';

  const birthDate = trimmed(input?.birthDate);
  if (birthDate === '') errors.birthDate = '請填寫生日。';
  else {
    const problem = birthDateError(birthDate);
    if (problem !== undefined) errors.birthDate = problem;
  }

  const nationalId = trimmed(input?.nationalId);
  if (nationalId === '') errors.nationalId = '請填寫身分證字號。';
  else if (!nationalIdPattern.test(nationalId))
    errors.nationalId = '格式為 1 個英文字母加 9 位數字，例如 A123456789。';

  return errors;
}

export function validatePatientInput(input) {
  const name = requireText(input?.name, '姓名', namePattern);
  const phone = requireText(input?.phone, '電話', phonePattern);
  const birthDate = requireText(input?.birthDate, '生日', datePattern);

  const problem = birthDateError(birthDate);
  if (problem !== undefined)
    throw new Error(problem.includes('西元') ? '生日請填西元年。' : problem);

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

function findPatientByIdentity(state, patient) {
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
