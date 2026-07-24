import { planAuditEvent } from './audit.js';
import { DomainError } from './errors.js';
import { assertIdempotencyContext, planIdempotencyRecord } from './idempotency.js';
/**
 * The clinic's booking grid, as pure rules.
 *
 * This used to live only in the browser (`modules/schedule-engine.js`), which
 * meant the availability rules the patient sees and the rules a future API
 * would enforce were two separate implementations of the same clinic policy.
 * They are one implementation now (ADR-0004); the browser module is a thin
 * localizing adapter over this file.
 *
 * Everything here is I/O-free and deterministic: the same schedule always
 * produces the same slots, which is what makes a publication reviewable before
 * it is applied.
 */
/**
 * 診所的掛號網格以台北時間定義。台灣自 1979 年起無日光節約時間，因此 +08:00
 * 是全年固定偏移，可以直接用在時間字串上而不需要時區資料庫。
 */
export const TAIPEI_TIME_ZONE = 'Asia/Taipei';
const CLINIC_UTC_OFFSET = '+08:00';
/** 一格掛號佔用的分鐘數。 */
export const SLOT_DURATION_MINUTES = 30;
/**
 * 初診走整點與半點，回診走 15 分與 45 分。
 *
 * 兩個網格在時鐘上刻意重疊（14:00 初診 vs 14:15 回診），2026-07-21 由診所確認：
 * 諮詢師與醫師分線並行，回診不會吃掉初診的一格。不要把兩個網格改成互斥——
 * 容量是以人力線計算，不是以時鐘分鐘計算。
 */
