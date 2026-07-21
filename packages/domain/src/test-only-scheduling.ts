import { DomainError } from './errors.js';

/**
 * Pure schedule rules for the documented local synthetic profile. This does
 * not establish a clinic schedule or create slots in a database.
 */
export interface TestOnlyLocalInterval {
  readonly startLocalTime: string;
  readonly endLocalTime: string;
}

export interface TestOnlyWeeklyAvailability {
  readonly weekday: number;
  readonly intervals: readonly TestOnlyLocalInterval[];
}

export type TestOnlyDateException =
  | {
      readonly date: string;
      readonly kind: 'closed';
      readonly reasonCode: string;
    }
  | {
      readonly date: string;
      readonly kind: 'extra_open';
      readonly reasonCode: string;
      readonly intervals: readonly TestOnlyLocalInterval[];
    };

export interface TestOnlySchedule {
  readonly timeZone: 'Asia/Taipei';
  readonly weeklyAvailability: readonly TestOnlyWeeklyAvailability[];
  readonly dateExceptions: readonly TestOnlyDateException[];
}

/**
 * Validates schedule configuration and returns a defensive, sorted copy. The
 * caller is responsible for authorization, audit, persistence and slot
 * capacity; those concerns intentionally remain outside this pure model.
 */
export function createTestOnlySchedule(
  schedule: TestOnlySchedule
): TestOnlySchedule {
  if (schedule.timeZone !== 'Asia/Taipei') {
    throw invalid('The synthetic schedule must use Asia/Taipei.');
  }

  const seenWeekdays = new Set<number>();
  const weeklyAvailability = schedule.weeklyAvailability.map((entry) => {
    if (!Number.isInteger(entry.weekday) || entry.weekday < 0 || entry.weekday > 6) {
      throw invalid('weekday must be an integer from 0 through 6.');
    }
    if (seenWeekdays.has(entry.weekday)) {
      throw invalid('Each weekday must have one synthetic schedule entry.');
    }
    seenWeekdays.add(entry.weekday);
    return {
      weekday: entry.weekday,
      intervals: validateIntervals(entry.intervals, 'Weekly availability')
    };
  });

  const seenExceptionDates = new Set<string>();
  const dateExceptions = schedule.dateExceptions.map((exception) => {
    assertLocalDate(exception.date);
    assertReasonCode(exception.reasonCode);
    if (seenExceptionDates.has(exception.date)) {
      throw invalid('Only one synthetic date exception is allowed per date.');
    }
    seenExceptionDates.add(exception.date);

    if (exception.kind === 'closed') {
      return { date: exception.date, kind: 'closed' as const, reasonCode: exception.reasonCode };
    }
    return {
      date: exception.date,
      kind: 'extra_open' as const,
      reasonCode: exception.reasonCode,
      intervals: validateIntervals(exception.intervals, 'Extra opening')
    };
  });

  return {
    timeZone: 'Asia/Taipei',
    weeklyAvailability: weeklyAvailability.sort((a, b) => a.weekday - b.weekday),
    dateExceptions: dateExceptions.sort((a, b) => a.date.localeCompare(b.date))
  };
}

/**
 * Finds effective local-time intervals for a calendar date. A closure wins;
 * extra opening adds only its explicit intervals to the normal weekly rule.
 */
export function effectiveTestOnlyIntervals(
  schedule: TestOnlySchedule,
  localDate: string
): readonly TestOnlyLocalInterval[] {
  const normalized = createTestOnlySchedule(schedule);
  assertLocalDate(localDate);

  const exception = normalized.dateExceptions.find(
    (candidate) => candidate.date === localDate
  );
  if (exception?.kind === 'closed') return [];

  const weekday = weekdayForLocalDate(localDate);
  const weekly = normalized.weeklyAvailability.find(
    (entry) => entry.weekday === weekday
  )?.intervals ?? [];
  const extra = exception?.kind === 'extra_open' ? exception.intervals : [];

  return validateIntervals([...weekly, ...extra], 'Effective availability');
}

function validateIntervals(
  intervals: readonly TestOnlyLocalInterval[],
  label: string
): readonly TestOnlyLocalInterval[] {
  if (intervals.length === 0) {
    throw invalid(`${label} must contain at least one interval.`);
  }

  const normalized = intervals.map((interval) => {
    assertLocalTime(interval.startLocalTime);
    assertLocalTime(interval.endLocalTime);
    if (interval.startLocalTime >= interval.endLocalTime) {
      throw invalid(`${label} interval start must be before its end.`);
    }
    return { startLocalTime: interval.startLocalTime, endLocalTime: interval.endLocalTime };
  }).sort((a, b) => a.startLocalTime.localeCompare(b.startLocalTime));

  for (let index = 1; index < normalized.length; index += 1) {
    const previous = normalized[index - 1];
    const current = normalized[index];
    if (previous !== undefined && current !== undefined && previous.endLocalTime > current.startLocalTime) {
      throw invalid(`${label} intervals must not overlap.`);
    }
  }
  return normalized;
}

function weekdayForLocalDate(localDate: string): number {
  const [year, month, day] = localDate.split('-').map(Number);
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 0)).getUTCDay();
}

function assertLocalDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw invalid('date must use the YYYY-MM-DD local-date format.');
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw invalid('date must be a valid calendar date.');
  }
}

function assertLocalTime(value: string): void {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw invalid('Times must use 24-hour HH:MM local-time format.');
  }
}

function assertReasonCode(value: string): void {
  if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(value)) {
    throw invalid('reasonCode must be an opaque uppercase code.');
  }
}

function invalid(message: string): DomainError {
  return new DomainError('INVALID_VALUE', message);
}
