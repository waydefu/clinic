// 患者身分的**在地化與狀態存取**層。規則本身不在這裡。
//
// 格式、正規化、身分比對鍵與遮罩都在 `packages/domain` 的 patient-identity，
// 由 vendored 副本載入（ADR-0004）。先前這些規則只存在於這個檔案，domain 對
// 「患者是誰」一無所知——那代表 API 上線時同一組規則要再寫一次，而事實上的
// 規格會是這份不會出貨的瀏覽器程式。
//
// 這一層剩下兩件事：
//   1. 把 domain 的 `{ field, code }` 翻成中文訊息（domain 不做在地化）；
//   2. 把驗證過的身分寫進瀏覽器端的合成狀態。
// 保存期限、法律依據與正式的身分模型仍是 D-001…D-003，這裡不決定。

import {
  maskNationalId,
  normalisePatientIdentity,
  patientIdentityIssues,
  patientIdentityKey
} from '../vendor/domain/patient-identity.js';

export { maskNationalId };

/** 身分比對鍵。名稱維持 `identityKey`，呼叫端與既有測試都用這個名字。 */
export const identityKey = patientIdentityKey;

// 每一則訊息都自帶欄位名稱。錯誤文字掛在 `role="alert"` 上，讀屏使用者可能是
// 直接跳到警示、沒有讀到旁邊的欄位標籤，所以訊息不能只說「格式不正確」。
// 同一張表同時供表單即時提示與丟出的錯誤使用——先前那是兩套字串，同一個條件
// 講兩種話。
const MESSAGES = {
  'name.required': '請填寫姓名。',
  'name.format': '姓名請控制在 30 字以內。',
  'phone.required': '請填寫聯絡電話。',
  'phone.format': '請填寫 8–20 位的數字電話，例如 0912345678。',
  'birthDate.required': '請填寫生日。',
  'birthDate.format': '生日請以西元年月日填寫，例如 1990-05-20。',
  'birthDate.not_a_calendar_date': '生日不是有效的日期。',
  'birthDate.out_of_supported_range': '生日請填西元年。',
  'birthDate.in_the_future': '生日不可晚於今天。',
  'nationalId.required': '請填寫身分證字號。',
  'nationalId.format':
    '身分證字號格式為 1 個英文字母加 9 位數字，例如 A123456789。'
};

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
  for (const issue of patientIdentityIssues(input, Date.now()))
    errors[issue.field] = messageFor(issue);
  return errors;
}

/**
 * 驗證並正規化。失敗時丟中文訊息——domain 丟的是 `DomainError` 與原因代碼，
 * 那是給日誌與未來 API 用的，不適合直接給患者看。
 */
export function validatePatientInput(input) {
  const [issue] = patientIdentityIssues(input, Date.now());
  if (issue !== undefined) throw new Error(messageFor(issue));
  return normalisePatientIdentity(input, Date.now());
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
