import { z } from 'zod';

import {
  CalendarBookingKindSchema,
  CalendarBusyReasonSchema,
  CalendarChangeCandidateSchema,
  CalendarSourceStateSchema,
  CalendarSyncHealthSchema,
  CalendarValidationCodeSchema,
  SyntheticAppointmentSchema,
  SyntheticPatientCodeSchema
} from './calendar-sync.js';
import {
  LocalDateSchema,
  OpaqueIdentifierSchema,
  UtcIsoTimestampSchema
} from './common.js';

// Read guards for existing documents, not a new persisted format or writer.
const unversioned = { schemaVersion: z.never().optional() };
const nonEmpty = z.string().refine((value) => value.trim() !== '');
const generation = z.number().int().min(0);

export const CalendarPilotSourceConfigurationSchema = z
  .object({
    ...unversioned,
    activeSourceId: OpaqueIdentifierSchema,
    previousSourceId: OpaqueIdentifierSchema.optional(),
    version: generation,
    expiresAt: UtcIsoTimestampSchema
  })
  .passthrough();

export const CalendarPilotConfigurationRecordSchema =
  CalendarPilotSourceConfigurationSchema.extend({
    health: CalendarSyncHealthSchema,
    lastSuccessfulSyncAt: UtcIsoTimestampSchema.nullable(),
    nextScheduledSyncAt: UtcIsoTimestampSchema.nullable(),
    inboundEnabled: z.boolean(),
    outboundEnabled: z.boolean()
  });

export const CalendarPilotSourceRecordSchema = z
  .object({
    ...unversioned,
    displayName: z.string().min(1).max(80),
    enabled: z.boolean(),
    state: CalendarSourceStateSchema.optional(),
    syncToken: nonEmpty.nullable().optional(),
    lastSyncedAt: UtcIsoTimestampSchema.nullable().optional(),
    lastFullSyncAt: UtcIsoTimestampSchema.nullable().optional(),
    lastErrorCode: z.string().min(1).max(64).nullable().optional()
  })
  .passthrough();

export const CalendarPilotParsedEntrySchema = z.union([
  z
    .object({
      ok: z.literal(true),
      kind: z.literal('appointment'),
      patientCode: SyntheticPatientCodeSchema,
      bookingKind: CalendarBookingKindSchema,
      serviceId: z.enum(['service_snoring', 'service_aesthetic']),
      displayLabel: nonEmpty,
      startsAt: UtcIsoTimestampSchema,
      endsAt: UtcIsoTimestampSchema
    })
    .strict(),
  z
    .object({
      ok: z.literal(true),
      kind: z.literal('busy'),
      busyReason: CalendarBusyReasonSchema,
      displayLabel: nonEmpty,
      startsAt: UtcIsoTimestampSchema,
      endsAt: UtcIsoTimestampSchema,
      allDay: z.literal(true).optional(),
      startDate: LocalDateSchema.optional(),
      endDate: LocalDateSchema.optional()
    })
    .strict()
    .refine(
      (entry) =>
        entry.allDay !== true ||
        (entry.startDate !== undefined && entry.endDate !== undefined),
      'All-day entries require both dates.'
    ),
  z
    .object({
      ok: z.literal(false),
      errors: z.array(CalendarValidationCodeSchema)
    })
    .strict()
]);

export const CalendarPilotMirrorRecordSchema = z
  .object({
    ...unversioned,
    mirrorId: OpaqueIdentifierSchema,
    sourceId: OpaqueIdentifierSchema,
    externalEventId: nonEmpty,
    etag: nonEmpty,
    externalStatus: z.enum(['confirmed', 'tentative', 'cancelled']),
    sourceVersion: generation,
    parsed: CalendarPilotParsedEntrySchema,
    linkId: OpaqueIdentifierSchema.optional(),
    localDirty: z.boolean(),
    updatedAt: UtcIsoTimestampSchema
  })
  .passthrough();

export const CalendarPilotCandidateRecordSchema =
  CalendarChangeCandidateSchema.safeExtend({
    ...unversioned,
    mirrorId: OpaqueIdentifierSchema,
    expectedEtag: nonEmpty,
    sourceId: OpaqueIdentifierSchema,
    parsed: CalendarPilotParsedEntrySchema,
    previousParsed: CalendarPilotParsedEntrySchema.optional(),
    localRecordId: OpaqueIdentifierSchema.optional(),
    appointmentStatusAtDetection: nonEmpty.optional(),
    appointmentStartsAtAtDetection: UtcIsoTimestampSchema.optional()
  }).passthrough();

export const CalendarPilotAppointmentRecordSchema =
  SyntheticAppointmentSchema.extend({
    ...unversioned,
    updatedAt: UtcIsoTimestampSchema.optional()
  }).passthrough();

export function parseCalendarPilotRecord<T>(
  schema: z.ZodType<T>,
  data: unknown
): T {
  const result = schema.safeParse(data);
  if (!result.success) throw new Error('Unreadable CAL-PILOT record.');
  return result.data;
}
