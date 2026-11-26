import { z } from 'zod';

import { OpaqueIdentifierSchema } from './common.js';

export const ApiErrorCodeSchema = z.enum([
  'AUTHENTICATION_REQUIRED',
  'AUTHORIZATION_DENIED',
  'CONFLICT',
  'IDEMPOTENCY_MISMATCH',
  'INTERNAL_ERROR',
  'NOT_FOUND',
  'POLICY_ACCEPTANCE_REQUIRED',
  'RATE_LIMITED',
  'SERVICE_UNAVAILABLE',
  'VALIDATION_FAILED'
]);

// Stable machine-readable cause for a conflict the client can explain specifically.
export const ApiErrorReasonSchema = z.enum([
  'PATIENT_HAS_UPCOMING_APPOINTMENT'
]);

export const ApiErrorResponseSchema = z
  .object({
    error: z
      .object({
        code: ApiErrorCodeSchema,
        message: z.string().min(1).max(240),
        reason: ApiErrorReasonSchema.optional(),
        correlationId: OpaqueIdentifierSchema
      })
      .strict()
  })
  .strict();

export type ApiErrorReason = z.infer<typeof ApiErrorReasonSchema>;
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
