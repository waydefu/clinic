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
  birthDateHasYear,
  maskIdentityDocument,
  maskNationalId,
  normalisePatientIdentity,
  patientIdentityIssues,
  patientIdentityKey
} from '../vendor/domain/patient-identity.js';

export { birthDateHasYear, maskIdentityDocument, maskNationalId };

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
  'birthDate.required': '請填寫出生的月份與日期。',
  'birthDate.format':
    '出生月份與日期請填數字；年份若要填，請填西元四位數，例如 1990。',
  'birthDate.not_a_calendar_date': '生日不是有效的日期。',
  'birthDate.out_of_supported_range': '生日的西元年請填 1900 之後。',
  'birthDate.in_the_future': '生日不可晚於今天。',
  'nationalId.required': '請填寫身分證字號。',
  'nationalId.format':
    '身分證字號為 1 個英文字母加 9 位數字（例如 A123456789）；居留證第二碼為 8 或 9。',
  'passportNumber.format': '護照號碼請填 6 至 12 位的英文字母或數字。',
  // 兩種證件都空時，問題不在其中任何一欄，而是在兩者之間——訊息因此要同時
  // 指出兩條路，否則外籍患者只會看到「請填身分證字號」而不知道自己該填護照。
  'identityDocument.required':
    '請填寫身分證字號；外籍人士請勾選「外籍人士」後填寫護照號碼。'
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
