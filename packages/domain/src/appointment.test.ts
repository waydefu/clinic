import { describe, expect, it } from 'vitest';

import {
  DomainError,
  markAppointmentCompleted,
  requestCancellation,
  reserveSlot
} from './index.js';

const confirmedAppointment = {
  id: 'appointment-001',
  patientId: 'patient-001',
  slotId: 'slot-001',
  status: 'confirmed' as const,
  createdAt: '2026-07-20T09:00:00.000Z',
  updatedAt: '2026-07-20T09:00:00.000Z'
};

describe('appointment invariants', () => {
  it('reserves a valid available slot exactly once', () => {
    const reserved = reserveSlot(
      {
        id: 'slot-001',
        startsAt: '2026-07-21T01:00:00.000Z',
        endsAt: '2026-07-21T01:30:00.000Z'
      },
      'appointment-001'
    );

    expect(reserved.reservationId).toBe('appointment-001');
    expect(() => reserveSlot(reserved, 'appointment-002')).toThrow(
      expect.objectContaining<Partial<DomainError>>({ code: 'SLOT_UNAVAILABLE' })
    );
  });

  it('uses the supplied cancellation cutoff without embedding a policy value', () => {
    const result = requestCancellation(
      confirmedAppointment,
      '2026-07-20T10:00:00.000Z',
      '2026-07-20T10:01:00.000Z'
    );

    expect(result.status).toBe('cancellation_requested');
    expect(() =>
      requestCancellation(
        confirmedAppointment,
        '2026-07-20T10:02:00.000Z',
        '2026-07-20T10:01:00.000Z'
      )
    ).toThrow(
      expect.objectContaining<Partial<DomainError>>({
        code: 'CANCELLATION_WINDOW_CLOSED'
      })
    );
  });

  it('only permits authorised clinic roles to mark a visit completed', () => {
    const completed = markAppointmentCompleted(
      confirmedAppointment,
      'front_desk',
      '2026-07-21T02:00:00.000Z'
    );

    expect(completed.status).toBe('completed');
    expect(completed.completedAt).toBe('2026-07-21T02:00:00.000Z');
    expect(() =>
      markAppointmentCompleted(
        confirmedAppointment,
        'case_manager' as never,
        '2026-07-21T02:00:00.000Z'
      )
    ).toThrow(
      expect.objectContaining<Partial<DomainError>>({
        code: 'COMPLETION_NOT_AUTHORIZED'
      })
    );
  });
});
