import { z } from 'zod';

import {
  IdempotencyKeySchema,
  LocalDateSchema,
  OpaqueIdentifierSchema,
  UtcIsoTimestampSchema
} from './common.js';

/**
 * Synthetic Calendar synchronization contracts.
 *
 * The browser receives opaque source/projection identifiers only. Google
 * Calendar IDs, event IDs, etags, sync tokens and credential references are
 * deliberately absent from every public schema in this file.
 */

export const CalendarSourceStateSchema = z.enum([
  'active',
  'standby',
  'validating',
  'error'
]);

export const CalendarSyncHealthSchema = z.enum([
  'idle',
  'syncing',
  'healthy',
  'degraded',
  'expired'
]);

export const CalendarProjectionKindSchema = z.enum(['appointment', 'busy']);
export const CalendarBookingKindSchema = z.enum(['initial', 'follow_up']);

export const CalendarBusyReasonSchema = z.enum([
  'meeting',
  'leave',
  'training',
  'other'
]);

export const CalendarCandidateKindSchema = z.enum([
  'create_appointment',
  'create_block',
  'update_appointment',
  'update_block',
  'cancel_appointment',
  'release_block',
  'invalid_format',
  'conflict'
]);

export const CalendarCandidateStatusSchema = z.enum([
  'pending',
  'accepted',
  'rejected',
  'conflict',
  'superseded'
]);

export const CalendarValidationCodeSchema = z.enum([
  'title_missing',
  'title_format_invalid',
  'patient_code_unknown',
  'time_missing',
  'time_invalid',
  'appointment_all_day',
  'appointment_duration_invalid',
  'appointment_off_grid',
  'appointment_outside_hours',
  'busy_reason_unknown'
]);

export const CalendarSourceSummarySchema = z
  .object({
    sourceId: OpaqueIdentifierSchema,
    displayName: z.string().min(1).max(80),
    state: CalendarSourceStateSchema,
    active: z.boolean(),
    previous: z.boolean(),
    version: z.number().int().min(0),
    lastSyncedAt: UtcIsoTimestampSchema.nullable(),
    lastErrorCode: z.string().min(1).max(64).nullable()
  })
  .strict();

export const CalendarSyncStatusSchema = z
  .object({
    health: CalendarSyncHealthSchema,
    activeSource: CalendarSourceSummarySchema.nullable(),
    lastSuccessfulSyncAt: UtcIsoTimestampSchema.nullable(),
    nextScheduledSyncAt: UtcIsoTimestampSchema.nullable(),
    pendingCandidateCount: z.number().int().min(0),
    conflictCount: z.number().int().min(0),
    expiresAt: UtcIsoTimestampSchema
  })
  .strict();

export const CalendarEventProjectionSchema = z
  .object({
    projectionId: OpaqueIdentifierSchema,
    kind: CalendarProjectionKindSchema,
    displayLabel: z.string().min(1).max(80),
    startsAt: UtcIsoTimestampSchema,
    endsAt: UtcIsoTimestampSchema,
    sourceVersion: z.number().int().min(0),
    bookingKind: CalendarBookingKindSchema.nullable(),
    serviceId: OpaqueIdentifierSchema.nullable(),
    busyReason: CalendarBusyReasonSchema.nullable()
  })
  .strict();

export const CalendarChangeCandidateSchema = z
  .object({
    candidateId: OpaqueIdentifierSchema,
    kind: CalendarCandidateKindSchema,
    status: CalendarCandidateStatusSchema,
    displayLabel: z.string().min(1).max(80),
    startsAt: UtcIsoTimestampSchema.nullable(),
    endsAt: UtcIsoTimestampSchema.nullable(),
    sourceVersion: z.number().int().min(0),
    expectedVersion: z.number().int().min(0),
    validationErrors: z.array(CalendarValidationCodeSchema),
    createdAt: UtcIsoTimestampSchema,
    before: z
      .object({
        kind: CalendarProjectionKindSchema,
        displayLabel: z.string().min(1).max(80),
        startsAt: UtcIsoTimestampSchema,
        endsAt: UtcIsoTimestampSchema
      })
      .strict()
      .nullable()
  })
  .strict();

export const AvailabilityBlockSchema = z
  .object({
    blockId: OpaqueIdentifierSchema,
    kind: CalendarProjectionKindSchema,
    bookingKind: CalendarBookingKindSchema.nullable(),
    startsAt: UtcIsoTimestampSchema,
    endsAt: UtcIsoTimestampSchema,
    displayLabel: z.string().min(1).max(80)
  })
  .strict();

