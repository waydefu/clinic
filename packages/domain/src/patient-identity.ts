import { DomainError } from './errors.js';

/**
 * 患者身分的單一規則來源，API 與瀏覽器共用（ADR-0004）。
 *
 * 2026-09-22 業主決定（BOOKING-MINIMIZATION-2026-09-22）：新預約只收姓名、電話、
 * 月日生日與國籍（本國／外國），不收身分證、護照、出生年份。辨識一個人只剩
 * 「電話＋月日」，同一支電話、同月日的家人並不罕見，所以這裡的規則是：
 * 無法安全唯一辨識就拒絕，不猜、不合併、不用姓名挑人。
 *
 * 身分證與護照的遮罩函式只為了在介面上顯示**舊紀錄**，新資料不會再有這兩個欄位。
 */

export type PatientIdentityField =
  'name' | 'phone' | 'birthDate' | 'nationality';

/** 失敗原因用代碼表示；在地化屬於介面，不屬於 domain。 */
export type PatientIdentityIssueCode =
  'required' | 'format' | 'not_a_calendar_date';

export type PatientNationality = 'domestic' | 'foreign';

export const PATIENT_NATIONALITIES: readonly PatientNationality[] = [
  'domestic',
  'foreign'
];

export interface PatientIdentityIssue {
  readonly field: PatientIdentityField;
  readonly code: PatientIdentityIssueCode;
}

export interface PatientIdentityInput {
  readonly name?: unknown;
  readonly phone?: unknown;
  readonly birthDate?: unknown;
  readonly nationality?: unknown;
}

export interface PatientIdentity {
  readonly name: string;
  readonly phone: string;
  /** XML Schema `gMonthDay`：`--MM-DD`。刻意沒有年份。 */
  readonly birthDate: string;
  readonly nationality: PatientNationality;
}

const NAME_PATTERN = /^.{1,30}$/u;
const PHONE_PATTERN = /^[0-9+\-() ]{8,20}$/;
const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_DAY_PATTERN = /^--\d{2}-\d{2}$/;

const text = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

/**
 * 月日是否存在。用閏年當載體，否則 2 月 29 日出生的人會被自己的生日擋在門外；
 * 這個年份只存在於驗證當下，不會被寫入或傳出。
 */
function monthDayExists(value: string): boolean {
  const month = Number(value.slice(2, 4));
  const day = Number(value.slice(5, 7));
  if (month < 1 || month > 12 || day < 1) return false;
  const carrier = new Date(Date.UTC(2000, month - 1, day));
  return carrier.getUTCMonth() === month - 1 && carrier.getUTCDate() === day;
}

function birthDateIssue(value: string): PatientIdentityIssueCode | undefined {
  if (value === '') return 'required';
  if (!MONTH_DAY_PATTERN.test(value)) return 'format';
  return monthDayExists(value) ? undefined : 'not_a_calendar_date';
}

function requiredPatternIssue(
  value: string,
  pattern: RegExp
): PatientIdentityIssueCode | undefined {
  if (value === '') return 'required';
  return pattern.test(value) ? undefined : 'format';
}

function nationalityIssue(value: string): PatientIdentityIssueCode | undefined {
  if (value === '') return 'required';
  return (PATIENT_NATIONALITIES as readonly string[]).includes(value)
    ? undefined
    : 'format';
}

/** 逐欄位的問題清單，依欄位在表單上的順序回傳。 */
export function patientIdentityIssues(
  input: PatientIdentityInput
): readonly PatientIdentityIssue[] {
  const issues: PatientIdentityIssue[] = [];
  const push = (
    field: PatientIdentityField,
    code: PatientIdentityIssueCode | undefined
  ) => {
    if (code !== undefined) issues.push({ field, code });
  };
  push('name', requiredPatternIssue(text(input.name), NAME_PATTERN));
  push('phone', requiredPatternIssue(text(input.phone), PHONE_PATTERN));
  push('birthDate', birthDateIssue(text(input.birthDate)));
  push('nationality', nationalityIssue(text(input.nationality)));
  return issues;
}

