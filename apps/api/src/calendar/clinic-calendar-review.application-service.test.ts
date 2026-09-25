import { describe, expect, it, vi } from 'vitest';

import {
  AuthorizationDeniedError,
  ConflictError
} from '../platform/errors/api-error.js';
import {
  ClinicCalendarReviewApplicationService,
  type ClinicCalendarCandidateRecord,
  type ClinicCalendarCandidateStore,
  type ClinicSlotLookup
} from './clinic-calendar-review.application-service.js';
import type {
  AppointmentRecord,
  AppointmentRepositoryPort
} from '../appointments/appointment.repository-port.js';

const NOW = '2030-01-02T00:00:00.000Z';

const live: AppointmentRecord = {
  appointmentId: 'appointment_001',
  patientId: 'patient_001',
  slotId: 'slot_follow_up_0615',
  bookingKind: 'follow_up',
  status: 'confirmed',
  startsAt: '2030-01-02T06:15:00.000Z'
};

const pending: ClinicCalendarCandidateRecord = {
  candidateId: 'candidate_001',
  status: 'pending',
  kind: 'update_appointment',
  displayLabel: '回診改期',
  startsAt: '2030-01-02T06:45:00.000Z',
  endsAt: '2030-01-02T07:15:00.000Z',
  sourceVersion: 1,
  expectedVersion: 1,
  validationErrors: [],
  createdAt: NOW,
  before: {
    kind: 'appointment',
    displayLabel: '回診',
    startsAt: '2030-01-02T06:15:00.000Z',
    endsAt: '2030-01-02T06:45:00.000Z'
  },
  appointmentId: 'appointment_001',
  localRecordId: 'appointment_001'
};

function harness(
  overrides: {
    readonly live?: AppointmentRecord;
    readonly candidate?: ClinicCalendarCandidateRecord;
  } = {}
) {
  const reschedule = vi.fn().mockResolvedValue({
    appointmentId: 'appointment_001',
    replayed: false,
    startsAt: '2030-01-02T06:45:00.000Z'
  });
  const transition = vi.fn().mockResolvedValue({
    appointmentId: 'appointment_001',
    replayed: false,
    status: 'cancelled'
  });
  const appointments = {
    read: vi.fn().mockResolvedValue(overrides.live ?? live),
    reschedule,
    transition,
    reserve: vi.fn(),
    recordFollowUp: vi.fn(),
    deleteAppointment: vi.fn(),
    patientIdOf: vi.fn()
  } as unknown as AppointmentRepositoryPort;
  let stored = { ...(overrides.candidate ?? pending) };
  const markReviewed = vi.fn().mockImplementation((input) => {
    stored = {
      ...stored,
      status: input.status,
      expectedVersion: stored.expectedVersion + 1
    };
    return Promise.resolve({
      candidateId: stored.candidateId,
      kind: stored.kind,
      status: input.status,
      displayLabel: stored.displayLabel,
      startsAt: stored.startsAt,
      endsAt: stored.endsAt,
      sourceVersion: stored.sourceVersion,
      expectedVersion: stored.expectedVersion,
      validationErrors: stored.validationErrors,
      createdAt: stored.createdAt,
      before: stored.before,
      appointmentId: stored.appointmentId
    });
  });
  const candidates: ClinicCalendarCandidateStore = {
    read: vi.fn().mockImplementation(() => Promise.resolve(stored)),
    markReviewed
  };
  const slots: ClinicSlotLookup = {
    find: vi.fn().mockResolvedValue({
      id: 'slot_follow_up_0645',
      kind: 'follow_up',
      startsAt: '2030-01-02T06:45:00.000Z'
    })
  };
  const service = new ClinicCalendarReviewApplicationService(
    appointments,
    candidates,
    slots,
    () => NOW
  );
  return {
    service,
    appointments,
    reschedule,
    transition,
    candidates,
    markReviewed,
    slots
  };
}

