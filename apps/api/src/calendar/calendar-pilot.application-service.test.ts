import { DomainError, ROLES } from '@beauessence/domain';
import { describe, expect, it, vi } from 'vitest';

import { AuthorizationDeniedError } from '../platform/errors/api-error.js';
import { CalendarPilotApplicationService } from './calendar-pilot.application-service.js';
import type { CalendarPilotRepositoryPort } from './calendar-pilot.repository-port.js';

const NOW = '2026-08-28T08:00:00.000Z';

function repository() {
  const listCandidates = vi.fn().mockResolvedValue([]);
  const requestSourcePreflight = vi
    .fn()
    .mockResolvedValue({ preflightId: 'p1' });
  const reviewCandidate = vi
    .fn()
    .mockResolvedValue({ candidate: {}, projection: null });
  const correctCandidate = vi
    .fn()
    .mockResolvedValue({ candidate: {}, projection: null });
  const port = {
    getStatus: vi.fn(),
    listSources: vi.fn().mockResolvedValue([]),
    listCandidates,
    getAvailability: vi.fn(),
    listSyntheticAppointments: vi.fn().mockResolvedValue([]),
    listSyntheticPatients: vi.fn().mockResolvedValue([]),
    getSourcePreflight: vi.fn(),
    requestSourcePreflight,
    activateSource: vi.fn(),
    rollbackSource: vi.fn(),
    reviewCandidate,
    correctCandidate,
    createSyntheticAppointment: vi.fn(),
    rescheduleSyntheticAppointment: vi.fn(),
    cancelSyntheticAppointment: vi.fn()
  } as unknown as CalendarPilotRepositoryPort;
  return {
    port,
    listCandidates,
    requestSourcePreflight,
    reviewCandidate,
    correctCandidate
  };
}

describe('CalendarPilotApplicationService role boundary', () => {
  it('returns suggestions to clinic employees and denies other roles', async () => {
    const repo = repository();
    const suggested = {
      candidateId: 'candidate_001',
      kind: 'unmatched' as const,
      status: 'unmatched' as const,
      displayLabel: '未對應事件',
      startsAt: '2026-08-28T04:00:00.000Z',
      endsAt: '2026-08-28T04:30:00.000Z',
      sourceVersion: 1,
      expectedVersion: 0,
      validationErrors: ['title_format_invalid' as const],
      createdAt: NOW,
      before: null,
      suggestedPatientId: 'patient_opaque_001',
      suggestedPatientName: '合成患者甲',
      suggestionMethod: 'phone_month_day' as const
    };
    repo.listCandidates.mockResolvedValue([suggested]);
    const service = new CalendarPilotApplicationService(repo.port, {
      nowUtc: () => NOW
    });

    await expect(
      service.candidates({ actorId: 'front_001', actorRole: 'front_desk' })
    ).resolves.toEqual([suggested]);
    expect(() =>
      service.candidates({ actorId: 'patient_001', actorRole: 'patient' })
    ).toThrow(AuthorizationDeniedError);
  });

  it('allows only manager to request a source preflight', async () => {
    const repo = repository();
    const service = new CalendarPilotApplicationService(repo.port, {
      nowUtc: () => NOW
    });
    const command = {
      idempotencyKey: 'calendar_preflight_0001',
      expectedVersion: 3,
      sourceId: 'calendar_source_secondary'
    };
    await service.preflightSource(command, {
      actorId: 'manager_001',
      actorRole: 'manager'
    });
    expect(repo.requestSourcePreflight).toHaveBeenCalledWith({
      ...command,
      actorId: 'manager_001',
      occurredAt: NOW
    });
    expect(() =>
      service.preflightSource(command, {
        actorId: 'front_001',
        actorRole: 'front_desk'
      })
    ).toThrow(AuthorizationDeniedError);
  });

  it('allows front desk to review but never trusts an actor from the command', async () => {
    const repo = repository();
    const service = new CalendarPilotApplicationService(repo.port, {
      nowUtc: () => NOW
    });
    await service.reviewCandidate(
      'candidate_001',
      'accept',
      { idempotencyKey: 'calendar_candidate_0001', expectedVersion: 1 },
      { actorId: 'front_001', actorRole: 'front_desk' }
    );
    expect(repo.reviewCandidate).toHaveBeenCalledWith({
      candidateId: 'candidate_001',
      action: 'accept',
      idempotencyKey: 'calendar_candidate_0001',
      expectedVersion: 1,
      actorId: 'front_001',
      actorRole: 'front_desk',
      occurredAt: NOW
    });
  });

  it('denies every unrelated role even for reads', () => {
    const service = new CalendarPilotApplicationService(repository().port, {
      nowUtc: () => NOW
    });
    expect(() =>
      service.sources({ actorId: 'patient_001', actorRole: 'patient' })
    ).toThrow(AuthorizationDeniedError);
  });

  it('lets clinic review handle a matched appointment candidate before CAL-PILOT apply', async () => {
    const repo = repository();
    const tryReview = vi.fn().mockResolvedValue({
      candidate: { candidateId: 'candidate_001', status: 'accepted' },
      projection: null
    });
    const service = new CalendarPilotApplicationService(
      repo.port,
      {
        nowUtc: () => NOW
      },
      { tryReview } as never
    );
    await service.reviewCandidate(
      'candidate_001',
      'accept',
      { idempotencyKey: 'calendar_candidate_0009', expectedVersion: 1 },
      { actorId: 'manager_001', actorRole: 'manager' }
    );
    expect(tryReview).toHaveBeenCalled();
    expect(repo.reviewCandidate).not.toHaveBeenCalled();
  });

  it('allows front desk to submit only server-attributed controlled corrections', async () => {
    const repo = repository();
    const service = new CalendarPilotApplicationService(repo.port, {
      nowUtc: () => NOW
    });
    await service.correctCandidate(
      'candidate_invalid_001',
      {
        kind: 'appointment',
        idempotencyKey: 'calendar_correction_0001',
        expectedVersion: 2,
        patientCode: 'A17',
        bookingKind: 'initial',
        serviceId: 'service_snoring',
        startsAt: '2026-09-02T06:00:00.000Z'
      },
      { actorId: 'front_001', actorRole: 'front_desk' }
    );
    expect(repo.correctCandidate).toHaveBeenCalledWith({
      candidateId: 'candidate_invalid_001',
      kind: 'appointment',
      idempotencyKey: 'calendar_correction_0001',
      expectedVersion: 2,
      patientCode: 'A17',
      bookingKind: 'initial',
      serviceId: 'service_snoring',
      startsAt: '2026-09-02T06:00:00.000Z',
      actorId: 'front_001',
      actorRole: 'front_desk',
      occurredAt: NOW
    });
  });
});

