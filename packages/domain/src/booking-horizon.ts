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

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function bookingHorizonEndExclusive(taipeiToday: string): string {
  // 位數格式正確時三者必為整數；只有解析失敗才會出現 NaN，
  // 所以加總一次檢查就等價於三個 isInteger。
  const match = TAIPEI_DATE_PATTERN.exec(taipeiToday) ?? [];
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (
    Number.isNaN(year + month + day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month)
  ) {
    throw new DomainError('INVALID_VALUE', 'must be a real calendar date.');
  }
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const lastBookableDay = Math.min(day, daysInMonth(nextYear, nextMonth));
  // 「最後可訂日加一」可能跨月，交給 Date.UTC 正規化，不手寫進位分支；
  // toISOString 前十碼即 UTC 的 YYYY-MM-DD。
  return new Date(Date.UTC(nextYear, nextMonth - 1, lastBookableDay + 1))
    .toISOString()
    .slice(0, 10);
}