export const SLOT_MINUTE_MARKS = Object.freeze({
    initial: Object.freeze([0, 30]),
    follow_up: Object.freeze([15, 45])
});
const BOOKING_KINDS = ['initial', 'follow_up'];
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
export function isValidLocalDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (match === null)
        return false;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const daysInMonth = [
        31,
        leapYear ? 29 : 28,
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31
    ];
    return (month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth[month - 1]);
}
/** 尚未結束、仍佔著時段的預約狀態。 */
const OPEN_APPOINTMENT_STATUSES = ['confirmed', 'cancellation_requested'];
// A defensive array check that returns a plain boolean. `Array.isArray` is a
// `x is any[]` type guard, so using it on an already-typed `readonly T[]`
// narrows the element type to `any` and poisons everything downstream. These
// schedules arrive from untrusted browser state, so the runtime check is real;
// this just keeps it from erasing the types.
function isArrayShaped(value) {
    return Array.isArray(value);
}
function minutesOf(time) {
    const [hour, minute] = time.split(':').map(Number);
    return (hour ?? 0) * 60 + (minute ?? 0);
}
function clockText(totalMinutes) {
    const hour = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
    const minute = String(totalMinutes % 60).padStart(2, '0');
    return `${hour}:${minute}`;
}
function localIso(date, totalMinutes) {
    return new Date(`${date}T${clockText(totalMinutes)}:00${CLINIC_UTC_OFFSET}`).toISOString();
}
function addDays(date, amount) {
    // 正午的 UTC 時間點：日期加減不會因為時區偏移而跨過午夜。
    const moment = new Date(`${date}T12:00:00Z`);
    moment.setUTCDate(moment.getUTCDate() + amount);
    return moment.toISOString().slice(0, 10);
}
function assertIntervals(intervals) {
    // Not `Array.isArray`: on a `readonly T[]` it narrows to `any[]` and erases
    // the element type. The parameter type already guarantees an array here.
    if (intervals === undefined || intervals.length === 0) {
        throw new DomainError('INVALID_VALUE', 'A day needs at least one interval.');
    }
    const sorted = [...intervals].sort((left, right) => left.startLocalTime.localeCompare(right.startLocalTime));
    for (const [index, interval] of sorted.entries()) {
        if (!TIME_PATTERN.test(interval.startLocalTime) ||
            !TIME_PATTERN.test(interval.endLocalTime) ||
            interval.startLocalTime >= interval.endLocalTime) {
            throw new DomainError('INVALID_VALUE', 'An interval needs a valid start before its end.');
        }
        const previous = sorted[index - 1];
        if (previous !== undefined &&
            previous.endLocalTime > interval.startLocalTime) {
            throw new DomainError('SCHEDULE_INTERVALS_OVERLAP', 'Intervals on the same day must not overlap.');
        }
    }
}
function assertBlockedTimes(schedule) {
    const blocked = schedule.blockedTimes;
    if (blocked === undefined)
        return;
    for (const kind of BOOKING_KINDS) {
        const list = blocked[kind];
        if (list === undefined)
            continue;
        if (!isArrayShaped(list)) {
            throw new DomainError('INVALID_VALUE', 'Blocked times must be a list.');
        }
        for (const value of list) {
            if (!TIME_PATTERN.test(value)) {
                throw new DomainError('INVALID_VALUE', 'A blocked time must be HH:MM.');
            }
            // 擋一個不在該網格上的時間點是無效設定，不是「剛好擋不到」：它永遠不會
            // 對應到任何一格，設定者會以為自己擋掉了某個時段。
            if (!SLOT_MINUTE_MARKS[kind].includes(minutesOf(value) % 60)) {
                throw new DomainError('BLOCKED_TIME_OFF_GRID', `${value} is not on the ${kind} booking grid.`);
            }
        }
    }
}
export function assertScheduleValid(schedule) {
    if (schedule === undefined ||
        schedule.timeZone !== TAIPEI_TIME_ZONE ||
        !isArrayShaped(schedule.weeklyAvailability) ||
        !isArrayShaped(schedule.dateExceptions)) {
        throw new DomainError('INVALID_VALUE', 'The schedule shape is invalid.');
    }
    const weekdays = new Set();
    for (const entry of schedule.weeklyAvailability) {
        if (!Number.isInteger(entry.weekday) ||
            entry.weekday < 0 ||
            entry.weekday > 6 ||
            weekdays.has(entry.weekday)) {
            throw new DomainError('SCHEDULE_WEEKDAY_DUPLICATED', 'A weekday is invalid or listed twice.');
        }
        weekdays.add(entry.weekday);
        assertIntervals(entry.intervals);
    }
    const dates = new Set();
    for (const entry of schedule.dateExceptions) {
        if (!isValidLocalDate(entry.date) || dates.has(entry.date)) {
            throw new DomainError('SCHEDULE_EXCEPTION_DUPLICATED', 'A date exception is invalid or listed twice.');
        }
        dates.add(entry.date);
        if (entry.kind !== 'closed' && entry.kind !== 'extra_open') {
            throw new DomainError('INVALID_VALUE', 'Unknown date-exception kind.');
        }
        if (entry.kind === 'extra_open')
            assertIntervals(entry.intervals);
    }
    assertBlockedTimes(schedule);
}
function blockedSetsOf(schedule) {
    return {
        initial: new Set(schedule.blockedTimes?.initial ?? []),
        follow_up: new Set(schedule.blockedTimes?.follow_up ?? [])
    };
}
/** 某一天實際營業的時間段：休診例外清空該日，加開例外併入每週設定。 */
function effectiveIntervals(schedule, date) {
    const exception = schedule.dateExceptions.find((entry) => entry.date === date);
    if (exception?.kind === 'closed')
        return [];
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    const weekly = schedule.weeklyAvailability.find((entry) => entry.weekday === weekday)
        ?.intervals ?? [];
    const combined = exception?.kind === 'extra_open'
        ? [...weekly, ...(exception.intervals ?? [])]
        : weekly;
    if (combined.length === 0)
        return [];
    assertIntervals(combined);
    return [...combined].sort((left, right) => left.startLocalTime.localeCompare(right.startLocalTime));
}
/** 一段營業時間內，某個網格上所有可掛號的起始分鐘。 */
function marksWithin(interval, kind, blocked, duration) {
    const from = minutesOf(interval.startLocalTime);
    const to = minutesOf(interval.endLocalTime);
    const found = [];
    for (let hour = Math.floor(from / 60); hour <= Math.floor(to / 60); hour += 1) {
        for (const mark of SLOT_MINUTE_MARKS[kind]) {
            const start = hour * 60 + mark;
            // 一格必須完整落在營業時間內，末尾不能被切斷。
            if (start < from || start + duration > to)
                continue;
            if (blocked.has(clockText(start)))
                continue;
            found.push(start);
        }
    }
    return found;
}
/**
 * 依排班產生時段。既有時段的 `reservationId` 會被保留：發布排班不得把已經
 * 成立的預約從它的那一格上抹掉。
 */
export function planSlots(schedule, existingSlots, options) {
    assertScheduleValid(schedule);
    if (!isValidLocalDate(options.startDate)) {
        throw new DomainError('INVALID_VALUE', 'startDate must be a real YYYY-MM-DD calendar date.');
    }
    if (!Number.isInteger(options.dayCount) || options.dayCount < 0) {
        throw new DomainError('INVALID_VALUE', 'dayCount must be a whole number.');
    }
    const duration = options.durationMinutes ?? SLOT_DURATION_MINUTES;
    const blocked = blockedSetsOf(schedule);
    const reservations = new Map(existingSlots.map((slot) => [slot.id, slot.reservationId]));
    const slots = [];
    for (let offset = 0; offset < options.dayCount; offset += 1) {
        const date = addDays(options.startDate, offset);
        for (const interval of effectiveIntervals(schedule, date)) {
            for (const kind of BOOKING_KINDS) {
                for (const start of marksWithin(interval, kind, blocked[kind], duration)) {
                    const id = `slot_${date.replaceAll('-', '')}_${clockText(start).replace(':', '')}`;
                    const reservationId = reservations.get(id);
                    slots.push({
                        id,
                        kind,
                        startsAt: localIso(date, start),
                        ...(reservationId === undefined ? {} : { reservationId })
                    });
                }
            }
        }
    }
    return slots.sort((left, right) => left.startsAt.localeCompare(right.startsAt));
}
/**
 * 回診「目標日期」當天可掛號的時間點。語意與時段產生完全一致：每週設定、
 * 加開／休診例外、固定不開放與 :15/:45 網格。未營業日回傳空陣列，呼叫端
 * 以此判斷該日期不可選。
 */
