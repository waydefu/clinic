import { DomainError } from './errors.js';
/**
 * Patient booking horizon (Q8 / D-004 direction: one month).
 *
 * Calendar rule, documented here as the single source: from Taipei today,
 * the last bookable calendar date is the same day number next month,
 * clamped to the end of a short month; the window end is exclusive, i.e.
 * the day after that last bookable date.
 *
 * Examples: 2026-09-06 → last bookable 2026-10-06 (end 2026-10-07);
 * 2031-01-31 → last bookable 2031-02-28 (end 2031-03-01);
 * 2032-01-31 (leap year) → last bookable 2032-02-29 (end 2032-03-01).
 */
const TAIPEI_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
function daysInMonth(year, month) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
function formatDate(year, month, day) {
    const pad = (value) => String(value).padStart(2, '0');
    return `${year}-${pad(month)}-${pad(day)}`;
}
export function bookingHorizonEndExclusive(taipeiToday) {
    const match = TAIPEI_DATE_PATTERN.exec(taipeiToday);
    const year = match === null ? Number.NaN : Number(match[1]);
    const month = match === null ? Number.NaN : Number(match[2]);
    const day = match === null ? Number.NaN : Number(match[3]);
    if (!Number.isInteger(year) ||
        !Number.isInteger(month) ||
        month < 1 ||
        month > 12 ||
        !Number.isInteger(day) ||
        day < 1 ||
        day > daysInMonth(year, month)) {
        throw new DomainError('INVALID_VALUE', 'taipeiToday must be a real YYYY-MM-DD calendar date.');
    }
    const nextYear = month === 12 ? year + 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;
    const lastBookableDay = Math.min(day, daysInMonth(nextYear, nextMonth));
    const endExclusiveMs = Date.UTC(nextYear, nextMonth - 1, lastBookableDay) + 86_400_000;
    const end = new Date(endExclusiveMs);
    return formatDate(end.getUTCFullYear(), end.getUTCMonth() + 1, end.getUTCDate());
}
