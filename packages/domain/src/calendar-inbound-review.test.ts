import { describe, expect, it } from 'vitest';

import {
  assertCanReviewCalendarCandidate,
  canReviewCalendarCandidate,
  planCalendarCandidateReview,
  planCalendarInboundDetection,
  type ClinicAppointmentLiveSnapshot,
  type ClinicCalendarCandidateSnapshot
} from './calendar-inbound-review.js';
import { OPERATIONAL_ROLES, SYSTEM_ROLES } from './roles.js';

const APPOINTMENT: ClinicAppointmentLiveSnapshot = {
  appointmentId: 'appointment_001',
  bookingKind: 'follow_up',
  status: 'confirmed',
  startsAt: '2030-01-02T06:15:00.000Z',
  slotId: 'slot_follow_up_0615',
  version: 3
};

const PENDING: ClinicCalendarCandidateSnapshot = {
  candidateId: 'candidate_001',
  status: 'pending',
  changeType: 'reschedule',
  appointmentId: 'appointment_001',
  expectedStartsAt: '2030-01-02T06:15:00.000Z',
  expectedStatus: 'confirmed',
  proposedStartsAt: '2030-01-02T06:45:00.000Z',
  changedFields: ['startsAt', 'endsAt'],
  expectedVersion: 1
};

describe('calendar inbound review RBAC', () => {
  it('allows only manager and front_desk', () => {
    expect(canReviewCalendarCandidate('manager')).toBe(true);
    expect(canReviewCalendarCandidate('front_desk')).toBe(true);
    for (const role of [...OPERATIONAL_ROLES, ...SYSTEM_ROLES]) {
      if (role === 'manager' || role === 'front_desk') continue;
      expect(canReviewCalendarCandidate(role)).toBe(false);
    }
    expect(() => assertCanReviewCalendarCandidate('patient')).toThrow(
      /not authorized/
    );
  });
});

describe('calendar inbound detection', () => {
  it('does not open a review candidate for a self-projected echo', () => {
    expect(
      planCalendarInboundDetection({
        selfProjectedEcho: true,
        appointmentId: 'appointment_001',
        logicalKind: 'appointment',
        eventCancelled: false,
        liveAppointment: APPOINTMENT,
        proposedStartsAt: APPOINTMENT.startsAt
      })
    ).toEqual({ action: 'skip_echo' });
  });

  it('keeps unmatched Calendar events out of automatic appointment creation', () => {
    expect(
      planCalendarInboundDetection({
        selfProjectedEcho: false,
        eventCancelled: false,
        proposedStartsAt: '2030-01-02T06:00:00.000Z'
      })
    ).toEqual({
      action: 'candidate',
      status: 'unmatched',
      changeType: 'unmatched',
      changedFields: []
    });
  });

  it('turns a manual Calendar delete into a pending candidate without implying DB deletion', () => {
    expect(
      planCalendarInboundDetection({
        selfProjectedEcho: false,
        appointmentId: 'appointment_001',
        logicalKind: 'appointment',
        eventCancelled: true,
        liveAppointment: APPOINTMENT
      })
    ).toMatchObject({
      action: 'candidate',
      status: 'pending',
      changeType: 'delete',
      appointmentId: 'appointment_001'
    });
  });
});

describe('calendar candidate approve and reject', () => {
  it('lets manager and front_desk approve a valid published follow_up slot through domain reschedule', () => {
    const plan = planCalendarCandidateReview({
      role: 'manager',
      action: 'accept',
      candidate: PENDING,
      liveAppointment: APPOINTMENT,
      targetSlot: {
        id: 'slot_follow_up_0645',
        kind: 'follow_up',
        startsAt: '2030-01-02T06:45:00.000Z'
      }
    });
    expect(plan).toMatchObject({
      outcome: 'apply',
      command: 'reschedule',
      targetSlotId: 'slot_follow_up_0645',
      mutateAppointment: true,
      nextStatus: 'accepted'
    });
    expect(
      planCalendarCandidateReview({
        role: 'front_desk',
        action: 'accept',
        candidate: PENDING,
        liveAppointment: APPOINTMENT,
        targetSlot: {
          id: 'slot_follow_up_0645',
          kind: 'follow_up',
          startsAt: '2030-01-02T06:45:00.000Z'
        }
      }).outcome
    ).toBe('apply');
  });

  it('denies a patient approve and leaves the appointment untouched', () => {
    expect(
      planCalendarCandidateReview({
        role: 'patient',
        action: 'accept',
        candidate: PENDING,
        liveAppointment: APPOINTMENT
      })
    ).toEqual({ outcome: 'denied', reason: 'role' });
  });

  it('rejects without mutating the appointment and asks to restore Calendar', () => {
    expect(
      planCalendarCandidateReview({
        role: 'manager',
        action: 'reject',
        candidate: PENDING,
        liveAppointment: APPOINTMENT
      })
    ).toMatchObject({
      outcome: 'noop',
      nextStatus: 'rejected',
      restoreCalendar: true,
      mutateAppointment: false
    });
  });

  it('detects a stale candidate when the workbench moved the slot first', () => {
    expect(
      planCalendarCandidateReview({
        role: 'manager',
        action: 'accept',
        candidate: PENDING,
        liveAppointment: {
          ...APPOINTMENT,
          startsAt: '2030-01-02T06:45:00.000Z',
          slotId: 'slot_follow_up_0645'
        },
        targetSlot: {
          id: 'slot_follow_up_0745',
          kind: 'follow_up',
          startsAt: '2030-01-02T07:45:00.000Z'
        }
      })
    ).toMatchObject({
      outcome: 'conflict',
      nextStatus: 'superseded',
      reason: 'stale',
      mutateAppointment: false
    });
  });

  it('refuses follow_up moved onto a :30 initial grid point', () => {
    expect(
      planCalendarCandidateReview({
        role: 'manager',
        action: 'accept',
        candidate: {
          ...PENDING,
          proposedStartsAt: '2030-01-02T06:30:00.000Z'
        },
        liveAppointment: APPOINTMENT,
        targetSlot: {
          id: 'slot_initial_0630',
          kind: 'initial',
          startsAt: '2030-01-02T06:30:00.000Z'
        }
      })
    ).toMatchObject({
      outcome: 'conflict',
      reason: 'off_grid',
      mutateAppointment: false
    });
  });

  it('does not invent an appointment from an unmatched Calendar event', () => {
    expect(
      planCalendarCandidateReview({
        role: 'manager',
        action: 'accept',
        candidate: {
          candidateId: 'candidate_unmatched',
          status: 'unmatched',
          changeType: 'unmatched',
          changedFields: [],
          expectedVersion: 0
        }
      })
    ).toMatchObject({
      outcome: 'conflict',
      reason: 'unmatched',
      mutateAppointment: false
    });
  });
});

