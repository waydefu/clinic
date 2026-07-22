import { describe, expect, it } from 'vitest';

import {
  planBooking,
  type BookingRequest,
  type SlotSnapshot
} from './booking-transaction.js';
import {
  calendarEventIdForStatus,
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
  actorId: 'actor_front_desk_001',
  requestedAt: '2026-07-21T09:00:00.000Z',
  idempotencyKey: 'idem_001'
};

const openSlot: SlotSnapshot = {
  id: 'slot_20300102_1200',
  kind: 'initial',
  startsAt: '2030-01-02T04:00:00.000Z'
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
    const plan = planBooking(request, openSlot, 0);

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
    expect(plan.auditEvent.action).toBe('appointment_confirmed');
    expect(plan.outboxJob).toMatchObject({
      type: 'calendar_projection_requested',
      status: 'pending',
      attempts: 0
    });
    expect(plan.idempotencyRecord).toMatchObject({
      key: 'idem_001',
      appointmentId: 'appointment_001'
    });
  });

  it('is a pure function of its inputs', () => {
    const first = planBooking(request, openSlot, 0);
    const second = planBooking(request, openSlot, 0);
    expect(second).toEqual(first);
    // The planner must not mutate what it was given, or a transaction retry
    // would run against altered inputs.
    expect(openSlot.reservationId).toBeUndefined();
  });

  it('derives outbox and audit ids from the appointment so a retry cannot duplicate them', () => {
    const plan = planBooking(request, openSlot, 0);
    expect(plan.outboxJob.id).toContain('appointment_001');
    expect(plan.auditEvent.id).toContain('appointment_001');
    // 鍵是編碼後的 Calendar event ID；解回來才是可讀的邏輯鍵。
    expect(plan.outboxJob.idempotencyKey).toBe(
      calendarEventIdForStatus('appointment_001', 'confirmed')
    );
    expect(fromCalendarEventId(plan.outboxJob.idempotencyKey)).toBe(
      'calendar_confirmed_appointment_001'
    );
    expect(isCalendarEventId(plan.outboxJob.idempotencyKey)).toBe(true);
  });

  it('rejects a missing slot', () => {
    expect(codeOf(() => planBooking(request, undefined, 0))).toBe(
      'SLOT_UNAVAILABLE'
    );
  });

  it('rejects an already reserved slot', () => {
    const taken = { ...openSlot, reservationId: 'appointment_000' };
    expect(codeOf(() => planBooking(request, taken, 0))).toBe(
      'SLOT_UNAVAILABLE'
    );
  });

  it('rejects a slot belonging to the other booking grid', () => {
    const followUp: SlotSnapshot = { ...openSlot, kind: 'follow_up' };
    expect(codeOf(() => planBooking(request, followUp, 0))).toBe(
      'BOOKING_KIND_MISMATCH'
    );
  });

  it('rejects a patient who already holds an active booking', () => {
    expect(codeOf(() => planBooking(request, openSlot, 1))).toBe(
      'DUPLICATE_ACTIVE_BOOKING'
    );
  });

  it('rejects malformed identifiers and timestamps', () => {
    expect(
      codeOf(() => planBooking({ ...request, patientId: 'a b' }, openSlot, 0))
    ).toBe('INVALID_VALUE');
    expect(
      codeOf(() =>
        planBooking(
          { ...request, requestedAt: '2026-07-21T09:00:00+08:00' },
          openSlot,
          0
        )
      )
    ).toBe('INVALID_TIMESTAMP');
  });
});
