import {
  SLOT_DURATION_MINUTES,
  SLOT_MINUTE_MARKS,
  TAIPEI_TIME_ZONE,
  isValidLocalDate,
  planSlots,
  type Schedule
} from './schedule.js';

export const CALENDAR_ENTRY_SEPARATOR = '｜';

export const CALENDAR_BOOKING_KIND_BY_LABEL = Object.freeze({
  初診: 'initial',
  回診: 'follow_up'
} as const);

export const CALENDAR_SERVICE_BY_LABEL = Object.freeze({
  止鼾: 'service_snoring',
  醫美: 'service_aesthetic'
} as const);

export const CALENDAR_BUSY_REASON_BY_LABEL = Object.freeze({
  會議: 'meeting',
  休假: 'leave',
  教育訓練: 'training',
  其他: 'other'
} as const);

export type CalendarBookingKind =
  (typeof CALENDAR_BOOKING_KIND_BY_LABEL)[keyof typeof CALENDAR_BOOKING_KIND_BY_LABEL];
export type CalendarServiceId =
  (typeof CALENDAR_SERVICE_BY_LABEL)[keyof typeof CALENDAR_SERVICE_BY_LABEL];
export type CalendarBusyReason =
  (typeof CALENDAR_BUSY_REASON_BY_LABEL)[keyof typeof CALENDAR_BUSY_REASON_BY_LABEL];

export type CalendarEntryValidationCode =
  | 'title_missing'
  | 'title_format_invalid'
  | 'patient_code_unknown'
  | 'time_missing'
  | 'time_invalid'
  | 'appointment_all_day'
  | 'appointment_duration_invalid'
  | 'appointment_off_grid'
  | 'appointment_outside_hours'
  | 'busy_reason_unknown';

