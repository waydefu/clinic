// 患者身分的**在地化與狀態存取**層。規則本身不在這裡。
//
// 格式、正規化、身分比對鍵與「是不是同一個人」的判斷都在 `packages/domain` 的
// patient-identity，由 vendored 副本載入（ADR-0004）。這一層只做兩件事：
//   1. 把 domain 的 `{ field, code }` 翻成中文訊息（domain 不做在地化）；
//   2. 把驗證過的身分寫進瀏覽器端的合成狀態。
// 2026-09-22 起新預約只收姓名、電話、月日生日與國籍
// （BOOKING-MINIMIZATION-2026-09-22）。舊紀錄的證件遮罩函式只為了顯示舊資料。

import {
  birthDateHasYear,
  maskIdentityDocument,
  maskNationalId,
  normalisePatientIdentity,
  patientIdentityIssues,
  patientIdentityKey,
  resolveIntakeCandidate
} from '../vendor/domain/patient-identity.js';

export { birthDateHasYear, maskIdentityDocument, maskNationalId };

/** 身分比對鍵。名稱維持 `identityKey`，呼叫端與既有測試都用這個名字。 */
export const identityKey = patientIdentityKey;

// 每一則訊息都自帶欄位名稱。錯誤文字掛在 `role="alert"` 上，讀屏使用者可能是
// 直接跳到警示、沒有讀到旁邊的欄位標籤，所以訊息不能只說「格式不正確」。
const MESSAGES = {
  'name.required': '請填寫姓名。',
  'name.format': '姓名請控制在 30 字以內。',
  'phone.required': '請填寫聯絡電話。',
  'phone.format': '請填寫 8–20 位的數字電話，例如 0912345678。',
  'birthDate.required': '請填寫出生的月份與日期。',
  'birthDate.format': '出生月份與日期請填數字，例如 5 月 20 日。',
  'birthDate.not_a_calendar_date': '生日不是有效的月份與日期。',
  'nationality.required': '請選擇國籍：本國或外國。',
  'nationality.format': '請選擇國籍：本國或外國。'
};

/**
 * 同一組電話＋生日對不到唯一的人。訊息刻意不說原因——說「已有另一位同生日的
 * 人」等於告訴輸入者那支電話底下還有誰。
 */
export const IDENTITY_AMBIGUOUS_MESSAGE =
  '無法線上完成這筆預約，請直接來電診所，由櫃台協助。';

function messageFor(issue) {
  return (
    MESSAGES[`${issue.field}.${issue.code}`] ??
    // domain 新增了原因代碼卻沒有人補翻譯時，寧可給一句通用的話，也不要讓
    // 介面顯示 undefined。check:architecture 會擋下這種漏補。
    '這個欄位的格式不正確。'
  );
}

/** 逐欄位的錯誤訊息，供表單即時提示使用。 */
export function fieldErrors(input) {
  const errors = {};
  for (const issue of patientIdentityIssues(input))
    errors[issue.field] = messageFor(issue);
  return errors;
}

/**
 * 驗證並正規化。失敗時丟中文訊息——domain 丟的是 `DomainError` 與原因代碼，
 * 那是給日誌與 API 用的，不適合直接給患者看。
 */
export function validatePatientInput(input) {
  const [issue] = patientIdentityIssues(input);
  if (issue !== undefined) throw new Error(messageFor(issue));
  return normalisePatientIdentity(input);
}

export function upsertPatient(state, input) {
  const details = validatePatientInput(input);
  const key = identityKey(details);
  const matches = state.patients.filter((item) => identityKey(item) === key);
  const decision = resolveIntakeCandidate(
    matches.map((item) => ({ patientId: item.id, name: String(item.name) })),
    details.name
  );
  if (decision.kind === 'ambiguous')
    throw new Error(IDENTITY_AMBIGUOUS_MESSAGE);
  if (decision.kind === 'reuse') {
    const existing = matches.find((item) => item.id === decision.patientId);
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
