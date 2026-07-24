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
  'appointment_deleted',
  'follow_up_decided',
  // The only action whose resource is the schedule rather than an appointment.
  'schedule_published'
]);

export const AuditResourceTypeSchema = z.enum(['appointment', 'schedule']);

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

/** Version and slot count explain the scale of a publication, and nothing else. */
export const AuditScheduleStateSchema = z
  .object({
    version: z.number().int().min(0),
    slotCount: z.number().int().min(0)
  })
  .strict();

export const AuditFollowUpStateSchema = z
  .object({
    followUpStatus: z.enum(['required', 'not_required']),
    dueAt: UtcIsoTimestampSchema.nullable()
  })
  .strict();

/**
 * Every branch is strict and narrow: there is no field in any of them that a
 * name, phone number, national ID or free-text note could be written into, so
 * audit cannot become a side channel for patient data.
 */
export const AuditResourceStateSchema = z.union([
  AuditAppointmentStateSchema,
  AuditScheduleStateSchema,
  AuditFollowUpStateSchema
]);

export const AuditEventV2Schema = z
  .object({
    eventId: AuditEventIdentifierSchema,
    occurredAt: UtcIsoTimestampSchema,
    actorId: OpaqueIdentifierSchema,
    actorRole: OpaqueIdentifierSchema,
    action: AuditActionSchema,
    resourceType: AuditResourceTypeSchema,
    resourceId: OpaqueIdentifierSchema,
    before: AuditResourceStateSchema.nullable(),
    after: AuditResourceStateSchema.nullable(),
    reasonCode: OpaqueIdentifierSchema.nullable(),
    result: z.enum(['succeeded', 'denied', 'failed']),
    correlationId: OpaqueIdentifierSchema,
    source: AuditSourceSchema,
    policyVersion: OpaqueIdentifierSchema.nullable(),
    schemaVersion: z.literal(2)
  })
  .strict()
  .superRefine((event, context) => {
    const issue = (
      message: string,
      path: readonly (string | number)[]
    ): void => {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message,
        path: [...path]
      });
    };
    const requireResourceType = (
      expected: 'appointment' | 'schedule'
    ): void => {
      if (event.resourceType !== expected) {
        issue(`${event.action} must use resourceType "${expected}".`, [
          'resourceType'
        ]);
      }
    };
    const requireAppointmentState = (
      state: unknown,
      field: 'before' | 'after'
    ): void => {
      if (!AuditAppointmentStateSchema.safeParse(state).success) {
        issue(`${event.action} requires appointment ${field} state.`, [field]);
      }
    };
    const requireScheduleState = (
      state: unknown,
      field: 'before' | 'after'
    ): void => {
      if (!AuditScheduleStateSchema.safeParse(state).success) {
        issue(`${event.action} requires schedule ${field} state.`, [field]);
      }
    };
    const requireFollowUpState = (
      state: unknown,
      field: 'before' | 'after'
    ): void => {
      if (!AuditFollowUpStateSchema.safeParse(state).success) {
        issue(`${event.action} requires follow-up ${field} state.`, [field]);
      }
    };

    switch (event.action) {
      case 'appointment_confirmed':
        requireResourceType('appointment');
        if (event.before !== null) {
          issue('appointment_confirmed must have a null before state.', [
            'before'
          ]);
        }
        requireAppointmentState(event.after, 'after');
        break;
      case 'cancellation_requested':
      case 'appointment_cancelled':
      case 'appointment_completed':
      case 'appointment_no_show':
      case 'appointment_rescheduled':
        requireResourceType('appointment');
        requireAppointmentState(event.before, 'before');
        requireAppointmentState(event.after, 'after');
        break;
      case 'appointment_deleted':
        requireResourceType('appointment');
        requireAppointmentState(event.before, 'before');
        if (event.after !== null) {
          issue('appointment_deleted must have a null after state.', ['after']);
        }
        if (event.reasonCode === null) {
          issue('appointment_deleted requires a reasonCode.', ['reasonCode']);
        }
        break;
      case 'follow_up_decided':
        requireResourceType('appointment');
        if (
          event.before !== null &&
          !AuditFollowUpStateSchema.safeParse(event.before).success
        ) {
          issue(
            'follow_up_decided before state must be null or follow-up state.',
            ['before']
          );
        }
        requireFollowUpState(event.after, 'after');
        break;
      case 'schedule_published':
        requireResourceType('schedule');
        requireScheduleState(event.before, 'before');
        requireScheduleState(event.after, 'after');
        break;
    }
  });

export type AuditAction = z.infer<typeof AuditActionSchema>;
export type AuditAppointmentState = z.infer<typeof AuditAppointmentStateSchema>;
export type AuditScheduleState = z.infer<typeof AuditScheduleStateSchema>;
export type AuditFollowUpState = z.infer<typeof AuditFollowUpStateSchema>;
export type AuditResourceState = z.infer<typeof AuditResourceStateSchema>;
export type AuditResourceType = z.infer<typeof AuditResourceTypeSchema>;
export type AuditEventV2 = z.infer<typeof AuditEventV2Schema>;
export type AuditSource = z.infer<typeof AuditSourceSchema>;
