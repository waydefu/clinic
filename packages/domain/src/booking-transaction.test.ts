import { describe, expect, it } from 'vitest';

import {
  parsePatientBookingGuard,
  planBooking,
  type BookingRequest,
  type PatientBookingGuardSnapshot,
  type SlotSnapshot
} from './booking-transaction.js';
import {
  calendarEventIdForAppointment,
  fromCalendarEventId,
  isCalendarEventId
} from './calendar-event-id.js';
import { DomainError } from './errors.js';

const request: BookingRequest = {
  appointmentId: 'appointment_001',
  slotId: 'slot_20300102_1200',
  patientId: 'patient_001',
  bookingKind: 'initial',
  itemId: 'service_snoring',
  audit: {
    actorId: 'actor_front_desk_001',
    actorRole: 'test_front_desk',
    correlationId: 'corr_booking_001',
    source: 'api',
    reasonCode: null,
    policyVersion: null
  },
  requestedAt: '2026-07-21T09:00:00.000Z',
  idempotency: {
    actorId: 'actor_front_desk_001',
    scope: 'appointment:create',
    requestHash: 'a'.repeat(64),
    recordId: 'b'.repeat(64)
  }
};

const openSlot: SlotSnapshot = {
  id: 'slot_20300102_1200',
  kind: 'initial',
  startsAt: '2030-01-02T04:00:00.000Z'
};

const activeGuard: PatientBookingGuardSnapshot = {
  activeAppointmentIds: ['appointment_existing'],
  updatedAt: '2026-07-21T08:00:00.000Z'
};

const twoActiveGuard: PatientBookingGuardSnapshot = {
  activeAppointmentIds: ['appointment_existing', 'appointment_other'],
  updatedAt: '2026-07-21T08:00:00.000Z'
};

const codeOf = (run: () => unknown): string => {
  try {
    run();
  } catch (error) {
    return error instanceof DomainError ? error.code : 'NOT_A_DOMAIN_ERROR';
  }
  return 'NO_ERROR';
};

