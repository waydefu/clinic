import { z } from 'zod';

import {
  IdempotencyKeySchema,
  LocalDateSchema,
  UtcIsoTimestampSchema
} from './common.js';

/**
 * The published schedule is what every bookable slot is derived from, so its
 * wire shape is as closed as the appointment commands: clock times on a fixed
 * pattern, a bounded set of weekdays, and no free text anywhere. A schedule
 * carries no patient data by construction — there is no field for it.
 */

const LocalTimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);

export const TimeIntervalSchema = z
  .object({
    startLocalTime: LocalTimeSchema,
    endLocalTime: LocalTimeSchema
  })
  .strict();

export const WeeklyAvailabilitySchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    intervals: z.array(TimeIntervalSchema).min(1)
  })
  .strict();

export const DateExceptionSchema = z
  .object({
    date: LocalDateSchema,
    kind: z.enum(['closed', 'extra_open']),
    intervals: z.array(TimeIntervalSchema).optional()
  })
  .strict();

/**
 * The clinic grid is defined in Taipei time and the domain refuses anything
 * else, so the wire contract pins the same single value rather than accepting
 * a zone the planner would then reject.
 */
export const ScheduleSchema = z
  .object({
    timeZone: z.literal('Asia/Taipei'),
    weeklyAvailability: z.array(WeeklyAvailabilitySchema),
    dateExceptions: z.array(DateExceptionSchema),
    blockedTimes: z
      .object({
        initial: z.array(LocalTimeSchema),
        follow_up: z.array(LocalTimeSchema)
      })
      .strict()
      .optional()
  })
  .strict();

/**
 * Publishing states the version it believes it is replacing. Without it, the
 * second of two administrators editing at the same time would silently erase
 * the first one's work; with it, the server answers CONFLICT and the loser
 * gets to re-read before deciding. The actor, timestamp and the resulting
 * version number all come from the server.
 */
export const PublishScheduleRequestSchema = z
  .object({
    idempotencyKey: IdempotencyKeySchema,
    expectedVersion: z.number().int().min(0),
    schedule: ScheduleSchema
  })
  .strict();

export const PublishScheduleResponseSchema = z
  .object({
    publishedVersion: z.number().int().min(1),
    publishedAt: UtcIsoTimestampSchema,
    slotCount: z.number().int().min(0)
  })
  .strict();

export type TimeInterval = z.infer<typeof TimeIntervalSchema>;
export type WeeklyAvailability = z.infer<typeof WeeklyAvailabilitySchema>;
export type DateException = z.infer<typeof DateExceptionSchema>;
export type Schedule = z.infer<typeof ScheduleSchema>;
export type PublishScheduleRequest = z.infer<
  typeof PublishScheduleRequestSchema
>;
export type PublishScheduleResponse = z.infer<
  typeof PublishScheduleResponseSchema
>;