describe('calendar candidate review and the appointment status since detection', () => {
  const TARGET = {
    id: 'slot_follow_up_0645',
    kind: 'follow_up' as const,
    startsAt: '2030-01-02T06:45:00.000Z'
  };
  const plan = (
    liveStatus: ClinicAppointmentLiveSnapshot['status'],
    candidate: ClinicCalendarCandidateSnapshot
  ) =>
    planCalendarCandidateReview({
      role: 'manager',
      action: 'accept',
      candidate,
      liveAppointment: { ...APPOINTMENT, status: liveStatus },
      targetSlot: TARGET
    });
  const withoutRecordedStatus = (
    candidate: ClinicCalendarCandidateSnapshot
  ): ClinicCalendarCandidateSnapshot => {
    const { expectedStatus: _recorded, ...rest } = candidate;
    return rest;
  };
  const DELETE: ClinicCalendarCandidateSnapshot = {
    ...PENDING,
    changeType: 'delete',
    changedFields: []
  };

  it.each(['arrived', 'cancelled', 'completed', 'no_show'] as const)(
    'supersedes a candidate that saw a confirmed appointment once it is %s',
    (status) => {
      for (const candidate of [PENDING, DELETE])
        expect(plan(status, candidate)).toMatchObject({
          outcome: 'conflict',
          nextStatus: 'superseded',
          reason: 'stale',
          mutateAppointment: false
        });
    }
  );

  it('still applies a candidate whose appointment kept the recorded status', () => {
    expect(plan('confirmed', PENDING)).toMatchObject({
      outcome: 'apply',
      command: 'reschedule'
    });
    expect(plan('confirmed', DELETE)).toMatchObject({
      outcome: 'apply',
      command: 'cancel'
    });
  });

  it('compares with the recorded status even when the live one is open', () => {
    expect(
      plan('arrived', { ...PENDING, expectedStatus: 'confirmed' }).outcome
    ).toBe('conflict');
    expect(
      plan('arrived', { ...PENDING, expectedStatus: 'arrived' }).outcome
    ).toBe('apply');
  });

  describe('a candidate that recorded no status', () => {
    it.each(['cancelled', 'completed', 'no_show'] as const)(
      'fails closed when the appointment is %s',
      (status) => {
        for (const candidate of [PENDING, DELETE])
          expect(plan(status, withoutRecordedStatus(candidate))).toMatchObject({
            outcome: 'conflict',
            nextStatus: 'superseded',
            reason: 'stale',
            mutateAppointment: false
          });
      }
    );

    it.each(['confirmed', 'arrived', 'cancellation_requested'] as const)(
      'stays approvable while the appointment is %s, a status reschedule and cancel accept',
      (status) => {
        expect(plan(status, withoutRecordedStatus(PENDING)).outcome).toBe(
          'apply'
        );
        expect(plan(status, withoutRecordedStatus(DELETE)).outcome).toBe(
          'apply'
        );
      }
    );
  });

  it('does not let the status check change a rejection', () => {
    expect(
      planCalendarCandidateReview({
        role: 'manager',
        action: 'reject',
        candidate: PENDING,
        liveAppointment: { ...APPOINTMENT, status: 'cancelled' }
      })
    ).toMatchObject({ outcome: 'noop', nextStatus: 'rejected' });
  });
});