describe('planBooking', () => {
  it('plans every write the transaction must apply', () => {
    const plan = planBooking(request, openSlot, undefined);

    expect(plan.appointment).toMatchObject({
      id: 'appointment_001',
      slotId: openSlot.id,
      startsAt: openSlot.startsAt,
      status: 'confirmed'
    });
    expect(plan.slotReservation).toEqual({
      slotId: openSlot.id,
      reservationId: 'appointment_001'
    });
    expect(plan.patientBookingGuard).toEqual({
      activeAppointmentIds: ['appointment_001'],
      updatedAt: request.requestedAt
    });
    expect(plan.auditEvent).toEqual({
      eventId: `audit_appointment_001_confirmed_${'b'.repeat(64)}`,
      occurredAt: request.requestedAt,
      actorId: 'actor_front_desk_001',
      actorRole: 'test_front_desk',
      action: 'appointment_confirmed',
      resourceType: 'appointment',
      resourceId: 'appointment_001',
      before: null,
      after: {
        status: 'confirmed',
        slotId: openSlot.id
      },
      reasonCode: null,
      result: 'succeeded',
      correlationId: 'corr_booking_001',
      source: 'api',
      policyVersion: null,
      schemaVersion: 2
    });
    expect(plan.outboxJob).toMatchObject({
      type: 'calendar_projection_requested',
      correlationId: 'corr_booking_001',
      causationId: `audit_appointment_001_confirmed_${'b'.repeat(64)}`,
      status: 'pending',
      attempts: 0
    });
    expect(plan.idempotencyRecord).toEqual({
      actorId: 'actor_front_desk_001',
      scope: 'appointment:create',
      requestHash: 'a'.repeat(64),
      responseReference: {
        resourceType: 'appointment',
        resourceId: 'appointment_001'
      },
      recordedAt: request.requestedAt,
      schemaVersion: 1
    });
  });

  it('is a pure function of its inputs', () => {
    const first = planBooking(request, openSlot, undefined);
    const second = planBooking(request, openSlot, undefined);
    expect(second).toEqual(first);
    // The planner must not mutate what it was given, or a transaction retry
    // would run against altered inputs.
    expect(openSlot.reservationId).toBeUndefined();
  });

  it('derives outbox and audit ids from the appointment so a retry cannot duplicate them', () => {
    const plan = planBooking(request, openSlot, undefined);
    expect(plan.outboxJob.id).toContain('appointment_001');
    expect(plan.auditEvent.eventId).toContain('appointment_001');
    // 鍵是編碼後的 Calendar event ID；解回來才是可讀的邏輯鍵。
    expect(plan.outboxJob.idempotencyKey).toBe(
      calendarEventIdForAppointment('appointment_001')
    );
    expect(fromCalendarEventId(plan.outboxJob.idempotencyKey)).toBe(
      'calendar_appointment_001'
    );
    expect(isCalendarEventId(plan.outboxJob.idempotencyKey)).toBe(true);
  });

  it('rejects a missing slot', () => {
    expect(codeOf(() => planBooking(request, undefined, undefined))).toBe(
      'SLOT_UNAVAILABLE'
    );
  });

  it('rejects an already reserved slot', () => {
    const taken = { ...openSlot, reservationId: 'appointment_000' };
    expect(codeOf(() => planBooking(request, taken, undefined))).toBe(
      'SLOT_UNAVAILABLE'
    );
  });

  it('rejects a slot belonging to the other booking grid', () => {
    const followUp: SlotSnapshot = { ...openSlot, kind: 'follow_up' };
    expect(codeOf(() => planBooking(request, followUp, undefined))).toBe(
      'BOOKING_KIND_MISMATCH'
    );
  });

  it('allows a second active booking and rejects a third', () => {
    const second = planBooking(request, openSlot, activeGuard);
    expect(second.patientBookingGuard).toEqual({
      activeAppointmentIds: ['appointment_existing', 'appointment_001'],
      updatedAt: request.requestedAt
    });
    expect(codeOf(() => planBooking(request, openSlot, twoActiveGuard))).toBe(
      'DUPLICATE_ACTIVE_BOOKING'
    );
  });

  it('does not add an appointment that is already in the guard', () => {
    expect(
      codeOf(() =>
        planBooking(request, openSlot, {
          activeAppointmentIds: ['appointment_001'],
          updatedAt: '2026-07-21T08:00:00.000Z'
        })
      )
    ).toBe('DUPLICATE_ACTIVE_BOOKING');
  });

  it('rejects malformed identifiers and timestamps', () => {
    expect(
      codeOf(() =>
        planBooking({ ...request, patientId: 'a b' }, openSlot, undefined)
      )
    ).toBe('INVALID_VALUE');
    expect(
      codeOf(() =>
        planBooking(
          { ...request, requestedAt: '2026-07-21T09:00:00+08:00' },
          openSlot,
          undefined
        )
      )
    ).toBe('INVALID_TIMESTAMP');
  });
});

describe('parsePatientBookingGuard', () => {
  it('reads the legacy single-id document', () => {
    expect(
      parsePatientBookingGuard({
        activeAppointmentId: 'appointment_legacy',
        status: 'confirmed',
        updatedAt: '2026-07-21T08:00:00.000Z'
      })
    ).toEqual({
      activeAppointmentIds: ['appointment_legacy'],
      updatedAt: '2026-07-21T08:00:00.000Z'
    });
  });

  it('reads the bounded-id document and prefers it over a leftover legacy field', () => {
    expect(
      parsePatientBookingGuard({
        activeAppointmentId: 'appointment_stale',
        activeAppointmentIds: ['appointment_a', 'appointment_b'],
        updatedAt: '2026-07-21T08:00:00.000Z'
      })
    ).toEqual({
      activeAppointmentIds: ['appointment_a', 'appointment_b'],
      updatedAt: '2026-07-21T08:00:00.000Z'
    });
  });

  it('rejects an unreadable or duplicate-id document', () => {
    expect(codeOf(() => parsePatientBookingGuard(undefined))).toBe(
      'INVALID_VALUE'
    );
    expect(
      codeOf(() =>
        parsePatientBookingGuard({
          activeAppointmentIds: ['appointment_a', 'appointment_a'],
          updatedAt: '2026-07-21T08:00:00.000Z'
        })
      )
    ).toBe('INVALID_VALUE');
  });
});