export function followUpGridTimes(schedule, date) {
    if (!isValidLocalDate(date ?? ''))
        return [];
    assertScheduleValid(schedule);
    const blocked = blockedSetsOf(schedule).follow_up;
    const times = [];
    for (const interval of effectiveIntervals(schedule, date)) {
        for (const start of marksWithin(interval, 'follow_up', blocked, SLOT_DURATION_MINUTES))
            times.push(clockText(start));
    }
    return times;
}
/**
 * 哪些尚未結束的預約會被一份候選排班孤立——它們的那一格在新排班裡不存在。
 * 發布前必須先處理這些預約，否則患者手上有一筆約不到任何時段的預約。
 */
export function scheduleImpact(appointments, candidateSlots) {
    const ids = new Set(candidateSlots.map((slot) => slot.id));
    return appointments.filter((appointment) => OPEN_APPOINTMENT_STATUSES.includes(appointment.status) &&
        !ids.has(appointment.slotId));
}
/**
 * 發布必須接在自己以為的那一版之後。
 *
 * 這是樂觀並行控制：兩位管理者同時編輯時，後發布的那一份若直接覆蓋，前一位
 * 的變更會消失且雙方都不會發現。擋下來，讓落後的一方重新讀取後自己決定。
 *
 * 與 `planSchedulePublication` 共用同一個判斷，因此瀏覽器原型（多分頁）與未來
 * 的 API 不會各有一套版本規則。
 */
export function assertScheduleVersionMatches(expectedVersion, current) {
    if (expectedVersion !== current.publishedVersion) {
        throw new DomainError('SCHEDULE_VERSION_CONFLICT', `The schedule moved to version ${current.publishedVersion} while this draft targeted ${expectedVersion}.`);
    }
}
function assertUtcTimestamp(value, fieldName) {
    if (!value.endsWith('Z') || Number.isNaN(Date.parse(value))) {
        throw new DomainError('INVALID_TIMESTAMP', `${fieldName} must be a valid UTC ISO-8601 timestamp.`);
    }
}
/**
 * Plans a schedule publication.
 *
 * Two things make this more than "regenerate the slots". First, publishing is
 * optimistically concurrent: the caller states which version it believes it is
 * replacing, and a mismatch is a conflict rather than a silent overwrite —
 * otherwise the second of two administrators editing at the same time would
 * erase the first one's work without either of them seeing it. Second, a
 * publication that would orphan a live appointment is refused, because the
 * patient would be holding a booking whose slot no longer exists.
 */
export function planSchedulePublication(request, current, existingSlots, appointments) {
    assertUtcTimestamp(request.requestedAt, 'requestedAt');
    assertIdempotencyContext(request.idempotency, request.audit.actorId);
    assertScheduleValid(request.draft);
    assertScheduleVersionMatches(request.expectedVersion, current);
    const slots = planSlots(request.draft, existingSlots, request.slotGeneration);
    const orphaned = scheduleImpact(appointments, slots);
    if (orphaned.length > 0) {
        throw new DomainError('SCHEDULE_ORPHANS_APPOINTMENTS', `Publishing would leave ${orphaned.length} open appointment(s) without a slot.`);
    }
    const publishedVersion = current.publishedVersion + 1;
    return {
        publishedVersion,
        publishedAt: request.requestedAt,
        schedule: request.draft,
        slots,
        auditEvent: planAuditEvent({
            eventId: `audit_schedule_v${publishedVersion}`,
            occurredAt: request.requestedAt,
            action: 'schedule_published',
            resourceType: 'schedule',
            resourceId: 'schedule',
            before: {
                version: current.publishedVersion,
                slotCount: existingSlots.length
            },
            after: { version: publishedVersion, slotCount: slots.length },
            context: request.audit
        }),
        idempotencyRecord: planIdempotencyRecord(request.idempotency, `schedule_v${publishedVersion}`, request.requestedAt, 'schedule')
    };
}