/**
 * 驗證並正規化。失敗時丟 `DomainError`，訊息只帶欄位與原因代碼——永遠不回填
 * 輸入值，因為錯誤訊息會進日誌。
 */
export function normalisePatientIdentity(
  input: PatientIdentityInput
): PatientIdentity {
  const [first] = patientIdentityIssues(input);
  if (first !== undefined) {
    throw new DomainError(
      'INVALID_VALUE',
      `patient identity is invalid: ${first.field} (${first.code})`
    );
  }
  return {
    name: text(input.name),
    phone: text(input.phone),
    birthDate: text(input.birthDate),
    nationality: text(input.nationality) as PatientNationality
  };
}

/** 電話只留數字，讓 `0912-000-901` 與 `0912000901` 對到同一個人。 */
export function patientPhoneDigits(phone: unknown): string {
  return text(phone).replace(/\D/g, '');
}

/**
 * 同一個人的比對鍵：電話數字＋月日。姓名刻意不參與——姓名只用來**發現衝突**
 * （見 `resolveIntakeCandidate`），不能讓兩個人因為姓名不同就各自成立，也不能
 * 因為姓名相同就被挑出來。這個鍵含有電話與生日，不可出現在畫面、網址、日誌或
 * 日曆事件裡。
 */
export function patientIdentityKey(input: PatientIdentityInput): string {
  return `contact:${patientPhoneDigits(input.phone)}|${text(input.birthDate)}`;
}

export interface PatientCandidate {
  readonly patientId: string;
  readonly name: string;
}

export type IntakeResolution =
  | { readonly kind: 'create' }
  | { readonly kind: 'reuse'; readonly patientId: string }
  | { readonly kind: 'ambiguous' };

function comparableName(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();
}

/**
 * 新預約遇到同一組電話＋月日時怎麼辦。
 *
 * 沒有候選 → 建新病患；唯一候選且姓名相同 → 沿用；其餘（姓名不同、多個候選）
 * → 衝突，交給呼叫端拒絕。姓名在這裡只能讓結果**變成衝突**，不能讓結果變成
 * 沿用某一位——否則姓名就成了新的辨識因子，而那正是決定明文禁止的。
 */
export function resolveIntakeCandidate(
  candidates: readonly PatientCandidate[],
  name: string
): IntakeResolution {
  if (candidates.length === 0) return { kind: 'create' };
  const [only] = candidates;
  if (
    candidates.length === 1 &&
    only !== undefined &&
    comparableName(only.name) === comparableName(name)
  ) {
    return { kind: 'reuse', patientId: only.patientId };
  }
  return { kind: 'ambiguous' };
}

/**
 * 回診查詢只在唯一候選時成立。0 個與多個候選對外必須長得一模一樣，否則等於
 * 告訴查詢者「這組電話生日底下有人」。
 */
export function resolveReturnCandidate(
  patientIds: readonly string[]
): string | undefined {
  return patientIds.length === 1 ? patientIds[0] : undefined;
}

/** 生日是否帶年份。只用來判斷**舊紀錄**的顯示方式；新資料一律沒有年份。 */
export function birthDateHasYear(value: unknown): boolean {
  return CALENDAR_DATE_PATTERN.test(text(value));
}

/** 身分證字號的遮罩呈現，只用於顯示舊紀錄。長度不足回破折號，不回半截號碼。 */
export function maskNationalId(value: unknown): string {
  if (typeof value !== 'string' || value.length < 6) return '——';
  return `${value.slice(0, 3)}****${value.slice(-3)}`;
}

export interface LegacyIdentityDocumentInput {
  readonly nationalId?: unknown;
  readonly passportNumber?: unknown;
}

/** 舊紀錄的證件遮罩：有身分證就遮身分證，否則遮護照。 */
export function maskIdentityDocument(
  input: LegacyIdentityDocumentInput
): string {
  const nationalId = text(input.nationalId);
  return maskNationalId(nationalId === '' ? input.passportNumber : nationalId);
}
