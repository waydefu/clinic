import { z } from 'zod';

import { OpaqueIdentifierSchema, UtcIsoTimestampSchema } from './common.js';

export const Sha256HexSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const IdempotencyScopeSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z0-9_:-]+$/);

export const IdempotencyResponseReferenceSchema = z
  .object({
    // A replay has to resolve to the same kind of resource it originally
    // produced, so the reference names it rather than assuming appointment.
    resourceType: z.enum(['appointment', 'schedule']),
    resourceId: OpaqueIdentifierSchema
  })
  .strict();

/**
 * Stored replay evidence. The raw client key is deliberately absent: it is
 * used only to derive the opaque Firestore document ID.
 */
export const IdempotencyRecordV1Schema = z
  .object({
    actorId: OpaqueIdentifierSchema,
    scope: IdempotencyScopeSchema,
    requestHash: Sha256HexSchema,
    responseReference: IdempotencyResponseReferenceSchema,
    recordedAt: UtcIsoTimestampSchema,
    schemaVersion: z.literal(1)
  })
  .strict();

export type IdempotencyRecordV1 = z.infer<typeof IdempotencyRecordV1Schema>;
export type IdempotencyResponseReference = z.infer<
  typeof IdempotencyResponseReferenceSchema
>;
