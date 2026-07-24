import { z } from 'zod';

import {
  IdempotencyKeySchema,
  OpaqueIdentifierSchema,
  UtcIsoTimestampSchema
} from './common.js';

/**
 * Assigning a case manager to a patient. Like every other command the body
 * carries only the idempotency key and the resource selector (the manager); the
 * patient comes from the path, and the actor, effective timestamp and audit
 * context come from the server. There is no free-text field: an assignment is a
 * relationship between two opaque identifiers, nothing a note could hide in.
 *
 * The wire is unrouted. `planCaseAssignment` is the domain authority for whether
 * a reassignment is allowed; this schema only fixes the request/response
 * boundary. Roles and the merge-review workflow stay gated on D-006/D-007.
 */
export const AssignCaseManagerRequestSchema = z
  .object({
    idempotencyKey: IdempotencyKeySchema,
    managerId: OpaqueIdentifierSchema
  })
  .strict();

export const AssignCaseManagerResponseSchema = z
  .object({
    patientId: OpaqueIdentifierSchema,
    managerId: OpaqueIdentifierSchema,
    activeFrom: UtcIsoTimestampSchema
  })
  .strict();

export type AssignCaseManagerRequest = z.infer<
  typeof AssignCaseManagerRequestSchema
>;
export type AssignCaseManagerResponse = z.infer<
  typeof AssignCaseManagerResponseSchema
>;
