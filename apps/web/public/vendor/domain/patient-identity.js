import { DomainError } from './errors.js';
export const PATIENT_NATIONALITIES = [
    'domestic',
    'foreign'
];
const NAME_PATTERN = /^.{1,30}$/u;
const PHONE_PATTERN = /^[0-9+\-() ]{8,20}$/;
const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_DAY_PATTERN = /^--\d{2}-\d{2}$/;
const text = (value) => typeof value === 'string' ? value.trim() : '';
/**
 * 月日是否存在。用閏年當載體，否則 2 月 29 日出生的人會被自己的生日擋在門外；
 * 這個年份只存在於驗證當下，不會被寫入或傳出。
 */
function monthDayExists(value) {
    const month = Number(value.slice(2, 4));
    const day = Number(value.slice(5, 7));
    if (month < 1 || month > 12 || day < 1)
        return false;
    const carrier = new Date(Date.UTC(2000, month - 1, day));
    return carrier.getUTCMonth() === month - 1 && carrier.getUTCDate() === day;
}
function birthDateIssue(value) {
    if (value === '')
        return 'required';
    if (!MONTH_DAY_PATTERN.test(value))
        return 'format';
    return monthDayExists(value) ? undefined : 'not_a_calendar_date';
}
function requiredPatternIssue(value, pattern) {
    if (value === '')
        return 'required';
    return pattern.test(value) ? undefined : 'format';
}
function nationalityIssue(value) {
    if (value === '')
        return 'required';
    return PATIENT_NATIONALITIES.includes(value)
        ? undefined
        : 'format';
}
/** 逐欄位的問題清單，依欄位在表單上的順序回傳。 */
export function patientIdentityIssues(input) {
    const issues = [];
    const push = (field, code) => {
        if (code !== undefined)
            issues.push({ field, code });
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
export function normalisePatientIdentity(input) {
    const [first] = patientIdentityIssues(input);
    if (first !== undefined) {
        throw new DomainError('INVALID_VALUE', `patient identity is invalid: ${first.field} (${first.code})`);
    }
    return {
        name: text(input.name),
        phone: text(input.phone),
        birthDate: text(input.birthDate),
        nationality: text(input.nationality)
    };
}
/** 電話只留數字，讓 `0912-000-901` 與 `0912000901` 對到同一個人。 */
export function patientPhoneDigits(phone) {
    return text(phone).replace(/\D/g, '');
}
/**
 * 同一個人的比對鍵：電話數字＋月日。姓名刻意不參與——姓名只用來**發現衝突**
 * （見 `resolveIntakeCandidate`），不能讓兩個人因為姓名不同就各自成立，也不能
 * 因為姓名相同就被挑出來。這個鍵含有電話與生日，不可出現在畫面、網址、日誌或
 * 日曆事件裡。
 */
export function patientIdentityKey(input) {
    return `contact:${patientPhoneDigits(input.phone)}|${text(input.birthDate)}`;
}
function comparableName(value) {
    return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();
}
/**
 * 新預約遇到同一組電話＋月日時怎麼辦。
 *
 * 沒有候選 → 建新病患；唯一候選且姓名相同 → 沿用；其餘（姓名不同、多個候選）
 * → 衝突，交給呼叫端拒絕。姓名在這裡只能讓結果**變成衝突**，不能讓結果變成
 * 沿用某一位——否則姓名就成了新的辨識因子，而那正是決定明文禁止的。
 */
export function resolveIntakeCandidate(candidates, name) {
    if (candidates.length === 0)
        return { kind: 'create' };
    const [only] = candidates;
    if (candidates.length === 1 &&
        only !== undefined &&
        comparableName(only.name) === comparableName(name)) {
        return { kind: 'reuse', patientId: only.patientId };
    }
    return { kind: 'ambiguous' };
}
/**
 * 回診查詢只在唯一候選時成立。0 個與多個候選對外必須長得一模一樣，否則等於
 * 告訴查詢者「這組電話生日底下有人」。
 */
export function resolveReturnCandidate(patientIds) {
    return patientIds.length === 1 ? patientIds[0] : undefined;
}
/** 生日是否帶年份。只用來判斷**舊紀錄**的顯示方式；新資料一律沒有年份。 */
export function birthDateHasYear(value) {
    return CALENDAR_DATE_PATTERN.test(text(value));
}
/** 身分證字號的遮罩呈現，只用於顯示舊紀錄。長度不足回破折號，不回半截號碼。 */
export function maskNationalId(value) {
    if (typeof value !== 'string' || value.length < 6)
        return '——';
    return `${value.slice(0, 3)}****${value.slice(-3)}`;
}
/** 舊紀錄的證件遮罩：有身分證就遮身分證，否則遮護照。 */
export function maskIdentityDocument(input) {
    const nationalId = text(input.nationalId);
    return maskNationalId(nationalId === '' ? input.passportNumber : nationalId);
}
