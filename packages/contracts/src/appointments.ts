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