export const CalendarCommandBaseSchema = z
  .object({
    idempotencyKey: IdempotencyKeySchema,
    expectedVersion: z.number().int().min(0)
  })
  .strict();

export const ActivateCalendarSourceRequestSchema = z
  .object({
    idempotencyKey: IdempotencyKeySchema,
    expectedVersion: z.number().int().min(0),
    sourceId: OpaqueIdentifierSchema
  })
  .strict();

export const CompleteCalendarSourceSwitchRequestSchema = z
  .object({
    idempotencyKey: IdempotencyKeySchema,
    expectedVersion: z.number().int().min(0),
    preflightId: OpaqueIdentifierSchema
  })
  .strict();

export const CalendarSourceCommandResponseSchema = z
  .object({
    activeSource: CalendarSourceSummarySchema,
    previousSource: CalendarSourceSummarySchema.nullable(),
    version: z.number().int().min(1)
  })
  .strict();

export const CalendarSourcePreflightResponseSchema = z
  .object({
    preflightId: OpaqueIdentifierSchema,
    sourceId: OpaqueIdentifierSchema,
    expectedVersion: z.number().int().min(0),
    status: z.enum(['queued', 'passed', 'failed']),
    readable: z.boolean(),
    writable: z.boolean(),
    scannedEvents: z.number().int().min(0),
    validEvents: z.number().int().min(0),
    invalidEvents: z.number().int().min(0),
    completedAt: UtcIsoTimestampSchema,
    expiresAt: UtcIsoTimestampSchema
  })
  .strict();

export const ReviewCalendarCandidateRequestSchema = z
  .object({
    idempotencyKey: IdempotencyKeySchema,
    expectedVersion: z.number().int().min(0)
  })
  .strict();

export const ResolveCalendarCandidateRequestSchema = z
  .object({
    idempotencyKey: IdempotencyKeySchema,
    expectedVersion: z.number().int().min(0),
    resolution: z.enum(['system', 'google'])
  })
  .strict();

const CorrectCalendarCandidateCommandBase = {
  idempotencyKey: IdempotencyKeySchema,
  expectedVersion: z.number().int().min(0)
} as const;

export const CorrectCalendarCandidateRequestSchema = z.discriminatedUnion(
  'kind',
  [
    z
      .object({
        ...CorrectCalendarCandidateCommandBase,
        kind: z.literal('appointment'),
        patientCode: z.string().regex(/^A(?:0[1-9]|[12][0-9]|30)$/),
        bookingKind: CalendarBookingKindSchema,
        serviceId: z.enum(['service_snoring', 'service_aesthetic']),
        startsAt: UtcIsoTimestampSchema
      })
      .strict(),
    z
      .object({
        ...CorrectCalendarCandidateCommandBase,
        kind: z.literal('busy'),
        busyReason: CalendarBusyReasonSchema,
        timeRange: z.discriminatedUnion('kind', [
          z
            .object({
              kind: z.literal('timed'),
              startsAt: UtcIsoTimestampSchema,
              endsAt: UtcIsoTimestampSchema
            })
            .strict(),
          z
            .object({
              kind: z.literal('all_day'),
              startDate: LocalDateSchema,
              endDate: LocalDateSchema
            })
            .strict()
        ])
      })
      .strict()
  ]
);

export const ReviewCalendarCandidateResponseSchema = z
  .object({
    candidate: CalendarChangeCandidateSchema,
    projection: CalendarEventProjectionSchema.nullable()
  })
  .strict();

export const CalendarAvailabilityResponseSchema = z
  .object({
    generatedAt: UtcIsoTimestampSchema,
    sourceVersion: z.number().int().min(0),
    blocks: z.array(AvailabilityBlockSchema)
  })
  .strict();

export const SyntheticPatientCodeSchema = z
  .string()
  .regex(/^A(?:0[1-9]|[12][0-9]|30)$/);
export const SyntheticPatientSummarySchema = z
  .object({ patientCode: SyntheticPatientCodeSchema })
  .strict();

export const SyntheticAppointmentSchema = z
  .object({
    appointmentId: OpaqueIdentifierSchema,
    patientCode: SyntheticPatientCodeSchema,
    bookingKind: CalendarBookingKindSchema,
    serviceId: z.enum(['service_snoring', 'service_aesthetic']),
    startsAt: UtcIsoTimestampSchema,
    endsAt: UtcIsoTimestampSchema,
    status: z.enum(['confirmed', 'cancelled']),
    version: z.number().int().min(1)
  })
  .strict();

