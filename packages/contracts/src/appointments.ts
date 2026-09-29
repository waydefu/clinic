import { z } from 'zod';

import {
  IdempotencyKeySchema,
  OpaqueIdentifierSchema,
  UtcIsoTimestampSchema
} from './common.js';

export const AppointmentStatusSchema = z.enum([
  'confirmed',
  'arrived',
  'cancellation_requested',
  'cancelled',
  'completed',
  'no_show'
]);

/**
 * The appointment command intentionally contains no patient profile, actor,
 * policy version or client timestamp. Patient intake/verification is a
 * separate, still decision-gated boundary; the verified patient and actor
 * identities plus IDs and timestamps must come from the server.
 *
 * `onBehalfPatientId` is the staff-only opaque owner for an internal-test
 * create. It is not a client-supplied `patientId`: that field stays rejected.
 * A verified patient identity always wins over this field.
 */
/**
 * Birthday without a year (`--MM-DD`, XML Schema gMonthDay). Owner decision
 * BOOKING-MINIMIZATION-2026-09-22 removed the year; whether the day exists is
 * the domain's `patientIdentityIssues`, not this shape check.
 */
export const MonthDaySchema = z.string().regex(/^--\d{2}-\d{2}$/);

/** 本國／外國；BOOKING-MINIMIZATION-2026-09-22 只允許這兩個值。 */
export const NationalitySchema = z.enum(['domestic', 'foreign']);

/**
 * New-booking intake after BOOKING-MINIMIZATION-2026-09-22. National ID,
 * passport, NHI-card intention, source channel and referrer are not collected;
 * `.strict()` rejects them rather than silently dropping them.
 */
export const PatientIntakeSchema = z
  .object({
    name: z.string().min(1).max(30),
    phone: z.string().min(8).max(20),
    birthDate: MonthDaySchema,
    nationality: NationalitySchema,
    privacyConsent: z.literal(true)
  })
  .strict();

export const CreateAppointmentRequestSchema = z
  .object({
    idempotencyKey: IdempotencyKeySchema,
    slotId: OpaqueIdentifierSchema,
    serviceId: OpaqueIdentifierSchema,
    bookingKind: z.enum(['initial', 'follow_up']),
    onBehalfPatientId: OpaqueIdentifierSchema.optional(),
    intake: PatientIntakeSchema.optional(),
    /**
     * The patient's own booking note (BOOKING-NOTE-STORAGE-2026-09-29), at most
     * 120 characters. Staff-only on read; never an identity, audit or log value.
     */
    patientNote: z.string().max(120).optional()
  })
  .strict();

export const CreateAppointmentResponseSchema = z
  .object({
    appointmentId: OpaqueIdentifierSchema,
    status: z.literal('confirmed'),
    startsAt: UtcIsoTimestampSchema,
    endsAt: UtcIsoTimestampSchema
  })
  .strict();

export const CancelAppointmentRequestSchema = z
  .object({
    idempotencyKey: IdempotencyKeySchema
  })
  .strict();

export const CancelAppointmentResponseSchema = z
  .object({
    appointmentId: OpaqueIdentifierSchema,
    status: z.enum(['cancellation_requested', 'cancelled'])
  })
  .strict();

/**
 * Internal-test query. Opaque identifiers and timestamps only; no patient
 * profile. Status is the stored lifecycle value.
 *
 * `intakeNationality` is the one intake value on this shape: the staff-only
 * visit fact from ADR-0007. The API sets it only on the staff clinic list,
 * never on a patient's own list, and it is not an identity field.
 */
export const GetAppointmentResponseSchema = z
  .object({
    appointmentId: OpaqueIdentifierSchema,
    status: AppointmentStatusSchema,
    startsAt: UtcIsoTimestampSchema,
    endsAt: UtcIsoTimestampSchema,
    bookingKind: z.enum(['initial', 'follow_up']).optional(),
    slotId: OpaqueIdentifierSchema.optional(),
    patientId: OpaqueIdentifierSchema.optional(),
    intakeNationality: NationalitySchema.optional(),
    /** Staff clinic list only, like `intakeNationality`. */
    patientNote: z.string().max(120).optional()
  })
  .strict();

export const ListAppointmentsQuerySchema = z
  .object({
    scope: z.enum(['mine', 'clinic']).optional(),
    startAfter: UtcIsoTimestampSchema.optional(),
    limit: z.coerce.number().int().min(1).max(50).optional()
  })
  .strict();

export const ListAppointmentsResponseSchema = z
  .object({
    appointments: z.array(GetAppointmentResponseSchema)
  })
  .strict();

export const ReturnLookupRequestSchema = z
  .object({
    phone: z.string().min(8).max(20),
    birthDate: MonthDaySchema
  })
  .strict();

export const ReturnLookupResponseSchema = z
  .object({
    sessionId: OpaqueIdentifierSchema,
    expiresAt: UtcIsoTimestampSchema,
    outcome: z.enum(['existing', 'schedule']),
    appointmentId: OpaqueIdentifierSchema.optional(),
    startsAt: UtcIsoTimestampSchema.optional(),
    endsAt: UtcIsoTimestampSchema.optional()
  })
  .strict();

/**
 * Staff resolutions of an existing appointment. The patient-facing "request
 * cancellation" is `CancelAppointmentRequestSchema`; these are the staff-side
 * transitions. Like every other command the body carries only the idempotency
 * key and the chosen action: the appointment ID comes from the path, and the
 * actor, role, patient ID, timestamp and audit context come from the server.
 */
