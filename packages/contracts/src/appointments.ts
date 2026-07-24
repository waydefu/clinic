import { z } from 'zod';

import {
  IdempotencyKeySchema,
  OpaqueIdentifierSchema,
  UtcIsoTimestampSchema
} from './common.js';

export const AppointmentStatusSchema = z.enum([
  'confirmed',
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
 */
export const CreateAppointmentRequestSchema = z
  .object({
    idempotencyKey: IdempotencyKeySchema,
    slotId: OpaqueIdentifierSchema,
    serviceId: OpaqueIdentifierSchema,
    bookingKind: z.enum(['initial', 'follow_up'])
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
 * Staff resolutions of an existing appointment. The patient-facing "request
 * cancellation" is `CancelAppointmentRequestSchema`; these are the staff-side
 * transitions. Like every other command the body carries only the idempotency
 * key and the chosen action: the appointment ID comes from the path, and the
 * actor, role, patient ID, timestamp and audit context come from the server.
 */
export const StaffAppointmentTransitionSchema = z.enum([
  'confirm_cancellation',
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
    status: z.enum(['cancelled', 'completed', 'no_show'])
  })
  .strict();

/**
 * Reschedule moves a confirmed appointment to another slot. The response keeps
 * the same minimal shape as create: the appointment stays confirmed and the
 * server returns the authoritative new start/end. Capacity, cancellation window
 * and role authorization are resolved server-side and remain decision-gated
 * (D-004～D-006); this schema only fixes the request/response boundary.
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
