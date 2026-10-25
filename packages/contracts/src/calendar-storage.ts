import { z } from 'zod';

import {
  CalendarBookingKindSchema,
  CalendarBusyReasonSchema,
  CalendarChangeCandidateSchema,
  CalendarProjectionKindSchema,
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
    lastSuccessfulSyncAt: UtcIsoTimestampSchema.nullable().optional(),
    nextScheduledSyncAt: UtcIsoTimestampSchema.nullable().optional(),
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

export const CalendarPilotSourceSummaryRecordSchema =
  CalendarPilotSourceRecordSchema.omit({ enabled: true });

export const CalendarPilotSyncStateRecordSchema =
  CalendarPilotSourceRecordSchema.pick({
    schemaVersion: true,
    syncToken: true,
    lastSyncedAt: true,
    lastFullSyncAt: true
  });

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
      allDay: z.literal(true),
      startDate: LocalDateSchema,
      endDate: LocalDateSchema
    })
    .strict(),
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

export const CalendarPilotMirrorReviewRecordSchema =
  CalendarPilotMirrorRecordSchema.pick({
    schemaVersion: true,
    externalEventId: true,
    etag: true,
    parsed: true,
    linkId: true
  });

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

export const CalendarPilotEnabledRecordSchema = z
  .object({ ...unversioned, enabled: z.boolean().optional() })
  .passthrough();

export const CalendarPilotGuardRecordSchema = z
  .object({
    ...unversioned,
    recordId: OpaqueIdentifierSchema.nullable().optional()
  })
  .passthrough();

export const CalendarPilotAppointmentIdentityRecordSchema = z
  .object({
    ...unversioned,
    patientCode: SyntheticPatientCodeSchema.optional(),
    version: generation.optional()
  })
  .passthrough();

export const CalendarPilotAvailabilityOverlapRecordSchema = z
  .object({
    ...unversioned,
    kind: CalendarProjectionKindSchema.optional(),
    bookingKind: CalendarBookingKindSchema.nullable().optional(),
    endsAt: UtcIsoTimestampSchema
  })
  .passthrough();

export const CalendarPilotAvailabilityRecordSchema =
  CalendarPilotAvailabilityOverlapRecordSchema.extend({
    kind: CalendarProjectionKindSchema,
    startsAt: UtcIsoTimestampSchema,
    displayLabel: z.string()
  });

export const CalendarPilotRuntimeAppointmentRecordSchema =
  CalendarPilotAppointmentRecordSchema.pick({
    schemaVersion: true,
    patientCode: true,
    bookingKind: true,
    serviceId: true,
    startsAt: true,
    endsAt: true
  });

// Acquisition retains its existing invalid-expiry disable path; the consumer
// validates these unknown clocks before arithmetic rather than coercing them.
export const CalendarPilotRuntimeConfigurationRecordSchema = z
  .object({
    ...unversioned,
    version: generation.optional(),
    expiresAt: z.unknown().optional(),
    inboundEnabled: z.boolean().optional(),
    outboundEnabled: z.boolean().optional(),
    workerLeaseOwner: z.string().nullable().optional(),
    workerLeaseExpiresAt: z.unknown().optional()
  })
  .passthrough();

export const CalendarPilotLeaseConfigurationRecordSchema =
  CalendarPilotRuntimeConfigurationRecordSchema.extend({
    version: generation,
    expiresAt: UtcIsoTimestampSchema,
    inboundEnabled: z.boolean(),
    outboundEnabled: z.boolean(),
    workerLeaseExpiresAt: UtcIsoTimestampSchema.nullable().optional()
  });

export const CalendarPilotHealthRecordSchema =
  CalendarPilotConfigurationRecordSchema.pick({
    schemaVersion: true,
    health: true,
    expiresAt: true,
    inboundEnabled: true,
    outboundEnabled: true
  });

const pilotJobStatus = z.enum([
  'pending',
  'processing',
  'completed',
  'failed',
  'superseded'
]);

// Backoff deliberately treats null/missing as immediately due and other
// unreadable values as not due; selection must not reinterpret that policy.
export const CalendarPilotJobSelectionRecordSchema = z
  .object({
    ...unversioned,
    status: pilotJobStatus,
    nextAttemptAt: z.unknown().optional()
  })
  .passthrough();

export const CalendarPilotJobLeaseRecordSchema = z
  .object({
    ...unversioned,
    status: pilotJobStatus,
    leaseOwner: z.string().nullable().optional(),
    leaseExpiresAt: UtcIsoTimestampSchema.nullable().optional()
  })
  .passthrough();

export const CalendarPilotRuntimeJobRecordSchema =
  CalendarPilotJobLeaseRecordSchema.extend({
    attemptCount: generation.optional(),
    kind: z.enum([
      'calendar_source_preflight',
      'calendar_projection_upsert',
      'calendar_projection_delete',
      'calendar_projection_restore',
      'calendar_source_activated'
    ]),
    sourceId: OpaqueIdentifierSchema.optional(),
    previousSourceId: OpaqueIdentifierSchema.optional(),
    localRecordId: OpaqueIdentifierSchema.optional(),
    mirrorId: OpaqueIdentifierSchema.optional(),
    writeMode: z.literal('update_existing').optional(),
    restoreSource: z.literal('confirmed_appointment').optional(),
    expectedEtag: nonEmpty.optional(),
    generation: generation.optional(),
    nextAttemptAt: z.unknown().optional(),
    activationProgress: z.unknown().optional()
  });

export type CalendarPilotRuntimeJobRecord = z.infer<
  typeof CalendarPilotRuntimeJobRecordSchema
>;

export const CalendarPilotIdempotencyRecordSchema = z
  .object({ ...unversioned, fingerprint: nonEmpty, response: z.unknown() })
  .passthrough();

export function parseCalendarPilotRecord<T>(
  schema: z.ZodType<T>,
  data: unknown
): T {
  const result = schema.safeParse(data);
  if (!result.success) throw new Error('Unreadable CAL-PILOT record.');
  return result.data;
}
