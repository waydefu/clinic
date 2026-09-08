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
import { assertUtcTimestamp } from './timestamp.js';

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

/** 同一人同時最多兩筆未結束的預約。 */
export const ACTIVE_BOOKING_LIMIT = 2;
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

/**
 * Snapshot of `patient_booking_guards/{patientId}`.
 *
 * The document is the patient-level contention point: every transaction that
 * changes the unfinished-appointment count reads and writes this same row, even
 * when the requests target different slots. Terminal appointments drop out of
 * the ID set; an empty set means the document is deleted.
 *
 * Legacy rows store a single `activeAppointmentId` (and optionally `status`).
 * `parsePatientBookingGuard` reads that form. The first mutation writes only
 * `activeAppointmentIds` and `updatedAt`.
 */
export interface PatientBookingGuardSnapshot {
  readonly activeAppointmentIds: readonly string[];
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
  readonly correlationId: string;
  readonly causationId: string;
  readonly appointmentStatus: 'confirmed';
  readonly idempotencyKey: string;
  readonly status: 'pending';
  readonly attempts: 0;
  readonly createdAt: string;
  /** 立即到期。worker 以 nextAttemptAt <= now 查詢，缺欄位的工作查不到。 */
  readonly nextAttemptAt: string;
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

export function parseSlotSnapshot(id: string, data: unknown): SlotSnapshot {
  assertIdentifier(id, 'id');

  try {
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error();
    }
    const record = data as Record<string, unknown>;
    if (
      Object.prototype.hasOwnProperty.call(record, 'schemaVersion') &&
      record['schemaVersion'] !== 1
    ) {
      throw new Error();
    }
    if (record['kind'] !== 'initial' && record['kind'] !== 'follow_up') {
      throw new Error();
    }
    if (typeof record['startsAt'] !== 'string') {
      throw new Error();
    }
    assertUtcTimestamp(record['startsAt'], 'startsAt');

    const hasReservationId = Object.prototype.hasOwnProperty.call(
      record,
      'reservationId'
    );
    const reservationId = record['reservationId'];
    if (
      hasReservationId &&
      reservationId !== null &&
      (typeof reservationId !== 'string' || reservationId === '')
    ) {
      throw new Error();
    }
    if (hasReservationId && typeof reservationId === 'string') {
      assertIdentifier(reservationId, 'reservationId');
    }

    return {
      id,
      kind: record['kind'],
      startsAt: record['startsAt'],
      ...(typeof reservationId === 'string' ? { reservationId } : {})
    };
  } catch {
    throw new DomainError('INVALID_VALUE', 'The slot is unreadable.');
  }
}

function uniqueIdentifiers(
  values: readonly unknown[],
  fieldName: string
): string[] {
  const identifiers: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== 'string') {
      throw new DomainError(
        'INVALID_VALUE',
        `${fieldName} must be opaque identifiers.`
      );
    }
    assertIdentifier(value, fieldName);
    if (seen.has(value)) {
      throw new DomainError(
        'INVALID_VALUE',
        `${fieldName} must not contain duplicates.`
      );
    }
    seen.add(value);
    identifiers.push(value);
  }
  return identifiers;
}

/**
 * Reads the canonical or legacy patient-guard document.
 *
 * New rows use `activeAppointmentIds`. Legacy rows use a single
 * `activeAppointmentId`. When both are present the array is the source of
 * truth so a partial write cannot double-count.
 */
export function parsePatientBookingGuard(
  data: unknown
): PatientBookingGuardSnapshot {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new DomainError(
      'INVALID_VALUE',
      'The patient booking guard is unreadable.'
    );
  }
  const record = data as Record<string, unknown>;
  const updatedAt = record['updatedAt'];
  if (typeof updatedAt !== 'string') {
    throw new DomainError(
      'INVALID_VALUE',
      'The patient booking guard is unreadable.'
    );
  }
  assertUtcTimestamp(updatedAt, 'updatedAt');

  const rawIds = record['activeAppointmentIds'];
  const ids =
    Array.isArray(rawIds) && rawIds.length > 0
      ? uniqueIdentifiers(rawIds, 'activeAppointmentIds')
      : typeof record['activeAppointmentId'] === 'string' &&
          record['activeAppointmentId'] !== ''
        ? uniqueIdentifiers(
            [record['activeAppointmentId']],
            'activeAppointmentId'
          )
        : undefined;

  if (ids === undefined || ids.length === 0) {
    throw new DomainError(
      'INVALID_VALUE',
      'The patient booking guard is unreadable.'
    );
  }

  return {
    activeAppointmentIds: ids,
    updatedAt
  };
}

export function patientBookingGuardHolds(
  guard: PatientBookingGuardSnapshot | undefined,
  appointmentId: string
): boolean {
  return guard?.activeAppointmentIds.includes(appointmentId) === true;
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
  const activeIds = patientBookingGuard?.activeAppointmentIds ?? [];
  assertWithinActiveBookingLimit(activeIds.length);
  if (activeIds.includes(request.appointmentId)) {
    throw new DomainError(
      'DUPLICATE_ACTIVE_BOOKING',
      'The patient already has the maximum number of active bookings.'
    );
  }

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
  const auditEvent = planAuditEvent({
    eventId: `audit_${request.appointmentId}_confirmed_${request.idempotency.recordId}`,
    occurredAt: request.requestedAt,
    action: 'appointment_confirmed',
    resourceType: 'appointment',
    resourceId: request.appointmentId,
    before: null,
    after: {
      status: 'confirmed',
      slotId: slot.id
    },
    context: request.audit
  });

  return {
    appointment,
    slotReservation: {
      slotId: slot.id,
      reservationId: request.appointmentId
    },
    patientBookingGuard: {
      activeAppointmentIds: [...activeIds, request.appointmentId],
      updatedAt: request.requestedAt
    },
    auditEvent,
    // The Calendar projection is only ever an intent recorded in the same
    // transaction. The worker performs the external effect afterwards.
    outboxJob: {
      id: `outbox_${request.appointmentId}_confirmed_${request.idempotency.recordId}`,
      type: 'calendar_projection_requested',
      appointmentId: request.appointmentId,
      correlationId: request.audit.correlationId,
      causationId: auditEvent.eventId,
      appointmentStatus: 'confirmed',
      // Calendar event ID 有嚴格字元限制，鍵一律由 calendar-event-id.ts 產生。
      // 一筆預約一個事件：後續的改期、到診、取消都指向同一個 ID。
      idempotencyKey: calendarEventIdForAppointment(request.appointmentId),
      status: 'pending',
      attempts: 0,
      createdAt: request.requestedAt,
      nextAttemptAt: request.requestedAt
    },
    idempotencyRecord: planIdempotencyRecord(
      request.idempotency,
      request.appointmentId,
      request.requestedAt
    )
  };
}