describe('ClinicCalendarReviewApplicationService', () => {
  it('approves a valid follow_up slot through domain reschedule and leaves reject off that path', async () => {
    const { service, reschedule, transition } = harness();
    const accepted = await service.tryReview({
      candidateId: 'candidate_001',
      action: 'accept',
      command: {
        idempotencyKey: 'calendar_candidate_0001',
        expectedVersion: 1
      },
      authentication: { actorId: 'manager_001', actorRole: 'manager' }
    });
    expect(accepted?.candidate.status).toBe('accepted');
    expect(reschedule).toHaveBeenCalledOnce();
    expect(transition).not.toHaveBeenCalled();
  });

  it('lets front_desk approve and denies a patient', async () => {
    const allowed = harness();
    await expect(
      allowed.service.tryReview({
        candidateId: 'candidate_001',
        action: 'accept',
        command: {
          idempotencyKey: 'calendar_candidate_0002',
          expectedVersion: 1
        },
        authentication: { actorId: 'front_001', actorRole: 'front_desk' }
      })
    ).resolves.toMatchObject({ candidate: { status: 'accepted' } });

    const denied = harness();
    await expect(
      denied.service.tryReview({
        candidateId: 'candidate_001',
        action: 'accept',
        command: {
          idempotencyKey: 'calendar_candidate_0003',
          expectedVersion: 1
        },
        authentication: { actorId: 'patient_001', actorRole: 'patient' }
      })
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    expect(denied.reschedule).not.toHaveBeenCalled();
  });

  it('rejects without mutating the appointment', async () => {
    const { service, reschedule, markReviewed } = harness();
    const rejected = await service.tryReview({
      candidateId: 'candidate_001',
      action: 'reject',
      command: {
        idempotencyKey: 'calendar_candidate_0004',
        expectedVersion: 1
      },
      authentication: { actorId: 'manager_001', actorRole: 'manager' }
    });
    expect(rejected?.candidate.status).toBe('rejected');
    expect(reschedule).not.toHaveBeenCalled();
    expect(markReviewed).toHaveBeenCalledWith(
      expect.objectContaining({ restoreCalendar: true, status: 'rejected' })
    );
  });

  it('does not overwrite when the DB moved before approval', async () => {
    const { service, reschedule } = harness({
      live: {
        ...live,
        startsAt: '2030-01-02T06:45:00.000Z',
        slotId: 'slot_follow_up_0645'
      }
    });
    const result = await service.tryReview({
      candidateId: 'candidate_001',
      action: 'accept',
      command: {
        idempotencyKey: 'calendar_candidate_0005',
        expectedVersion: 1
      },
      authentication: { actorId: 'manager_001', actorRole: 'manager' }
    });
    expect(result?.candidate.status).toBe('superseded');
    expect(reschedule).not.toHaveBeenCalled();
  });

  it('refuses follow_up moved to a :30 slot', async () => {
    const { service, reschedule, slots } = harness({
      candidate: {
        ...pending,
        startsAt: '2030-01-02T06:30:00.000Z',
        endsAt: '2030-01-02T07:00:00.000Z'
      }
    });
    (slots.find as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'slot_initial_0630',
      kind: 'initial',
      startsAt: '2030-01-02T06:30:00.000Z'
    });
    const result = await service.tryReview({
      candidateId: 'candidate_001',
      action: 'accept',
      command: {
        idempotencyKey: 'calendar_candidate_0006',
        expectedVersion: 1
      },
      authentication: { actorId: 'manager_001', actorRole: 'manager' }
    });
    expect(result?.candidate.status).toBe('conflict');
    expect(reschedule).not.toHaveBeenCalled();
  });

  it('ignores candidates that are not clinic appointments', async () => {
    const { service } = harness({
      candidate: { ...pending, appointmentId: null, localRecordId: undefined }
    });
    await expect(
      service.tryReview({
        candidateId: 'candidate_001',
        action: 'accept',
        command: {
          idempotencyKey: 'calendar_candidate_0007',
          expectedVersion: 1
        },
        authentication: { actorId: 'manager_001', actorRole: 'manager' }
      })
    ).resolves.toBeUndefined();
  });

  it('defers a replayed review of a non-clinic appointment so the CAL-PILOT idempotency record answers it', async () => {
    const { service, appointments, markReviewed } = harness({
      candidate: {
        ...pending,
        status: 'rejected',
        expectedVersion: 2,
        appointmentId: undefined,
        localRecordId: 'c1_synthetic_appointment_001'
      }
    });
    (appointments.read as ReturnType<typeof vi.fn>).mockResolvedValue(
      undefined
    );
    await expect(
      service.tryReview({
        candidateId: 'candidate_001',
        action: 'reject',
        command: {
          idempotencyKey: 'calendar_candidate_0011',
          expectedVersion: 1
        },
        authentication: { actorId: 'manager_001', actorRole: 'manager' }
      })
    ).resolves.toBeUndefined();
    expect(markReviewed).not.toHaveBeenCalled();
  });

  it('fails closed on a stale expectedVersion', async () => {
    const { service } = harness();
    await expect(
      service.tryReview({
        candidateId: 'candidate_001',
        action: 'accept',
        command: {
          idempotencyKey: 'calendar_candidate_0008',
          expectedVersion: 9
        },
        authentication: { actorId: 'manager_001', actorRole: 'manager' }
      })
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects unmatched Calendar events without creating an appointment', async () => {
    const { service, reschedule, markReviewed } = harness({
      candidate: {
        ...pending,
        kind: 'unmatched',
        status: 'unmatched',
        appointmentId: null,
        localRecordId: undefined,
        startsAt: null,
        endsAt: null,
        before: null
      }
    });
    const rejected = await service.tryReview({
      candidateId: 'candidate_001',
      action: 'reject',
      command: {
        idempotencyKey: 'calendar_candidate_0009',
        expectedVersion: 1
      },
      authentication: { actorId: 'manager_001', actorRole: 'manager' }
    });
    expect(rejected?.candidate.status).toBe('rejected');
    expect(reschedule).not.toHaveBeenCalled();
    expect(markReviewed).toHaveBeenCalledWith(
      expect.objectContaining({ restoreCalendar: false, status: 'rejected' })
    );

    const denied = harness({
      candidate: {
        ...pending,
        kind: 'unmatched',
        status: 'unmatched',
        appointmentId: null,
        localRecordId: undefined
      }
    });
    const accepted = await denied.service.tryReview({
      candidateId: 'candidate_001',
      action: 'accept',
      command: {
        idempotencyKey: 'calendar_candidate_0010',
        expectedVersion: 1
      },
      authentication: { actorId: 'manager_001', actorRole: 'manager' }
    });
    expect(accepted?.candidate.status).toBe('conflict');
    expect(denied.reschedule).not.toHaveBeenCalled();
  });
});
