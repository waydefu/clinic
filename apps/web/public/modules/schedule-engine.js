import {
  BOOKING_KINDS,
  DEFAULT_BLOCKED_TIMES,
  SLOT_DURATION_MINUTES,
  SLOT_MINUTE_MARKS,
  SYNTHETIC_WINDOW_DAYS,
  SYNTHETIC_WINDOW_START,
  TIME_ZONE
} from './constants.js';

const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const KINDS = [BOOKING_KINDS.INITIAL, BOOKING_KINDS.FOLLOW_UP];

export function cloneSchedule(schedule) {
  return structuredClone(schedule);
}

function blockedTimesOf(schedule) {
  const blocked = schedule?.blockedTimes ?? {};
  return {
    initial: [...(blocked.initial ?? DEFAULT_BLOCKED_TIMES.initial)],
    follow_up: [...(blocked.follow_up ?? DEFAULT_BLOCKED_TIMES.follow_up)]
  };
}

function validateBlockedTimes(schedule) {
  const blocked = schedule?.blockedTimes;
  if (blocked === undefined) return;
  for (const kind of KINDS) {
    const list = blocked[kind];
    if (list === undefined) continue;
    if (!Array.isArray(list)) throw new Error('固定不開放時間格式無效。');
    for (const value of list) {
      if (!timePattern.test(value)) throw new Error('固定不開放時間格式無效。');
      if (!SLOT_MINUTE_MARKS[kind].includes(minutes(value) % 60))
        throw new Error(
          `${value} 不是${kind === BOOKING_KINDS.INITIAL ? '初診' : '回診'}的掛號時間點。`
        );
    }
  }
}

export function validateSchedule(schedule) {
  if (
    schedule?.timeZone !== TIME_ZONE ||
    !Array.isArray(schedule.weeklyAvailability) ||
    !Array.isArray(schedule.dateExceptions)
  )
    throw new Error('合成排班格式無效。');
  const weekdays = new Set();
  for (const entry of schedule.weeklyAvailability) {
    if (
      !Number.isInteger(entry.weekday) ||
      entry.weekday < 0 ||
      entry.weekday > 6 ||
      weekdays.has(entry.weekday)
    )
      throw new Error('星期設定重複或無效。');
    weekdays.add(entry.weekday);
    validateIntervals(entry.intervals);
  }
  const dates = new Set();
  for (const entry of schedule.dateExceptions) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date) || dates.has(entry.date))
      throw new Error('日期例外重複或無效。');
    dates.add(entry.date);
    if (entry.kind !== 'closed' && entry.kind !== 'extra_open')
      throw new Error('日期例外類型無效。');
    if (entry.kind === 'extra_open') validateIntervals(entry.intervals);
  }
  validateBlockedTimes(schedule);
  return schedule;
}

function validateIntervals(intervals) {
  if (!Array.isArray(intervals) || intervals.length === 0)
    throw new Error('至少需要一段時間。');
  const sorted = [...intervals].sort((a, b) =>
    a.startLocalTime.localeCompare(b.startLocalTime)
  );
  for (let index = 0; index < sorted.length; index += 1) {
    const interval = sorted[index];
    if (
      !timePattern.test(interval.startLocalTime) ||
      !timePattern.test(interval.endLocalTime) ||
      interval.startLocalTime >= interval.endLocalTime
    )
      throw new Error('開始與結束時間無效。');
    if (index > 0 && sorted[index - 1].endLocalTime > interval.startLocalTime)
      throw new Error('同一天的時段不可重疊。');
  }
}

function addDays(dateText, amount) {
  const date = new Date(`${dateText}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
function minutes(time) {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}
function clockText(totalMinutes) {
  const hour = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const minute = String(totalMinutes % 60).padStart(2, '0');
  return `${hour}:${minute}`;
}
function localIso(date, totalMinutes) {
  return new Date(`${date}T${clockText(totalMinutes)}:00+08:00`).toISOString();
}

function effectiveIntervals(schedule, date) {
  const exception = schedule.dateExceptions.find(
    (entry) => entry.date === date
  );
  if (exception?.kind === 'closed') return [];
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const weekly =
    schedule.weeklyAvailability.find((entry) => entry.weekday === weekday)
      ?.intervals ?? [];
  const combined =
    exception?.kind === 'extra_open'
      ? [...weekly, ...exception.intervals]
      : weekly;
  if (combined.length === 0) return [];
  validateIntervals(combined);
  return [...combined].sort((a, b) =>
    a.startLocalTime.localeCompare(b.startLocalTime)
  );
}

// Slots are single points on a per-kind grid, not free-running ranges: initial
// visits land on :00/:30 and follow-ups on :15/:45. Blocked clock times remove
// the doctor's fixed commitments from whichever grid they belong to.
//
// The two grids overlap in wall-clock terms (14:00 initial vs 14:15 follow-up)
// and that is deliberate, confirmed by the clinic on 2026-07-21: consultants
// and doctors are staffed to run both lines in parallel, so a follow-up does
// not consume an initial-visit slot. Do not "fix" this by making the grids
// mutually exclusive — capacity is per staff line, not per clock minute.
function marksWithin(interval, kind, blockedSet, duration) {
  const from = minutes(interval.startLocalTime);
  const to = minutes(interval.endLocalTime);
  const found = [];
  const firstHour = Math.floor(from / 60);
  const lastHour = Math.floor(to / 60);
  for (let hour = firstHour; hour <= lastHour; hour += 1) {
    for (const mark of SLOT_MINUTE_MARKS[kind]) {
      const start = hour * 60 + mark;
      if (start < from || start + duration > to) continue;
      if (blockedSet.has(clockText(start))) continue;
      found.push(start);
    }
  }
  return found;
}

export function generateSlots(schedule, existingSlots = [], options = {}) {
  validateSchedule(schedule);
  const startDate = options.startDate ?? SYNTHETIC_WINDOW_START;
  const dayCount = options.dayCount ?? SYNTHETIC_WINDOW_DAYS;
  const duration = options.durationMinutes ?? SLOT_DURATION_MINUTES;
  const blocked = blockedTimesOf(schedule);
  const blockedSets = {
    initial: new Set(blocked.initial),
    follow_up: new Set(blocked.follow_up)
  };
  const existingById = new Map(existingSlots.map((slot) => [slot.id, slot]));
  const slots = [];
  for (let offset = 0; offset < dayCount; offset += 1) {
    const date = addDays(startDate, offset);
    for (const interval of effectiveIntervals(schedule, date)) {
      for (const kind of KINDS) {
        for (const start of marksWithin(
          interval,
          kind,
          blockedSets[kind],
          duration
        )) {
          const startText = clockText(start).replace(':', '');
          const id = `slot_${date.replaceAll('-', '')}_${startText}`;
          const previous = existingById.get(id);
          slots.push({
            id,
            kind,
            startsAt: localIso(date, start),
            ...(previous?.reservationId === undefined
              ? {}
              : { reservationId: previous.reservationId })
          });
        }
      }
    }
  }
  return slots.sort((left, right) =>
    left.startsAt.localeCompare(right.startsAt)
  );
}

export function scheduleImpact(appointments, candidateSlots) {
  const ids = new Set(candidateSlots.map((slot) => slot.id));
  return appointments.filter(
    (appointment) =>
      ['confirmed', 'cancellation_requested'].includes(appointment.status) &&
      !ids.has(appointment.slotId)
  );
}
export function schedulesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
