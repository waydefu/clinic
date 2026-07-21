import { z } from 'zod';

import {
  IdempotencyKeySchema,
  OpaqueIdentifierSchema,
  PolicyVersionSchema,
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
 * This is the smallest booking payload required for the initial pilot.  Free
 * text is intentionally absent; clinical concerns, diagnosis and images do
 * not belong in the appointment platform.
 */
export const CreateAppointmentRequestSchema = z
  .object({
    idempotencyKey: IdempotencyKeySchema,
    slotId: OpaqueIdentifierSchema,
    serviceId: OpaqueIdentifierSchema,
    patient: z
      .object({
        fullName: z.string().trim().min(1).max(80),
        mobileE164: z.string().regex(/^\+[1-9][0-9]{7,14}$/),
        email: z.email().optional()
      })
      .strict(),
    privacyAcceptance: z
      .object({
        policyVersion: PolicyVersionSchema,
        acceptedAt: UtcIsoTimestampSchema
      })
      .strict()
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
