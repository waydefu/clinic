import { DomainError } from './errors.js';
const NAME_PATTERN = /^.{1,30}$/u;
const PHONE_PATTERN = /^[0-9+\-() ]{8,20}$/;
const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
/**
 * 省略年份的生日（2026-07-27，業主要求年份改為選填）。
 *
 * 形狀取 XML Schema 的 `gMonthDay`：`--MM-DD`。不用裸的 `MM-DD`，因為那個字串
 * 在任何地方看到都無法確定是「五月二十日」還是別的東西；前綴的兩個減號讓它在
 * 日誌、狀態快照與比對鍵裡一眼就看得出年份是**刻意**沒有的，而不是被截斷了。
 */
const MONTH_DAY_PATTERN = /^--\d{2}-\d{2}$/;
/**
 * 只驗格式，不驗檢查碼。
 *
 * 中華民國國民身分證統一編號有一套官方檢查碼演算法，但這個階段的預覽站是拿
 * **編造的號碼**測試的，檢查碼會把它們全部擋掉。
 *
 * 第二碼是性別／身分碼，屬於格式而不是檢查碼：國民身分證是 1 或 2；
 * 2021-01 起的新式外來人口統一證號（居留證）改為與國民身分證同一種形狀，
 * 第二碼是 8 或 9。舊式「兩個英文字母＋八碼」不再核發，因此不接受——收下一個
 * 已經停用的號碼格式，只會讓櫃台以為系統認得它。
 *
 * **解除條件**：真實 intake 上線時（D-001／D-003）必須補上檢查碼。
 */
const NATIONAL_ID_PATTERN = /^[A-Za-z][1289][0-9]{8}$/;
/**
 * 護照號碼（2026-07-27，業主要求外籍患者改填護照）。
 *
 * **刻意寬鬆**。護照號碼的格式由各發照國自訂，ICAO Doc 9303 只規定機讀區的
 * 護照號碼欄位是最多 9 個字元的英數字。把它收得太緊的後果是拒絕一本真的護照
 * ——而那個人就站在櫃台前面，沒有別的號碼可以給。上限放到 12 是為了容納少數
 * 在機讀區之外使用較長編號的國家。
 */
const PASSPORT_PATTERN = /^[A-Za-z0-9]{6,12}$/;
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
/** 生日是否帶著年份。沒有年份的那一半規則（範圍、未來）就不適用。 */
export function birthDateHasYear(value) {
    return CALENDAR_DATE_PATTERN.test(text(value));
}
function birthDateIssue(value, now) {
    if (value === '')
        return 'required';
    if (MONTH_DAY_PATTERN.test(value)) {
        // 沒有年份就沒有「太早」與「未來」可言，只剩下「那一天存在嗎」。
        // 用閏年當載體，否則 2 月 29 日出生的人會被自己的生日擋在門外。
        return isCalendarDate(`2000-${value.slice(2)}`)
            ? undefined
            : 'not_a_calendar_date';
    }
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
    // 身分證與護照是**擇一**：本國人給身分證或居留證，外籍患者給護照。兩個都空
    // 時問題不屬於任何一欄，而是兩者之間——所以回一個獨立的欄位名，介面才說得出
    // 「請填其中一個」，而不是對著使用者根本沒看到的那一欄報錯。
    const nationalId = text(input.nationalId);
    const passportNumber = text(input.passportNumber);
    if (nationalId === '' && passportNumber === '') {
        push('identityDocument', 'required');
    }
    else {
        if (nationalId !== '' && !NATIONAL_ID_PATTERN.test(nationalId))
            push('nationalId', 'format');
        if (passportNumber !== '' && !PASSPORT_PATTERN.test(passportNumber))
            push('passportNumber', 'format');
    }
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
        passportNumber: text(input.passportNumber).toUpperCase(),
        hasNhiCard: input.hasNhiCard === true
    };
}
/**
 * 同一個人的比對鍵。「一人一筆有效預約」就是靠它成立的，不需要帳號系統。
 *
 * 優先序：身分證／居留證 → 護照 → 電話＋生日。這個鍵**只能用於比對**：它含有
 * 身分證字號或護照號碼，不可以出現在畫面、網址、日誌或日曆事件裡。
 *
 * 最後那一段在 2026-07-27 變弱了：業主要求生日的年份改為選填，於是
 * 「電話＋生日」可能只剩「電話＋月日」。同住的家人常共用一支電話，而同月同日生
 * 不是罕見的巧合——兩件事湊在一起就會把**兩個人合併成一個人**，症狀是其中一位
 * 被系統告知「您已有一筆未完成的預約」而他自己根本沒約過。
 *
 * 因此年份缺席時把姓名一併納入鍵。代價是同一個人打錯一次名字會多出一筆紀錄；
 * 那個方向的錯誤只是資料重複，另一個方向是拒絕一位真的患者，所以選這一邊。
 * 年份有填時維持原本的鍵，不改變既有資料的比對結果。
 */
export function patientIdentityKey(input) {
    const nationalId = text(input.nationalId);
    if (nationalId !== '')
        return `id:${nationalId.toUpperCase()}`;
    const passportNumber = text(input.passportNumber);
    if (passportNumber !== '')
        return `passport:${passportNumber.toUpperCase()}`;
    const birthDate = text(input.birthDate);
    const contact = `contact:${text(input.phone)}|${birthDate}`;
    return birthDateHasYear(birthDate)
        ? contact
        : `${contact}|${text(input.name)}`;
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
/**
 * 一位患者的識別碼遮罩呈現，不管他給的是哪一種證件。
 *
 * 呼叫端不該自己判斷「有身分證就遮身分證、否則遮護照」：那個判斷一旦漏寫，
 * 外籍患者在清單上就會顯示破折號，看起來像資料缺漏而不是換了一種證件。
 */
export function maskIdentityDocument(input) {
    const nationalId = text(input.nationalId);
    return maskNationalId(nationalId === '' ? input.passportNumber : nationalId);
}
