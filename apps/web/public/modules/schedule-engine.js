import {
  SLOT_DURATION_MINUTES,
  SYNTHETIC_WINDOW_DAYS,
  SYNTHETIC_WINDOW_START,
  TIME_ZONE
} from './constants.js';

const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function cloneSchedule(schedule) {
  return structuredClone(schedule);
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
  return schedule;
}

export function validateIntervals(intervals) {
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
function localIso(date, totalMinutes) {
  const hour = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const minute = String(totalMinutes % 60).padStart(2, '0');
  return new Date(`${date}T${hour}:${minute}:00+08:00`).toISOString();
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

export function generateSlots(schedule, existingSlots = [], options = {}) {
  validateSchedule(schedule);
  const startDate = options.startDate ?? SYNTHETIC_WINDOW_START;
  const dayCount = options.dayCount ?? SYNTHETIC_WINDOW_DAYS;
  const duration = options.durationMinutes ?? SLOT_DURATION_MINUTES;
  const existingById = new Map(existingSlots.map((slot) => [slot.id, slot]));
  const slots = [];
  for (let offset = 0; offset < dayCount; offset += 1) {
    const date = addDays(startDate, offset);
    for (const interval of effectiveIntervals(schedule, date)) {
      for (
        let start = minutes(interval.startLocalTime);
        start + duration <= minutes(interval.endLocalTime);
        start += duration
      ) {
        const startText = `${String(Math.floor(start / 60)).padStart(2, '0')}${String(start % 60).padStart(2, '0')}`;
        const id = `slot_${date.replaceAll('-', '')}_${startText}`;
        const previous = existingById.get(id);
        slots.push({
          id,
          startsAt: localIso(date, start),
          endsAt: localIso(date, start + duration),
          ...(previous?.reservationId === undefined
            ? {}
            : { reservationId: previous.reservationId })
        });
      }
    }
  }
  return slots;
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
