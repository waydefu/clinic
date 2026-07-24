import { z } from 'zod';

import { AppointmentStatusSchema } from './appointments.js';
import { OpaqueIdentifierSchema, UtcIsoTimestampSchema } from './common.js';

export const AuditActionSchema = z.enum([
  'appointment_confirmed',
  'cancellation_requested',
  'appointment_cancelled',
  'appointment_completed',
  'appointment_no_show',
  'appointment_rescheduled',
  // Deletion removes the appointment, so this event is the only surviving
  // record of it. `after` is null and `reasonCode` is never null for it.
  'appointment_deleted'
]);

export const AuditSourceSchema = z.enum(['api', 'system', 'worker']);

const AuditEventIdentifierSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9_-]+$/);

/**
 * Audit state is deliberately narrower than an appointment document. It is
 * enough to explain a state/slot change and cannot carry patient PII.
 */
export const AuditAppointmentStateSchema = z
  .object({
    status: AppointmentStatusSchema,
    slotId: OpaqueIdentifierSchema
  })
  .strict();

export const AuditEventV2Schema = z
  .object({
    eventId: AuditEventIdentifierSchema,
    occurredAt: UtcIsoTimestampSchema,
    actorId: OpaqueIdentifierSchema,
    actorRole: OpaqueIdentifierSchema,
    action: AuditActionSchema,
    resourceType: z.literal('appointment'),
    resourceId: OpaqueIdentifierSchema,
    before: AuditAppointmentStateSchema.nullable(),
    after: AuditAppointmentStateSchema.nullable(),
    reasonCode: OpaqueIdentifierSchema.nullable(),
    result: z.enum(['succeeded', 'denied', 'failed']),
    correlationId: OpaqueIdentifierSchema,
    source: AuditSourceSchema,
    policyVersion: OpaqueIdentifierSchema.nullable(),
    schemaVersion: z.literal(2)
  })
  .strict();

export type AuditAction = z.infer<typeof AuditActionSchema>;
export type AuditAppointmentState = z.infer<typeof AuditAppointmentStateSchema>;
export type AuditEventV2 = z.infer<typeof AuditEventV2Schema>;
export type AuditSource = z.infer<typeof AuditSourceSchema>;
