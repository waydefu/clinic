import { describe, expect, it } from 'vitest';

import {
  planReschedule,
  planTransition,
  type AppointmentSnapshot,
  type AppointmentStatusValue,
  type AppointmentTransition
} from './appointment-transition.js';
import type { SlotSnapshot } from './booking-transaction.js';
import { fromCalendarEventId, isCalendarEventId } from './calendar-event-id.js';
import { DomainError } from './errors.js';

const NOW = '2026-07-21T09:00:00.000Z';

const appointment: AppointmentSnapshot = {
  id: 'appointment_001',
  slotId: 'slot_20300102_1200',
  patientId: 'patient_001',
  bookingKind: 'initial',
  status: 'confirmed'
};

const request = (
  transition: AppointmentTransition,
  overrides: Partial<AppointmentSnapshot> = {}
) =>
  ({
    plan: () =>
      planTransition(
        {
          appointmentId: 'appointment_001',
          transition,
          actorId: 'actor_front_desk_001',
          requestedAt: NOW,
          idempotencyKey: `idem_${transition}`
        },
        { ...appointment, ...overrides }
      )
  }) as const;

const codeOf = (run: () => unknown): string => {
  try {
    run();
  } catch (error) {
    return error instanceof DomainError ? error.code : 'NOT_A_DOMAIN_ERROR';
  }
  return 'NO_ERROR';
};

describe('planTransition', () => {
  it('maps each transition to its status and audit action', () => {
    const cases: [AppointmentTransition, AppointmentStatusValue, string][] = [
      [
        'request_cancellation',
        'cancellation_requested',
        'cancellation_requested'
      ],
      ['cancel', 'cancelled', 'appointment_cancelled'],
      ['complete', 'completed', 'appointment_completed'],
      ['no_show', 'no_show', 'appointment_no_show']
    ];
    for (const [transition, status, action] of cases) {
      const plan = request(transition).plan();
      expect(plan.nextStatus).toBe(status);
      expect(plan.auditEvent.action).toBe(action);
    }
  });

  // 取消與未到把時段還給其他患者；提出取消只是等櫃台確認，完成到診是已經
  // 發生的事實，兩者都不釋出。
  it('releases the slot only for cancel and no_show', () => {
    expect(request('cancel').plan().releaseSlotId).toBe(appointment.slotId);
    expect(request('no_show').plan().releaseSlotId).toBe(appointment.slotId);
    expect(request('complete').plan().releaseSlotId).toBeUndefined();
    expect(
      request('request_cancellation').plan().releaseSlotId
    ).toBeUndefined();
  });

  it('records completedAt only when completing', () => {
    expect(request('complete').plan().completedAt).toBe(NOW);
    expect(request('cancel').plan().completedAt).toBeUndefined();
  });

  it('gives each status its own calendar idempotency key', () => {
    const cancelKey = request('cancel').plan().outboxJob.idempotencyKey;
    const completeKey = request('complete').plan().outboxJob.idempotencyKey;
    // 鍵是編碼後的 Calendar event ID；解回來才是可讀的邏輯鍵。
    expect(fromCalendarEventId(cancelKey)).toBe(
      'calendar_cancelled_appointment_001'
    );
    expect(fromCalendarEventId(completeKey)).toBe(
      'calendar_completed_appointment_001'
    );
    expect(isCalendarEventId(cancelKey)).toBe(true);
    expect(isCalendarEventId(completeKey)).toBe(true);
  });

  it('allows cancel and no_show from a pending cancellation', () => {
    for (const transition of ['cancel', 'no_show'] as const) {
      expect(() =>
        request(transition, { status: 'cancellation_requested' }).plan()
      ).not.toThrow();
    }
  });

  it('refuses to complete or re-request cancellation once it is pending', () => {
    for (const transition of ['complete', 'request_cancellation'] as const) {
      expect(
        codeOf(() =>
          request(transition, { status: 'cancellation_requested' }).plan()
        )
      ).toBe('TRANSITION_NOT_ALLOWED');
    }
  });

  it('refuses every transition once the appointment has finished', () => {
    const finished: AppointmentStatusValue[] = [
      'cancelled',
      'completed',
      'no_show'
    ];
    const transitions: AppointmentTransition[] = [
      'request_cancellation',
      'cancel',
      'complete',
      'no_show'
    ];
    for (const status of finished)
      for (const transition of transitions)
        expect(codeOf(() => request(transition, { status }).plan())).toBe(
          'TRANSITION_NOT_ALLOWED'
        );
  });

  it('rejects an unknown appointment', () => {
    expect(
      codeOf(() =>
        planTransition(
          {
            appointmentId: 'appointment_404',
            transition: 'cancel',
            actorId: 'a',
            requestedAt: NOW,
            idempotencyKey: 'k'
          },
          undefined
        )
      )
    ).toBe('APPOINTMENT_NOT_FOUND');
  });
});

describe('planReschedule', () => {
  const target: SlotSnapshot = {
    id: 'slot_20300102_1230',
    kind: 'initial',
    startsAt: '2030-01-02T04:30:00.000Z'
  };
  const reschedule = (
    slot: SlotSnapshot | undefined,
    patch: Partial<AppointmentSnapshot> = {}
  ) =>
    planReschedule(
      {
        appointmentId: 'appointment_001',
        targetSlotId: slot?.id ?? 'missing',
        actorId: 'actor_front_desk_001',
        requestedAt: NOW,
        idempotencyKey: 'idem_reschedule'
      },
      { ...appointment, ...patch },
      slot
    );

  it('swaps the slots and returns to confirmed', () => {
    const plan = reschedule(target);
    expect(plan.releaseSlotId).toBe(appointment.slotId);
    expect(plan.reserveSlotId).toBe(target.id);
    expect(plan.startsAt).toBe(target.startsAt);
    expect(plan.nextStatus).toBe('confirmed');
  });

  it('keys the projection to the new slot so it is not mistaken for a resend', () => {
    const key = reschedule(target).outboxJob.idempotencyKey;
    expect(fromCalendarEventId(key)).toBe(
      'calendar_rescheduled_appointment_001_slot_20300102_1230'
    );
    expect(isCalendarEventId(key)).toBe(true);
  });

  it('rejects a taken, missing or same slot', () => {
    expect(
      codeOf(() => reschedule({ ...target, reservationId: 'appointment_002' }))
    ).toBe('SLOT_UNAVAILABLE');
    expect(codeOf(() => reschedule(undefined))).toBe('SLOT_UNAVAILABLE');
    expect(
      codeOf(() => reschedule({ ...target, id: appointment.slotId }))
    ).toBe('INVALID_VALUE');
  });

  it('refuses to move an initial visit onto a follow-up slot', () => {
    expect(codeOf(() => reschedule({ ...target, kind: 'follow_up' }))).toBe(
      'BOOKING_KIND_MISMATCH'
    );
  });

  it('refuses to reschedule a finished appointment', () => {
    for (const status of ['cancelled', 'completed', 'no_show'] as const)
      expect(codeOf(() => reschedule(target, { status }))).toBe(
        'TRANSITION_NOT_ALLOWED'
      );
  });
});
