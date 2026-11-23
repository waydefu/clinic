import { z } from 'zod';

import {
  IdempotencyKeySchema,
  LocalDateSchema,
  LocalTimeSchema,
  OpaqueIdentifierSchema,
  UtcIsoTimestampSchema
} from './common.js';

/**
 * The published schedule is what every bookable slot is derived from, so its
 * wire shape is as closed as the appointment commands: clock times on a fixed
 * pattern, a bounded set of weekdays, and no free text anywhere. A schedule
 * carries no patient data by construction — there is no field for it.
 */

function hasValidIntervals(
  intervals: readonly {
    readonly startLocalTime: string;
    readonly endLocalTime: string;
  }[]
): boolean {
  const sorted = [...intervals].sort((left, right) =>
    left.startLocalTime.localeCompare(right.startLocalTime)
  );
  for (let index = 0; index < sorted.length; index += 1) {
    const current = sorted[index];
    if (
      current === undefined ||
      current.startLocalTime >= current.endLocalTime
    ) {
      return false;
    }
    const previous = sorted[index - 1];
    if (
      previous !== undefined &&
      previous.endLocalTime > current.startLocalTime
    ) {
      return false;
    }
  }
  return true;
}

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
  .strict()
  .refine((entry) => hasValidIntervals(entry.intervals), {
    message: 'Intervals must have end after start and not overlap.'
  });

export const DateExceptionSchema = z
  .object({
    date: LocalDateSchema,
    kind: z.enum(['closed', 'extra_open']),
    intervals: z.array(TimeIntervalSchema).optional()
  })
  .strict()
  .refine(
    (entry) =>
      entry.intervals === undefined || hasValidIntervals(entry.intervals),
    {
      message: 'Intervals must have end after start and not overlap.'
    }
  );

export const MAX_SCHEDULE_DATE_EXCEPTIONS = 366;
export const MAX_SCHEDULE_BLOCKED_TIMES = 500;

/**
 * The clinic grid is defined in Taipei time and the domain refuses anything
 * else, so the wire contract pins the same single value rather than accepting
 * a zone the planner would then reject.
 */
export const ScheduleSchema = z
  .object({
    timeZone: z.literal('Asia/Taipei'),
    weeklyAvailability: z
      .array(WeeklyAvailabilitySchema)
      .max(7)
      .refine(
        (entries) =>
          new Set(entries.map((entry) => entry.weekday)).size ===
          entries.length,
        {
          message: 'Weekly availability must not repeat a weekday.'
        }
      ),
    dateExceptions: z
      .array(DateExceptionSchema)
      .max(MAX_SCHEDULE_DATE_EXCEPTIONS),
    blockedTimes: z
      .object({
        initial: z.array(LocalTimeSchema).max(MAX_SCHEDULE_BLOCKED_TIMES),
        follow_up: z.array(LocalTimeSchema).max(MAX_SCHEDULE_BLOCKED_TIMES)
      })
      .strict()
      .refine(
        (blocked) =>
          blocked.initial.length + blocked.follow_up.length <=
          MAX_SCHEDULE_BLOCKED_TIMES,
        {
          message: 'Blocked times exceed the maximum allowed count.'
        }
      )
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

export const GetPublishedScheduleResponseSchema = z
  .object({
    publishedVersion: z.number().int().min(0),
    publishedAt: UtcIsoTimestampSchema.nullable(),
    schedule: ScheduleSchema.nullable()
  })
  .strict();

export const ListedSlotSchema = z
  .object({
    slotId: OpaqueIdentifierSchema,
    kind: z.enum(['initial', 'follow_up']),
    startsAt: UtcIsoTimestampSchema,
    endsAt: UtcIsoTimestampSchema,
    available: z.boolean()
  })
  .strict();

export const ListSlotsResponseSchema = z
  .object({
    slots: z.array(ListedSlotSchema)
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
export type GetPublishedScheduleResponse = z.infer<
  typeof GetPublishedScheduleResponseSchema
>;
export type ListedSlot = z.infer<typeof ListedSlotSchema>;
export type ListSlotsResponse = z.infer<typeof ListSlotsResponseSchema>;
