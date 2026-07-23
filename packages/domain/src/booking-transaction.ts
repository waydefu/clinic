import {
  assertSlotBookable,
  assertWithinActiveBookingLimit
} from './appointment-rules.js';
import {
  planAuditEvent,
  type AuditContext,
  type AuditEventV2
} from './audit.js';
import { calendarEventIdForAppointment } from './calendar-event-id.js';
import { DomainError } from './errors.js';
import {
  assertIdempotencyContext,
  planIdempotencyRecord,
  type IdempotencyContext,
  type PlannedIdempotencyRecord
} from './idempotency.js';

/**
 * The I/O-free core of the booking write path.
 *
 * A Firestore transaction may be retried by the server at any time, so the
 * decision of *what to write* must be a pure function of the data that was
 * read. This module produces that decision; the repository is only allowed to
 * apply it. Nothing here may perform I/O, read a clock, generate an id or call
 * an external service — those all belong to the caller, and an external call
 * inside a transaction is forbidden outright (ADR-0002).
 */

export type BookingKind = 'initial' | 'follow_up';

/** 同一人同時只能有一筆未結束的預約。 */
export const ACTIVE_BOOKING_LIMIT = 1;
export const ACTIVE_BOOKING_STATUSES: readonly string[] = [
  'confirmed',
  'cancellation_requested'
];

export interface SlotSnapshot {
  readonly id: string;
  readonly kind: BookingKind;
  readonly startsAt: string;
  readonly reservationId?: string;
}

export type PatientBookingGuardStatus = 'confirmed' | 'cancellation_requested';

/**
 * Snapshot of `patient_booking_guards/{patientId}`. Document existence is the
 * explicit active-booking lock; terminal appointments do not retain a guard.
 */
export interface PatientBookingGuardSnapshot {
  readonly activeAppointmentId: string;
  readonly status: PatientBookingGuardStatus;
  readonly updatedAt: string;
}

export interface BookingRequest {
  readonly appointmentId: string;
  readonly slotId: string;
  readonly patientId: string;
  readonly bookingKind: BookingKind;
  readonly itemId: string;
  readonly audit: AuditContext;
  readonly requestedAt: string;
  readonly idempotency: IdempotencyContext;
}

export interface PlannedAppointment {
  readonly id: string;
  readonly slotId: string;
  readonly startsAt: string;
  readonly patientId: string;
  readonly bookingKind: BookingKind;
  readonly itemId: string;
  readonly status: 'confirmed';
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PlannedOutboxJob {
  readonly id: string;
  readonly type: 'calendar_projection_requested';
  readonly appointmentId: string;
  readonly appointmentStatus: 'confirmed';
  readonly idempotencyKey: string;
  readonly status: 'pending';
  readonly attempts: 0;
  readonly createdAt: string;
}

export interface BookingPlan {
  readonly appointment: PlannedAppointment;
  readonly slotReservation: {
    readonly slotId: string;
    readonly reservationId: string;
  };
  readonly patientBookingGuard: PatientBookingGuardSnapshot;
  readonly auditEvent: AuditEventV2;
  readonly outboxJob: PlannedOutboxJob;
  readonly idempotencyRecord: PlannedIdempotencyRecord;
}

function assertIdentifier(value: string, fieldName: string): void {
  if (!/^[A-Za-z0-9_:-]{1,128}$/.test(value)) {
    throw new DomainError(
      'INVALID_VALUE',
      `${fieldName} must be an opaque identifier.`
    );
  }
}

function assertUtcTimestamp(value: string, fieldName: string): void {
  if (!value.endsWith('Z') || Number.isNaN(Date.parse(value))) {
    throw new DomainError(
      'INVALID_TIMESTAMP',
      `${fieldName} must be a valid UTC ISO-8601 timestamp.`
    );
  }
}

/**
 * Decides the complete set of writes for one reservation.
 *
 * `patientBookingGuard` is read from the patient's fixed guard document inside
 * the same transaction. Every booking for one patient therefore contends on
 * the same document even when requests target different slots.
 */
export function planBooking(
  request: BookingRequest,
  slot: SlotSnapshot | undefined,
  patientBookingGuard: PatientBookingGuardSnapshot | undefined
): BookingPlan {
  assertIdentifier(request.appointmentId, 'appointmentId');
  assertIdentifier(request.patientId, 'patientId');
  assertUtcTimestamp(request.requestedAt, 'requestedAt');
  assertIdempotencyContext(request.idempotency, request.audit.actorId);

  // The slot/request-id mismatch is specific to this write path (the caller
  // passed a slot that is not the one it named), so it stays here. The booking
  // rules themselves come from the shared assertions.
  if (slot !== undefined && slot.id !== request.slotId) {
    throw new DomainError(
      'INVALID_VALUE',
      'The slot does not match the request.'
    );
  }
  assertSlotBookable(slot, request.bookingKind);
  assertWithinActiveBookingLimit(patientBookingGuard === undefined ? 0 : 1);

  const appointment: PlannedAppointment = {
    id: request.appointmentId,
    slotId: slot.id,
    startsAt: slot.startsAt,
    patientId: request.patientId,
    bookingKind: request.bookingKind,
    itemId: request.itemId,
    status: 'confirmed',
    createdAt: request.requestedAt,
    updatedAt: request.requestedAt
  };

  return {
    appointment,
    slotReservation: {
      slotId: slot.id,
      reservationId: request.appointmentId
    },
    patientBookingGuard: {
      activeAppointmentId: request.appointmentId,
      status: 'confirmed',
      updatedAt: request.requestedAt
    },
    auditEvent: planAuditEvent({
      eventId: `audit_${request.appointmentId}_confirmed`,
      occurredAt: request.requestedAt,
      action: 'appointment_confirmed',
      resourceId: request.appointmentId,
      before: null,
      after: {
        status: 'confirmed',
        slotId: slot.id
      },
      context: request.audit
    }),
    // The Calendar projection is only ever an intent recorded in the same
    // transaction. The worker performs the external effect afterwards.
    outboxJob: {
      id: `outbox_${request.appointmentId}_confirmed`,
      type: 'calendar_projection_requested',
      appointmentId: request.appointmentId,
      appointmentStatus: 'confirmed',
      // Calendar event ID 有嚴格字元限制，鍵一律由 calendar-event-id.ts 產生。
      // 一筆預約一個事件：後續的改期、到診、取消都指向同一個 ID。
      idempotencyKey: calendarEventIdForAppointment(request.appointmentId),
      status: 'pending',
      attempts: 0,
      createdAt: request.requestedAt
    },
    idempotencyRecord: planIdempotencyRecord(
      request.idempotency,
      request.appointmentId,
      request.requestedAt
    )
  };
}