/** The already-approved clinic hours used by both CAL-PILOT surfaces. */
export const CALENDAR_PILOT_SCHEDULE: Schedule = Object.freeze({
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

export interface CalendarEntryTime {
  readonly dateTime?: unknown;
  readonly date?: unknown;
}

export interface CalendarEntryInput {
  readonly summary?: unknown;
  readonly start?: CalendarEntryTime;
  readonly end?: CalendarEntryTime;
}

export type ParsedCalendarEntry =
  | {
      readonly ok: true;
      readonly kind: 'appointment';
      readonly patientCode: string;
      readonly bookingKind: CalendarBookingKind;
      readonly serviceId: CalendarServiceId;
      readonly displayLabel: string;
      readonly startsAt: string;
      readonly endsAt: string;
    }
  | {
      readonly ok: true;
      readonly kind: 'busy';
      readonly busyReason: CalendarBusyReason;
      readonly displayLabel: string;
      readonly startsAt: string;
      readonly endsAt: string;
      readonly allDay?: true;
      readonly startDate?: string;
      readonly endDate?: string;
    }
  | {
      readonly ok: false;
      readonly errors: readonly CalendarEntryValidationCode[];
    };

const SYNTHETIC_PATIENT_CODE = /^A(?:0[1-9]|[12][0-9]|30)$/;
const APPOINTMENT_PREFIX = '[預約] ';
const BUSY_PREFIX = '[忙碌] ';
const TAIPEI_OFFSET = '+08:00';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizedTimedRange(
  start: CalendarEntryTime | undefined,
  end: CalendarEntryTime | undefined
): { startsAt: string; endsAt: string } | CalendarEntryValidationCode {
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

function normalizedBusyRange(
  start: CalendarEntryTime | undefined,
  end: CalendarEntryTime | undefined
): { startsAt: string; endsAt: string } | CalendarEntryValidationCode {
  const timed = normalizedTimedRange(start, end);
  if (typeof timed !== 'string') return timed;

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

function taipeiMinute(iso: string): number {
  const taipei = new Date(Date.parse(iso) + 8 * 60 * 60 * 1000);
  return taipei.getUTCMinutes();
}

function taipeiDate(iso: string): string {
  return new Date(Date.parse(iso) + 8 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export function isCalendarPilotAppointmentSlot(
  startsAt: string,
  bookingKind: CalendarBookingKind
): boolean {
  if (Number.isNaN(Date.parse(startsAt))) return false;
  return planSlots(CALENDAR_PILOT_SCHEDULE, [], {
    startDate: taipeiDate(startsAt),
    dayCount: 1
  }).some((slot) => slot.kind === bookingKind && slot.startsAt === startsAt);
}

export function parseCalendarEntry(
  input: CalendarEntryInput,
  knownPatientCodes: ReadonlySet<string>
): ParsedCalendarEntry {
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
    const bookingKind =
      CALENDAR_BOOKING_KIND_BY_LABEL[
        bookingKindLabel as keyof typeof CALENDAR_BOOKING_KIND_BY_LABEL
      ];
    const serviceId =
      CALENDAR_SERVICE_BY_LABEL[
        serviceLabel as keyof typeof CALENDAR_SERVICE_BY_LABEL
      ];
    const errors: CalendarEntryValidationCode[] = [];

    if (!SYNTHETIC_PATIENT_CODE.test(patientCode))
      errors.push('title_format_invalid');
    else if (!knownPatientCodes.has(patientCode))
      errors.push('patient_code_unknown');
    if (bookingKind === undefined || serviceId === undefined)
      errors.push('title_format_invalid');
    if (input.start?.date !== undefined || input.end?.date !== undefined)
      errors.push('appointment_all_day');

    const range = normalizedTimedRange(input.start, input.end);
    if (typeof range === 'string') errors.push(range);
    else {
      if (
        Date.parse(range.endsAt) - Date.parse(range.startsAt) !==
        SLOT_DURATION_MINUTES * 60_000
      )
        errors.push('appointment_duration_invalid');
      if (
        bookingKind !== undefined &&
        !SLOT_MINUTE_MARKS[bookingKind].includes(taipeiMinute(range.startsAt))
      )
        errors.push('appointment_off_grid');
      else if (
        bookingKind !== undefined &&
        !isCalendarPilotAppointmentSlot(range.startsAt, bookingKind)
      )
        errors.push('appointment_outside_hours');
    }

    if (errors.length > 0) return { ok: false, errors: [...new Set(errors)] };
    return {
      ok: true,
      kind: 'appointment',
      patientCode,
      bookingKind,
      serviceId,
      displayLabel: `${patientCode}，${bookingKindLabel}，${serviceLabel}`,
      startsAt: (range as { startsAt: string; endsAt: string }).startsAt,
      endsAt: (range as { startsAt: string; endsAt: string }).endsAt
    };
  }

  if (input.summary.startsWith(BUSY_PREFIX)) {
    const reasonLabel = input.summary.slice(BUSY_PREFIX.length).trim();
    const busyReason =
      CALENDAR_BUSY_REASON_BY_LABEL[
        reasonLabel as keyof typeof CALENDAR_BUSY_REASON_BY_LABEL
      ];
    const errors: CalendarEntryValidationCode[] = [];
    if (busyReason === undefined) errors.push('busy_reason_unknown');
    const range = normalizedBusyRange(input.start, input.end);
    if (typeof range === 'string') errors.push(range);
    if (errors.length > 0) return { ok: false, errors: [...new Set(errors)] };
    return {
      ok: true,
      kind: 'busy',
      busyReason,
      displayLabel: `忙碌：${reasonLabel}`,
      startsAt: (range as { startsAt: string; endsAt: string }).startsAt,
      endsAt: (range as { startsAt: string; endsAt: string }).endsAt,
      ...(isNonEmptyString(input.start?.date) &&
      isNonEmptyString(input.end?.date)
        ? {
            allDay: true as const,
            startDate: input.start.date,
            endDate: input.end.date
          }
        : {})
    };
  }

  return { ok: false, errors: ['title_format_invalid'] };
}

export function formatSyntheticAppointmentTitle(input: {
  readonly patientCode: string;
  readonly bookingKind: CalendarBookingKind;
  readonly serviceId: CalendarServiceId;
}): string {
  const bookingLabel = Object.entries(CALENDAR_BOOKING_KIND_BY_LABEL).find(
    ([, value]) => value === input.bookingKind
  )?.[0];
  const serviceLabel = Object.entries(CALENDAR_SERVICE_BY_LABEL).find(
    ([, value]) => value === input.serviceId
  )?.[0];
  if (
    !SYNTHETIC_PATIENT_CODE.test(input.patientCode) ||
    bookingLabel === undefined ||
    serviceLabel === undefined
  )
    throw new Error('Invalid synthetic Calendar appointment fields.');
  return `${APPOINTMENT_PREFIX}${input.patientCode}${CALENDAR_ENTRY_SEPARATOR}${bookingLabel}${CALENDAR_ENTRY_SEPARATOR}${serviceLabel}`;
}

export function formatBusyTitle(reason: CalendarBusyReason): string {
  const label = Object.entries(CALENDAR_BUSY_REASON_BY_LABEL).find(
    ([, value]) => value === reason
  )?.[0];
  if (label === undefined) throw new Error('Invalid Calendar busy reason.');
  return `${BUSY_PREFIX}${label}`;
}
