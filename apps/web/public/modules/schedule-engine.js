// 瀏覽器對「共用排班規則」的接點。
//
// 規則本身（時段網格、每週設定、日期例外、固定不開放、回診可掛號時間、發布
// 影響與版本衝突）只存在 packages/domain 的 schedule.ts，經 vendor 同步後由
// 此匯入（ADR-0004）。這個模組只做兩件事：
//   1. 補上瀏覽器原型專屬的參數（合成資料視窗）；
//   2. 把 DomainError 的錯誤碼翻成給使用者看的中文訊息。
//
// 與 domain-rules.js 同一個做法：措辭留在邊界，規則留在領域套件。在這之前，
// 患者看到的可預約時間與未來 API 會核可的時間是兩份各自實作的診所政策。
import { SYNTHETIC_WINDOW_DAYS, SYNTHETIC_WINDOW_START } from './constants.js';
import {
  assertScheduleValid,
  assertScheduleVersionMatches,
  DomainError,
  followUpGridTimes,
  planSlots,
  scheduleImpact as domainScheduleImpact
} from '../vendor/domain/index.js';

const MESSAGES = {
  INVALID_VALUE: '排班設定無效：請確認時間為 HH:MM，且開始早於結束。',
  SCHEDULE_INTERVALS_OVERLAP: '同一天的時段不可重疊。',
  SCHEDULE_WEEKDAY_DUPLICATED: '星期設定重複或無效。',
  SCHEDULE_EXCEPTION_DUPLICATED: '日期例外重複或無效。',
  BLOCKED_TIME_OFF_GRID:
    '固定不開放時間必須落在該掛號別的時間點：初診為整點或 30 分，回診為 15 分或 45 分。',
  SCHEDULE_VERSION_CONFLICT:
    '排班已被其他管理者更新，請重新載入後再發布，以免覆蓋對方的變更。',
  SCHEDULE_ORPHANS_APPOINTMENTS:
    '這份排班會讓尚未結束的預約失去時段，請先處理那些預約。'
};

function localize(run) {
  try {
    return run();
  } catch (error) {
    if (error instanceof DomainError)
      throw new Error(MESSAGES[error.code] ?? error.message, { cause: error });
    throw error;
  }
}

export function cloneSchedule(schedule) {
  return structuredClone(schedule);
}

export function validateSchedule(schedule) {
  localize(() => assertScheduleValid(schedule));
  return schedule;
}

/**
 * 合成原型的時段產生。日期視窗是原型專屬的設定（固定的 2030 合成週期），
 * 不是診所規則，因此留在這一層而不是領域套件。
 */
export function generateSlots(schedule, existingSlots = [], options = {}) {
  return localize(() =>
    planSlots(schedule, existingSlots, {
      startDate: options.startDate ?? SYNTHETIC_WINDOW_START,
      dayCount: options.dayCount ?? SYNTHETIC_WINDOW_DAYS,
      ...(options.durationMinutes === undefined
        ? {}
        : { durationMinutes: options.durationMinutes })
    })
  );
}

// 只有尚未開始的時段可預約：現在 17:00 就不能約今天 16:00。同日過去的時段
// 必須從可預約清單濾掉。時段時間帶 +08:00 偏移，直接以毫秒比較即可。
export function isUpcomingSlot(slot, now = Date.now()) {
  return Date.parse(slot.startsAt) > now;
}

export function followUpDueTimes(schedule, date) {
  return localize(() => followUpGridTimes(schedule, date));
}

export function scheduleImpact(appointments, candidateSlots) {
  return domainScheduleImpact(appointments, candidateSlots);
}

/**
 * 發布前確認自己接在哪一版之後。
 *
 * 預覽是 browser-local 的，但兩個分頁就足以重現這個問題：A 分頁發布 v2 後，
 * 停在 v1 畫面的 B 分頁再按發布，會把 A 的排班默默覆蓋掉。判斷本身在 domain，
 * 與未來 API 的樂觀並行控制是同一套規則。
 */
export function ensureScheduleVersion(expectedVersion, meta) {
  localize(() =>
    assertScheduleVersionMatches(expectedVersion, {
      publishedVersion: meta.publishedVersion,
      publishedAt: meta.publishedAt ?? null
    })
  );
}

export function schedulesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
