import { z } from 'zod';

export const UtcIsoTimestampSchema = z
  .string()
  .refine(
    (value) => value.endsWith('Z') && !Number.isNaN(Date.parse(value)),
    'Must be a valid UTC ISO-8601 timestamp.'
  );

export function isValidLocalDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return false;

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

  return (
    month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth[month - 1]!
  );
}

export const LocalDateSchema = z
  .string()
  .refine(isValidLocalDate, 'Must be a real YYYY-MM-DD calendar date.');

export const OpaqueIdentifierSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);

export const IdempotencyKeySchema = z
  .string()
  .min(16)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);

export const PolicyVersionSchema = z.string().regex(/^privacy-v[1-9][0-9]*$/);
