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

export const ApiErrorResponseSchema = z
  .object({
    error: z
      .object({
        code: ApiErrorCodeSchema,
        message: z.string().min(1).max(240),
        correlationId: OpaqueIdentifierSchema
      })
      .strict()
  })
  .strict();

export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