const CLOCK_ACTOR = { actorId: 'synthetic_utc_actor', actorRole: ROLES[0] };
const CLOCK_COMMAND = {
  idempotencyKey: 'synthetic_calendar_clock_0001',
  expectedVersion: 1
};
const CLOCK_SOURCE = {
  ...CLOCK_COMMAND,
  sourceId: 'synthetic_source',
  preflightId: 'synthetic_preflight'
};
const CLOCK_APPOINTMENT = {
  ...CLOCK_COMMAND,
  patientCode: 'A17',
  bookingKind: 'initial' as const,
  serviceId: 'service_snoring',
  startsAt: '2028-03-01T06:00:00.000Z'
};
const clockConsumers: readonly [
  string,
  keyof CalendarPilotRepositoryPort,
  (service: CalendarPilotApplicationService) => unknown
][] = [
  ['status', 'getStatus', (service) => service.status(CLOCK_ACTOR)],
  [
    'availability',
    'getAvailability',
    (service) => service.availability(CLOCK_ACTOR)
  ],
  [
    'preflight',
    'requestSourcePreflight',
    (service) => service.preflightSource(CLOCK_SOURCE, CLOCK_ACTOR)
  ],
  [
    'activate',
    'activateSource',
    (service) => service.activateSource(CLOCK_SOURCE, CLOCK_ACTOR)
  ],
  [
    'rollback',
    'rollbackSource',
    (service) => service.rollbackSource(CLOCK_SOURCE, CLOCK_ACTOR)
  ],
  [
    'review',
    'reviewCandidate',
    (service) =>
      service.reviewCandidate(
        'synthetic_candidate',
        'accept',
        CLOCK_COMMAND,
        CLOCK_ACTOR
      )
  ],
  [
    'resolve',
    'reviewCandidate',
    (service) =>
      service.resolveCandidate(
        'synthetic_candidate',
        { ...CLOCK_COMMAND, resolution: 'system' },
        CLOCK_ACTOR
      )
  ],
  [
    'correct',
    'correctCandidate',
    (service) =>
      service.correctCandidate(
        'synthetic_candidate',
        { ...CLOCK_APPOINTMENT, kind: 'appointment' },
        CLOCK_ACTOR
      )
  ],
  [
    'create',
    'createSyntheticAppointment',
    (service) =>
      service.createSyntheticAppointment(CLOCK_APPOINTMENT, CLOCK_ACTOR)
  ],
  [
    'reschedule',
    'rescheduleSyntheticAppointment',
    (service) =>
      service.rescheduleSyntheticAppointment(
        'synthetic_appointment',
        CLOCK_APPOINTMENT,
        CLOCK_ACTOR
      )
  ],
  [
    'cancel',
    'cancelSyntheticAppointment',
    (service) =>
      service.cancelSyntheticAppointment(
        'synthetic_appointment',
        CLOCK_COMMAND,
        CLOCK_ACTOR
      )
  ]
];

describe.each(clockConsumers)(
  '%s UTC clock admission',
  (_name, method, invoke) => {
    it.each([
      'not-a-timestamp',
      '2028-02-29',
      '2028-02-29T00:00:00',
      '2028-02-29T00:00:00+00:00',
      '2028-02-29T08:00:00+08:00',
      '2028-02-30T00:00:00Z',
      '2028-02-29T24:00:00Z',
      'Feb 29 2028 GMT'
    ])('rejects clock %s before repository access', async (now) => {
      const repo = repository();
      const service = new CalendarPilotApplicationService(repo.port, {
        nowUtc: () => now
      });
      await expect(async () => {
        await invoke(service);
      }).rejects.toThrow(DomainError);
      for (const spy of Object.values(repo.port)) {
        expect(spy).not.toHaveBeenCalled();
      }
    });

    it.each(['2028-02-29T00:00:00Z', '2028-02-29T00:00:00.123456Z'])(
      'preserves legal UTC clock %s verbatim',
      async (now) => {
        const repo = repository();
        const service = new CalendarPilotApplicationService(repo.port, {
          nowUtc: () => now
        });
        const spy = vi.spyOn(repo.port, method);
        await invoke(service);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.mock.calls.flat()).toContainEqual(
          method === 'getStatus' || method === 'getAvailability'
            ? now
            : expect.objectContaining({ occurredAt: now })
        );
      }
    );
  }
);
