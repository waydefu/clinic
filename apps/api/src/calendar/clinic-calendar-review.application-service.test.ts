import { describe, expect, it, vi } from 'vitest';
import type { ReviewCalendarCandidateResponse } from '@beauessence/contracts';

import {
  AuthorizationDeniedError,
  ConflictError
} from '../platform/errors/api-error.js';
import {
  ClinicCalendarReviewApplicationService,
  type ClinicCalendarCandidateRecord,
  type ClinicCalendarCandidateStore,
  type ClinicCalendarReviewCommand,
  type ClinicCalendarReviewDecider,
  type ClinicCalendarReviewDecision
} from './clinic-calendar-review.application-service.js';
import type { AppointmentRecord } from '../appointments/appointment.repository-port.js';

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

/**
 * Stands in for the Firestore store. Like the real one it runs the decision
 * against one candidate/appointment/idempotency state, then applies the whole
 * decision or none of it, so the application service is tested for the order of
 * its checks and for what it asks the store to commit together.
 */
function harness(
  overrides: {
    readonly live?: AppointmentRecord | undefined;
    readonly candidate?: ClinicCalendarCandidateRecord;
  } = {}
) {
  const appointment = 'live' in overrides ? overrides.live : live;
  let stored = { ...(overrides.candidate ?? pending) };
  const idempotency = new Map<
    string,
    {
      readonly fingerprint: string;
      readonly response: ReviewCalendarCandidateResponse;
    }
  >();
  const reschedule = vi.fn();
  const transition = vi.fn();
  const readAppointment = vi.fn().mockResolvedValue(appointment);
  const findSlot = vi.fn().mockResolvedValue({
    id: 'slot_follow_up_0645',
    kind: 'follow_up',
    startsAt: '2030-01-02T06:45:00.000Z'
  });
  const replay = vi.fn();
  const committed = vi.fn();

  const review = vi
    .fn()
    .mockImplementation(
      async (
        command: ClinicCalendarReviewCommand,
        decide: ClinicCalendarReviewDecider
      ): Promise<ReviewCalendarCandidateResponse | undefined> => {
        const key = `${command.actorId}:${command.idempotencyKey}`;
        const fingerprint = JSON.stringify({
          candidateId: command.candidateId,
          action: command.action,
          expectedVersion: command.expectedVersion
        });
        const decision: ClinicCalendarReviewDecision = await decide(stored, {
          readAppointment,
          findSlot,
          replay: () => {
            replay();
            const recorded = idempotency.get(key);
            if (recorded === undefined) return Promise.resolve(undefined);
            if (recorded.fingerprint !== fingerprint) throw new ConflictError();
            return Promise.resolve(recorded.response);
          }
        });
        if (decision.kind === 'defer') return undefined;
        if (decision.kind === 'replay') return decision.response;
        if (decision.change?.command === 'reschedule')
          reschedule(decision.change.request);
        if (decision.change?.command === 'cancel')
          transition(decision.change.request);
        committed(decision);
        stored = {
          ...stored,
          status: decision.status,
          expectedVersion: stored.expectedVersion + 1
        };
        const response: ReviewCalendarCandidateResponse = {
          candidate: {
            candidateId: stored.candidateId,
            kind: stored.kind,
            status: decision.status,
            displayLabel: stored.displayLabel,
            startsAt: stored.startsAt,
            endsAt: stored.endsAt,
            sourceVersion: stored.sourceVersion,
            expectedVersion: stored.expectedVersion,
            validationErrors: stored.validationErrors,
            createdAt: stored.createdAt,
            before: stored.before,
            ...(stored.appointmentId === undefined
              ? {}
              : { appointmentId: stored.appointmentId })
          },
          projection: null
        };
        idempotency.set(key, { fingerprint, response });
        return response;
      }
    );
  const candidates: ClinicCalendarCandidateStore = { review };
  const service = new ClinicCalendarReviewApplicationService(
    candidates,
    () => NOW
  );
  return {
    service,
    review,
    reschedule,
    transition,
    committed,
    readAppointment,
    findSlot,
    replay
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
    expect(reschedule).toHaveBeenCalledWith(
      expect.objectContaining({
        appointmentId: 'appointment_001',
        targetSlotId: 'slot_follow_up_0645',
        requestedAt: NOW
      })
    );
    expect(transition).not.toHaveBeenCalled();
  });

  it('commits the appointment change and the candidate decision as one store request', async () => {
    const { service, review, committed } = harness();
    await service.tryReview({
      candidateId: 'candidate_001',
      action: 'accept',
      command: {
        idempotencyKey: 'calendar_candidate_0012',
        expectedVersion: 1
      },
      authentication: { actorId: 'manager_001', actorRole: 'manager' }
    });
    // One request carries the whole decision; there is no second step a
    // concurrent review could slip between.
    expect(review).toHaveBeenCalledOnce();
    expect(committed).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'accepted',
        change: expect.objectContaining({ command: 'reschedule' })
      })
    );
  });

  it('approves a Calendar delete through the domain cancel transition', async () => {
    const { service, reschedule, transition } = harness({
      candidate: { ...pending, kind: 'cancel_appointment', startsAt: null }
    });
    const accepted = await service.tryReview({
      candidateId: 'candidate_001',
      action: 'accept',
      command: {
        idempotencyKey: 'calendar_candidate_0013',
        expectedVersion: 1
      },
      authentication: { actorId: 'manager_001', actorRole: 'manager' }
    });
    expect(accepted?.candidate.status).toBe('accepted');
    expect(transition).toHaveBeenCalledOnce();
    expect(transition).toHaveBeenCalledWith(
      expect.objectContaining({
        appointmentId: 'appointment_001',
        transition: 'cancel'
      })
    );
    expect(reschedule).not.toHaveBeenCalled();
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
    expect(denied.review).not.toHaveBeenCalled();
    expect(denied.reschedule).not.toHaveBeenCalled();
  });

  it('rejects without mutating the appointment', async () => {
    const { service, reschedule, committed } = harness();
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
    expect(committed).toHaveBeenCalledWith(
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
    const { service, reschedule, findSlot } = harness({
      candidate: {
        ...pending,
        startsAt: '2030-01-02T06:30:00.000Z',
        endsAt: '2030-01-02T07:00:00.000Z'
      }
    });
    findSlot.mockResolvedValue({
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
    const { service, replay } = harness({
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
    expect(replay).not.toHaveBeenCalled();
  });

  it('defers a replayed review of a non-clinic appointment so the CAL-PILOT idempotency record answers it', async () => {
    const { service, committed, replay } = harness({
      live: undefined,
      candidate: {
        ...pending,
        status: 'rejected',
        expectedVersion: 2,
        appointmentId: undefined,
        localRecordId: 'c1_synthetic_appointment_001'
      }
    });
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
    expect(committed).not.toHaveBeenCalled();
    expect(replay).not.toHaveBeenCalled();
  });

  it('fails closed on a stale expectedVersion', async () => {
    const { service, committed } = harness();
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
    expect(committed).not.toHaveBeenCalled();
  });

  it('rejects unmatched Calendar events without creating an appointment', async () => {
    const { service, reschedule, committed } = harness({
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
    expect(committed).toHaveBeenCalledWith(
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

describe('ClinicCalendarReviewApplicationService idempotent retries', () => {
  const approve = (idempotencyKey: string, expectedVersion = 1) => ({
    candidateId: 'candidate_001',
    action: 'accept' as const,
    command: { idempotencyKey, expectedVersion },
    authentication: { actorId: 'manager_001', actorRole: 'manager' as const }
  });

  it('answers a retry of a decided request with the first result, before any version or state check', async () => {
    const { service, reschedule, committed } = harness();
    const first = await service.tryReview(approve('calendar_candidate_0020'));
    // The candidate is now at version 2 and the appointment has moved, so both
    // the version and the state checks would refuse this retry.
    const retry = await service.tryReview(approve('calendar_candidate_0020'));

    expect(first?.candidate).toMatchObject({
      status: 'accepted',
      expectedVersion: 2
    });
    expect(retry).toEqual(first);
    expect(reschedule).toHaveBeenCalledOnce();
    expect(committed).toHaveBeenCalledOnce();
  });

  it('replays a rejection and an unmatched rejection the same way', async () => {
    const rejecting = harness();
    const firstReject = await rejecting.service.tryReview({
      ...approve('calendar_candidate_0021'),
      action: 'reject'
    });
    await expect(
      rejecting.service.tryReview({
        ...approve('calendar_candidate_0021'),
        action: 'reject'
      })
    ).resolves.toEqual(firstReject);
    expect(rejecting.committed).toHaveBeenCalledOnce();

    const unmatched = harness({
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
    const firstUnmatched = await unmatched.service.tryReview({
      ...approve('calendar_candidate_0022'),
      action: 'reject'
    });
    await expect(
      unmatched.service.tryReview({
        ...approve('calendar_candidate_0022'),
        action: 'reject'
      })
    ).resolves.toEqual(firstUnmatched);
    expect(unmatched.committed).toHaveBeenCalledOnce();
  });

  it('refuses the same key reused for different content', async () => {
    const { service, committed } = harness();
    await service.tryReview(approve('calendar_candidate_0023'));

    await expect(
      service.tryReview({
        ...approve('calendar_candidate_0023'),
        action: 'reject'
      })
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      service.tryReview(approve('calendar_candidate_0023', 2))
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      service.tryReview({
        ...approve('calendar_candidate_0023'),
        candidateId: 'candidate_002'
      })
    ).rejects.toBeInstanceOf(ConflictError);
    expect(committed).toHaveBeenCalledOnce();
  });

  it('still refuses a new key against a version that is genuinely stale', async () => {
    const { service, committed } = harness();
    await service.tryReview(approve('calendar_candidate_0024'));

    await expect(
      service.tryReview(approve('calendar_candidate_0025'))
    ).rejects.toBeInstanceOf(ConflictError);
    // Another actor holding the same key string is not a retry either.
    await expect(
      service.tryReview({
        ...approve('calendar_candidate_0024'),
        authentication: { actorId: 'front_001', actorRole: 'front_desk' }
      })
    ).rejects.toBeInstanceOf(ConflictError);
    expect(committed).toHaveBeenCalledOnce();
  });
});

describe('ClinicCalendarReviewApplicationService appointment status drift', () => {
  const approve = (idempotencyKey: string) => ({
    candidateId: 'candidate_001',
    action: 'accept' as const,
    command: { idempotencyKey, expectedVersion: 1 },
    authentication: { actorId: 'manager_001', actorRole: 'manager' as const }
  });
  const recorded: ClinicCalendarCandidateRecord = {
    ...pending,
    appointmentStatusAtDetection: 'confirmed'
  };
  const cancelCandidate: ClinicCalendarCandidateRecord = {
    ...recorded,
    kind: 'cancel_appointment',
    startsAt: null
  };

  it.each(['cancelled', 'arrived', 'completed', 'no_show'] as const)(
    'supersedes a reschedule candidate when the appointment became %s after detection',
    async (status) => {
      const { service, reschedule, transition, committed } = harness({
        live: { ...live, status },
        candidate: recorded
      });
      const result = await service.tryReview(
        approve('calendar_candidate_0040')
      );
      expect(result?.candidate.status).toBe('superseded');
      expect(reschedule).not.toHaveBeenCalled();
      expect(transition).not.toHaveBeenCalled();
      expect(committed).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'superseded' })
      );
      expect(committed).not.toHaveBeenCalledWith(
        expect.objectContaining({ change: expect.anything() })
      );
    }
  );

  it('supersedes a Calendar delete candidate when the appointment was already cancelled', async () => {
    const { service, reschedule, transition } = harness({
      live: { ...live, status: 'cancelled' },
      candidate: cancelCandidate
    });
    const result = await service.tryReview(approve('calendar_candidate_0041'));
    expect(result?.candidate.status).toBe('superseded');
    expect(transition).not.toHaveBeenCalled();
    expect(reschedule).not.toHaveBeenCalled();
  });

  it('still approves when the appointment is in the status the candidate recorded', async () => {
    const { service, reschedule } = harness({ candidate: recorded });
    const result = await service.tryReview(approve('calendar_candidate_0042'));
    expect(result?.candidate.status).toBe('accepted');
    expect(reschedule).toHaveBeenCalledOnce();
  });

  it('compares against the recorded status, not the live one, for any recorded value', async () => {
    const { service, reschedule } = harness({
      live: { ...live, status: 'arrived' },
      candidate: { ...recorded, appointmentStatusAtDetection: 'confirmed' }
    });
    const result = await service.tryReview(approve('calendar_candidate_0043'));
    expect(result?.candidate.status).toBe('superseded');
    expect(reschedule).not.toHaveBeenCalled();
  });

  describe('a candidate that recorded no status (written before the field existed)', () => {
    it.each(['cancelled', 'completed', 'no_show'] as const)(
      'fails closed when the appointment is %s',
      async (status) => {
        const { service, reschedule, transition } = harness({
          live: { ...live, status },
          candidate: pending
        });
        const result = await service.tryReview(
          approve('calendar_candidate_0044')
        );
        expect(result?.candidate.status).toBe('superseded');
        expect(reschedule).not.toHaveBeenCalled();
        expect(transition).not.toHaveBeenCalled();
      }
    );

    it.each(['confirmed', 'arrived', 'cancellation_requested'] as const)(
      'may still be approved while the appointment is %s, the statuses reschedule accepts',
      async (status) => {
        const { service, reschedule } = harness({
          live: { ...live, status },
          candidate: pending
        });
        const result = await service.tryReview(
          approve('calendar_candidate_0045')
        );
        expect(result?.candidate.status).toBe('accepted');
        expect(reschedule).toHaveBeenCalledOnce();
      }
    );

    it('treats an unreadable recorded status like a missing one', async () => {
      const { service, reschedule } = harness({
        live: { ...live, status: 'cancelled' },
        candidate: { ...pending, appointmentStatusAtDetection: 'not_a_status' }
      });
      const result = await service.tryReview(
        approve('calendar_candidate_0046')
      );
      expect(result?.candidate.status).toBe('superseded');
      expect(reschedule).not.toHaveBeenCalled();
    });
  });
});