export const CreateSyntheticAppointmentRequestSchema = z
  .object({
    idempotencyKey: IdempotencyKeySchema,
    expectedVersion: z.literal(0),
    patientCode: SyntheticPatientCodeSchema,
    bookingKind: CalendarBookingKindSchema,
    serviceId: z.enum(['service_snoring', 'service_aesthetic']),
    startsAt: UtcIsoTimestampSchema
  })
  .strict();

export const RescheduleSyntheticAppointmentRequestSchema = z
  .object({
    idempotencyKey: IdempotencyKeySchema,
    expectedVersion: z.number().int().min(1),
    startsAt: UtcIsoTimestampSchema
  })
  .strict();

export const CancelSyntheticAppointmentRequestSchema = z
  .object({
    idempotencyKey: IdempotencyKeySchema,
    expectedVersion: z.number().int().min(1)
  })
  .strict();

export const SyntheticAppointmentCommandResponseSchema = z
  .object({
    appointment: SyntheticAppointmentSchema,
    replayed: z.boolean()
  })
  .strict();

export const SyntheticAppointmentListResponseSchema = z
  .object({ appointments: z.array(SyntheticAppointmentSchema) })
  .strict();

export type CalendarSourceState = z.infer<typeof CalendarSourceStateSchema>;
export type CalendarSyncHealth = z.infer<typeof CalendarSyncHealthSchema>;
export type CalendarProjectionKind = z.infer<
  typeof CalendarProjectionKindSchema
>;
export type CalendarBusyReason = z.infer<typeof CalendarBusyReasonSchema>;
export type CalendarCandidateKind = z.infer<typeof CalendarCandidateKindSchema>;
export type CalendarCandidateStatus = z.infer<
  typeof CalendarCandidateStatusSchema
>;
export type CalendarValidationCode = z.infer<
  typeof CalendarValidationCodeSchema
>;
export type CalendarSourceSummary = z.infer<typeof CalendarSourceSummarySchema>;
export type CalendarSyncStatus = z.infer<typeof CalendarSyncStatusSchema>;
export type CalendarEventProjection = z.infer<
  typeof CalendarEventProjectionSchema
>;
export type CalendarChangeCandidate = z.infer<
  typeof CalendarChangeCandidateSchema
>;
export type AvailabilityBlock = z.infer<typeof AvailabilityBlockSchema>;
export type ActivateCalendarSourceRequest = z.infer<
  typeof ActivateCalendarSourceRequestSchema
>;
export type CompleteCalendarSourceSwitchRequest = z.infer<
  typeof CompleteCalendarSourceSwitchRequestSchema
>;
export type CalendarSourceCommandResponse = z.infer<
  typeof CalendarSourceCommandResponseSchema
>;
export type CalendarSourcePreflightResponse = z.infer<
  typeof CalendarSourcePreflightResponseSchema
>;
export type ReviewCalendarCandidateRequest = z.infer<
  typeof ReviewCalendarCandidateRequestSchema
>;
export type ResolveCalendarCandidateRequest = z.infer<
  typeof ResolveCalendarCandidateRequestSchema
>;
export type CorrectCalendarCandidateRequest = z.infer<
  typeof CorrectCalendarCandidateRequestSchema
>;
export type ReviewCalendarCandidateResponse = z.infer<
  typeof ReviewCalendarCandidateResponseSchema
>;
export type CalendarAvailabilityResponse = z.infer<
  typeof CalendarAvailabilityResponseSchema
>;
export type SyntheticAppointment = z.infer<typeof SyntheticAppointmentSchema>;
export type SyntheticPatientSummary = z.infer<
  typeof SyntheticPatientSummarySchema
>;
export type CreateSyntheticAppointmentRequest = z.infer<
  typeof CreateSyntheticAppointmentRequestSchema
>;
export type RescheduleSyntheticAppointmentRequest = z.infer<
  typeof RescheduleSyntheticAppointmentRequestSchema
>;
export type CancelSyntheticAppointmentRequest = z.infer<
  typeof CancelSyntheticAppointmentRequestSchema
>;
export type SyntheticAppointmentCommandResponse = z.infer<
  typeof SyntheticAppointmentCommandResponseSchema
>;
export type SyntheticAppointmentListResponse = z.infer<
  typeof SyntheticAppointmentListResponseSchema
>;