export const StaffAppointmentTransitionSchema = z.enum([
  'confirm_cancellation',
  'arrive',
  'complete',
  'no_show'
]);

/**
 * Maps each wire transition to the domain `AppointmentTransition` it targets
 * (see `planTransition`). The domain planner remains the single source of truth
 * for whether a transition is allowed from a given status; this constant only
 * fixes the vocabulary boundary so the wire word cannot silently drift from the
 * domain word. `request_cancellation` is intentionally absent — it is the
 * patient path, carried by `CancelAppointmentRequestSchema`.
 */
export const STAFF_TRANSITION_TO_DOMAIN = {
  confirm_cancellation: 'cancel',
  arrive: 'arrive',
  complete: 'complete',
  no_show: 'no_show'
} as const;

export const TransitionAppointmentRequestSchema = z
  .object({
    idempotencyKey: IdempotencyKeySchema,
    transition: StaffAppointmentTransitionSchema
  })
  .strict();

export const TransitionAppointmentResponseSchema = z
  .object({
    appointmentId: OpaqueIdentifierSchema,
    status: z.enum(['cancelled', 'arrived', 'completed', 'no_show'])
  })
  .strict();

/**
 * Reschedule moves a confirmed appointment to another slot. The response keeps
 * the same minimal shape as create: the appointment stays confirmed and the
 * server returns the authoritative new start/end. Capacity, the patient
 * self-service cutoff (same appointment-day 10:00 Asia/Taipei window as
 * cancel) and role authorization are resolved server-side. D-004～D-006 stay
 * pending for production; IP-001 authorises the fail-closed internal-test
 * route only.
 */
export const RescheduleAppointmentRequestSchema = z
  .object({
    idempotencyKey: IdempotencyKeySchema,
    targetSlotId: OpaqueIdentifierSchema
  })
  .strict();

export const RescheduleAppointmentResponseSchema = z
  .object({
    appointmentId: OpaqueIdentifierSchema,
    status: z.literal('confirmed'),
    startsAt: UtcIsoTimestampSchema,
    endsAt: UtcIsoTimestampSchema
  })
  .strict();

/**
 * Why a record is being removed. A closed set rather than free text: the reason
 * is written into an audit event that outlives the appointment, and free text
 * there is both an unreviewable field and a place patient details would leak
 * into. Patient-initiated erasure is deliberately absent — that is a data-rights
 * workflow gated on D-002, not an operator's delete button.
 */
export const DeleteAppointmentReasonSchema = z.enum([
  'duplicate_record',
  'wrong_patient',
  'created_in_error'
]);

/**
 * Deletion is separated from `confirm_cancellation` on purpose. Cancelling
 * records that a real booking will not happen and keeps the row; deleting says
 * the row should never have existed and removes it. Only the audit event
 * survives, which is why the reason is required rather than optional.
 */
export const DeleteAppointmentRequestSchema = z
  .object({
    idempotencyKey: IdempotencyKeySchema,
    reasonCode: DeleteAppointmentReasonSchema
  })
  .strict();

export const DeleteAppointmentResponseSchema = z
  .object({
    appointmentId: OpaqueIdentifierSchema,
    // There is no status left to report: the resource is gone. The response
    // confirms the deletion and points at the audit event that replaced it.
    deleted: z.literal(true),
    auditEventId: OpaqueIdentifierSchema
  })
  .strict();

export type CreateAppointmentRequest = z.infer<
  typeof CreateAppointmentRequestSchema
>;
export type CreateAppointmentResponse = z.infer<
  typeof CreateAppointmentResponseSchema
>;
export type CancelAppointmentRequest = z.infer<
  typeof CancelAppointmentRequestSchema
>;
export type CancelAppointmentResponse = z.infer<
  typeof CancelAppointmentResponseSchema
>;
export type GetAppointmentResponse = z.infer<
  typeof GetAppointmentResponseSchema
>;
export type StaffAppointmentTransition = z.infer<
  typeof StaffAppointmentTransitionSchema
>;
export type TransitionAppointmentRequest = z.infer<
  typeof TransitionAppointmentRequestSchema
>;
export type TransitionAppointmentResponse = z.infer<
  typeof TransitionAppointmentResponseSchema
>;
export type RescheduleAppointmentRequest = z.infer<
  typeof RescheduleAppointmentRequestSchema
>;
export type RescheduleAppointmentResponse = z.infer<
  typeof RescheduleAppointmentResponseSchema
>;
export type DeleteAppointmentReason = z.infer<
  typeof DeleteAppointmentReasonSchema
>;
export type DeleteAppointmentRequest = z.infer<
  typeof DeleteAppointmentRequestSchema
>;
export type DeleteAppointmentResponse = z.infer<
  typeof DeleteAppointmentResponseSchema
>;
export type PatientIntake = z.infer<typeof PatientIntakeSchema>;
export type ListAppointmentsQuery = z.infer<typeof ListAppointmentsQuerySchema>;
export type ListAppointmentsResponse = z.infer<
  typeof ListAppointmentsResponseSchema
>;
export type ReturnLookupRequest = z.infer<typeof ReturnLookupRequestSchema>;
export type ReturnLookupResponse = z.infer<typeof ReturnLookupResponseSchema>;
