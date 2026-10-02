import { SLOT_DURATION_MINUTES, SLOT_MINUTE_MARKS, TAIPEI_TIME_ZONE, isValidLocalDate, planSlots } from './schedule.js';
export const CALENDAR_ENTRY_SEPARATOR = '｜';
export const CALENDAR_BOOKING_KIND_BY_LABEL = Object.freeze({
    初診: 'initial',
    回診: 'follow_up'
});
export const CALENDAR_SERVICE_BY_LABEL = Object.freeze({
    止鼾: 'service_snoring',
    醫美: 'service_aesthetic'
});
export const CALENDAR_BUSY_REASON_BY_LABEL = Object.freeze({
    會議: 'meeting',
    休假: 'leave',
    教育訓練: 'training',
    其他: 'other'
});
/**
 * Extract the closed phone + month-day identity shape from a manually typed
 * Calendar title. The result is transient input for a server-side lookup only;
 * callers must never persist these values.
 */
export function extractCalendarContact(title) {
    const compactCharacters = [];
    const sourceIndexes = [];
    for (let index = 0; index < title.length; index += 1) {
        const character = title[index];
        if (character === '-' || character === ' ' || character === '\u3000')
            continue;
        compactCharacters.push(character ?? '');
        sourceIndexes.push(index);
    }
    const compact = compactCharacters.join('');
    const phones = [...compact.matchAll(/09\d{8}/g)];
    if (phones.length !== 1)
        return undefined;
    const phone = phones[0];
    if (phone === undefined)
        return undefined;
    const compactStart = phone.index;
    if (compactStart === undefined)
        return undefined;
    const sourceStart = sourceIndexes[compactStart];
    const sourceEnd = sourceIndexes[compactStart + phone[0].length - 1];
    if (sourceStart === undefined || sourceEnd === undefined)
        return undefined;
    if ((compactStart > 0 && /\d/.test(compact[compactStart - 1] ?? '')) ||
        /\d/.test(title[sourceEnd + 1] ?? ''))
        return undefined;
    // A short numeric label wedged between a phone and the birthday is
    // ambiguous (for example `0900000001 2 0520`). Keep a normal spaced
    // phone + four/six digit birthday valid, but do not silently ignore that
    // extra run while extracting the later date.
    if (/^[\s-]*\d{1,3}[\s-]+\d{4,6}(?!\d)/u.test(title.slice(sourceEnd + 1)))
        return undefined;
    const withoutPhone = `${title.slice(0, sourceStart)} ${title.slice(sourceEnd + 1)}`;
    const dates = [...withoutPhone.matchAll(/(?<!\d)(\d{6}|\d{4})(?!\d)/g)];
    if (dates.length !== 1)
        return undefined;
    const rawDate = dates[0]?.[1];
    if (rawDate === undefined)
        return undefined;
    const monthDay = rawDate.length === 6 ? rawDate.slice(-4) : rawDate;
    const month = Number(monthDay.slice(0, 2));
    const day = Number(monthDay.slice(2, 4));
    if (month < 1 || month > 12 || day < 1)
        return undefined;
    const leapYear = new Date(Date.UTC(2000, month - 1, day));
    if (leapYear.getUTCMonth() !== month - 1 || leapYear.getUTCDate() !== day)
        return undefined;
    return {
        phoneDigits: phone[0],
        birthMonthDay: `--${monthDay.slice(0, 2)}-${monthDay.slice(2, 4)}`
    };
}
/** The already-approved clinic hours used by both CAL-PILOT surfaces. */
export const CALENDAR_PILOT_SCHEDULE = Object.freeze({
    timeZone: TAIPEI_TIME_ZONE,
    weeklyAvailability: Object.freeze([
        Object.freeze({
            weekday: 3,
            intervals: Object.freeze([
                Object.freeze({ startLocalTime: '12:00', endLocalTime: '20:00' })
            ])
        }),
        Object.freeze({
            weekday: 4,
            intervals: Object.freeze([
                Object.freeze({ startLocalTime: '12:00', endLocalTime: '20:00' })
            ])
        }),
        Object.freeze({
            weekday: 5,
            intervals: Object.freeze([
                Object.freeze({ startLocalTime: '12:00', endLocalTime: '20:00' })
            ])
        }),
        Object.freeze({
            weekday: 6,
            intervals: Object.freeze([
                Object.freeze({ startLocalTime: '10:00', endLocalTime: '18:00' })
            ])
        })
    ]),
    dateExceptions: Object.freeze([])
});
const SYNTHETIC_PATIENT_CODE = /^A(?:0[1-9]|[12][0-9]|30)$/;
const APPOINTMENT_PREFIX = '[預約] ';
const BUSY_PREFIX = '[忙碌] ';
const TAIPEI_OFFSET = '+08:00';
function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}
function normalizedTimedRange(start, end) {
    if (!isNonEmptyString(start?.dateTime) || !isNonEmptyString(end?.dateTime))
        return 'time_missing';
    const startMs = Date.parse(start.dateTime);
    const endMs = Date.parse(end.dateTime);
    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs)
        return 'time_invalid';
    return {
        startsAt: new Date(startMs).toISOString(),
        endsAt: new Date(endMs).toISOString()
    };
}
function normalizedBusyRange(start, end) {
    const timed = normalizedTimedRange(start, end);
    if (typeof timed !== 'string')
        return timed;
    if (!isNonEmptyString(start?.date) || !isNonEmptyString(end?.date))
        return timed === 'time_missing' ? 'time_missing' : timed;
    if (!isValidLocalDate(start.date) || !isValidLocalDate(end.date))
        return 'time_invalid';
    const startMs = Date.parse(`${start.date}T00:00:00${TAIPEI_OFFSET}`);
    const endMs = Date.parse(`${end.date}T00:00:00${TAIPEI_OFFSET}`);
    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs)
        return 'time_invalid';
    return {
        startsAt: new Date(startMs).toISOString(),
        endsAt: new Date(endMs).toISOString()
    };
}
function taipeiMinute(iso) {
    const taipei = new Date(Date.parse(iso) + 8 * 60 * 60 * 1000);
    return taipei.getUTCMinutes();
}
function taipeiDate(iso) {
    return new Date(Date.parse(iso) + 8 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
}
export function isCalendarPilotAppointmentSlot(startsAt, bookingKind) {
    if (Number.isNaN(Date.parse(startsAt)))
        return false;
    return planSlots(CALENDAR_PILOT_SCHEDULE, [], {
        startDate: taipeiDate(startsAt),
        dayCount: 1
    }).some((slot) => slot.kind === bookingKind && slot.startsAt === startsAt);
}
export function parseCalendarEntry(input, knownPatientCodes) {
    if (!isNonEmptyString(input.summary))
        return { ok: false, errors: ['title_missing'] };
    if (input.summary.startsWith(APPOINTMENT_PREFIX)) {
        const fields = input.summary
            .slice(APPOINTMENT_PREFIX.length)
            .split(CALENDAR_ENTRY_SEPARATOR);
        if (fields.length !== 3)
            return { ok: false, errors: ['title_format_invalid'] };
        const [patientCodeRaw, bookingKindLabelRaw, serviceLabelRaw] = fields;
        const patientCode = patientCodeRaw?.trim() ?? '';
        const bookingKindLabel = bookingKindLabelRaw?.trim() ?? '';
        const serviceLabel = serviceLabelRaw?.trim() ?? '';
        const bookingKind = CALENDAR_BOOKING_KIND_BY_LABEL[bookingKindLabel];
        const serviceId = CALENDAR_SERVICE_BY_LABEL[serviceLabel];
        const errors = [];
        if (!SYNTHETIC_PATIENT_CODE.test(patientCode))
            errors.push('title_format_invalid');
        else if (!knownPatientCodes.has(patientCode))
            errors.push('patient_code_unknown');
        if (bookingKind === undefined || serviceId === undefined)
            errors.push('title_format_invalid');
        if (input.start?.date !== undefined || input.end?.date !== undefined)
            errors.push('appointment_all_day');
        const range = normalizedTimedRange(input.start, input.end);
        if (typeof range === 'string')
            errors.push(range);
        else {
            if (Date.parse(range.endsAt) - Date.parse(range.startsAt) !==
                SLOT_DURATION_MINUTES * 60_000)
                errors.push('appointment_duration_invalid');
            if (bookingKind !== undefined &&
                !SLOT_MINUTE_MARKS[bookingKind].includes(taipeiMinute(range.startsAt)))
                errors.push('appointment_off_grid');
            else if (bookingKind !== undefined &&
                !isCalendarPilotAppointmentSlot(range.startsAt, bookingKind))
                errors.push('appointment_outside_hours');
        }
        if (errors.length > 0)
            return { ok: false, errors: [...new Set(errors)] };
        return {
            ok: true,
            kind: 'appointment',
            patientCode,
            bookingKind,
            serviceId,
            displayLabel: `${patientCode}，${bookingKindLabel}，${serviceLabel}`,
            startsAt: range.startsAt,
            endsAt: range.endsAt
        };
    }
    if (input.summary.startsWith(BUSY_PREFIX)) {
        const reasonLabel = input.summary.slice(BUSY_PREFIX.length).trim();
        const busyReason = CALENDAR_BUSY_REASON_BY_LABEL[reasonLabel];
        const errors = [];
        if (busyReason === undefined)
            errors.push('busy_reason_unknown');
        const range = normalizedBusyRange(input.start, input.end);
        if (typeof range === 'string')
            errors.push(range);
        if (errors.length > 0)
            return { ok: false, errors: [...new Set(errors)] };
        return {
            ok: true,
            kind: 'busy',
            busyReason,
            displayLabel: `忙碌：${reasonLabel}`,
            startsAt: range.startsAt,
            endsAt: range.endsAt,
            ...(isNonEmptyString(input.start?.date) &&
                isNonEmptyString(input.end?.date)
                ? {
                    allDay: true,
                    startDate: input.start.date,
                    endDate: input.end.date
                }
                : {})
        };
    }
    return { ok: false, errors: ['title_format_invalid'] };
}
export function formatSyntheticAppointmentTitle(input) {
    const bookingLabel = Object.entries(CALENDAR_BOOKING_KIND_BY_LABEL).find(([, value]) => value === input.bookingKind)?.[0];
    const serviceLabel = Object.entries(CALENDAR_SERVICE_BY_LABEL).find(([, value]) => value === input.serviceId)?.[0];
    if (!SYNTHETIC_PATIENT_CODE.test(input.patientCode) ||
        bookingLabel === undefined ||
        serviceLabel === undefined)
        throw new Error('Invalid synthetic Calendar appointment fields.');
    return `${APPOINTMENT_PREFIX}${input.patientCode}${CALENDAR_ENTRY_SEPARATOR}${bookingLabel}${CALENDAR_ENTRY_SEPARATOR}${serviceLabel}`;
}
export function formatBusyTitle(reason) {
    const label = Object.entries(CALENDAR_BUSY_REASON_BY_LABEL).find(([, value]) => value === reason)?.[0];
    if (label === undefined)
        throw new Error('Invalid Calendar busy reason.');
    return `${BUSY_PREFIX}${label}`;
}
