import { DomainError } from './errors.js';
const NAME_PATTERN = /^.{1,30}$/u;
const PHONE_PATTERN = /^[0-9+\-() ]{8,20}$/;
const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
/**
 * 只驗格式，不驗檢查碼。
 *
 * 中華民國國民身分證統一編號有一套官方檢查碼演算法，但這個階段的預覽站是拿
 * **編造的號碼**測試的，檢查碼會把它們全部擋掉。第二碼限定 1 或 2（性別碼）
 * 是格式的一部分，不是檢查碼。
 *
 * **解除條件**：真實 intake 上線時（D-001／D-003）必須補上檢查碼，並同時決定
 * 居留證統一證號（第二碼為 A–D 的格式）要不要一起接受。
 */
const NATIONAL_ID_PATTERN = /^[A-Za-z][12][0-9]{8}$/;
const MINIMUM_BIRTH_YEAR = 1900;
const MAXIMUM_BIRTH_YEAR = 2100;
/** 生日以民用曆日期（無時區）比較，一律用台北民用日界定「今天」。 */
const TAIPEI_UTC_OFFSET = '+08:00';
const text = (value) => typeof value === 'string' ? value.trim() : '';
/**
 * 民用曆日期是否真的存在。
 *
 * `new Date('1990-02-31T00:00:00+08:00')` 不會失敗——它靜默滾成 3 月 3 日，
 * 所以「格式對 + `Number.isNaN` 為 false」會放行一個不存在的生日（搬進 domain
 * 之前的瀏覽器版本正是這樣）。唯一可靠的判斷是原樣往返：真實日期解析回來的
 * 年月日必須與輸入完全相同。
 */
function isCalendarDate(value) {
    const parsed = new Date(`${value}T00:00:00${TAIPEI_UTC_OFFSET}`);
    if (Number.isNaN(parsed.getTime()))
        return false;
    const roundTrip = new Date(parsed.getTime() + 8 * 60 * 60 * 1000).toISOString();
    return roundTrip.slice(0, 10) === value;
}
function birthDateIssue(value, now) {
    if (value === '')
        return 'required';
    if (!CALENDAR_DATE_PATTERN.test(value))
        return 'format';
    if (!isCalendarDate(value))
        return 'not_a_calendar_date';
    const year = Number(value.slice(0, 4));
    if (year < MINIMUM_BIRTH_YEAR || year > MAXIMUM_BIRTH_YEAR)
        return 'out_of_supported_range';
    const startOfDay = new Date(`${value}T00:00:00${TAIPEI_UTC_OFFSET}`).getTime();
    if (startOfDay > now)
        return 'in_the_future';
    return undefined;
}
function requiredPatternIssue(value, pattern) {
    if (value === '')
        return 'required';
    return pattern.test(value) ? undefined : 'format';
}
/**
 * 逐欄位的問題清單，依欄位在表單上的順序回傳。
 *
 * `now` 是參數而不是 `Date.now()`：domain 必須是純函式，否則「生日不可晚於
 * 今天」這條規則沒有辦法在測試裡被釘住。
 */
export function patientIdentityIssues(input, now) {
    const issues = [];
    const push = (field, code) => {
        if (code !== undefined)
            issues.push({ field, code });
    };
    push('name', requiredPatternIssue(text(input.name), NAME_PATTERN));
    push('phone', requiredPatternIssue(text(input.phone), PHONE_PATTERN));
    push('birthDate', birthDateIssue(text(input.birthDate), now));
    push('nationalId', requiredPatternIssue(text(input.nationalId), NATIONAL_ID_PATTERN));
    return issues;
}
/**
 * 驗證並正規化。身分證字號一律轉大寫，其餘欄位去掉前後空白。
 *
 * 失敗時丟 `DomainError`，訊息只帶欄位與原因代碼——**永遠不回填輸入值**。
 * 錯誤訊息會進日誌與錯誤回報管線，把身分證字號放進去等於讓 PII 從一條沒有人
 * 在看的路徑外流。
 */
export function normalisePatientIdentity(input, now) {
    const [first] = patientIdentityIssues(input, now);
    if (first !== undefined) {
        throw new DomainError('INVALID_VALUE', `patient identity is invalid: ${first.field} (${first.code})`);
    }
    return {
        name: text(input.name),
        phone: text(input.phone),
        birthDate: text(input.birthDate),
        nationalId: text(input.nationalId).toUpperCase(),
        hasNhiCard: input.hasNhiCard === true
    };
}
/**
 * 同一個人的比對鍵。「一人一筆有效預約」就是靠它成立的，不需要帳號系統。
 *
 * 有身分證字號就用它（大小寫不影響），否則退回電話＋生日。這個鍵**只能用於
 * 比對**：它含有身分證字號，不可以出現在畫面、網址、日誌或日曆事件裡。
 */
export function patientIdentityKey(input) {
    const nationalId = text(input.nationalId);
    if (nationalId !== '')
        return `id:${nationalId.toUpperCase()}`;
    return `contact:${text(input.phone)}|${text(input.birthDate)}`;
}
/**
 * 身分證字號的遮罩呈現。
 *
 * 櫃台的螢幕會被病患看到、也會被投影或分享，所以清單一律只出現遮罩後的值。
 * 長度不足的輸入回破折號而不是部分遮罩——半截號碼看起來像資料，其實是壞資料。
 */
export function maskNationalId(value) {
    if (typeof value !== 'string' || value.length < 6)
        return '——';
    return `${value.slice(0, 3)}****${value.slice(-3)}`;
}
