import { z } from 'zod';

export const UtcIsoTimestampSchema = z
  .string()
  .refine(
    (value) => value.endsWith('Z') && !Number.isNaN(Date.parse(value)),
    'Must be a valid UTC ISO-8601 timestamp.'
  );

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
