import { describe, expect, it, vi } from 'vitest';

import { AuthorizationDeniedError } from '../platform/errors/api-error.js';
import { CalendarPilotApplicationService } from './calendar-pilot.application-service.js';
import type { CalendarPilotRepositoryPort } from './calendar-pilot.repository-port.js';

const NOW = '2026-08-28T08:00:00.000Z';

function repository() {
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
    listCandidates: vi.fn().mockResolvedValue([]),
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
    requestSourcePreflight,
    reviewCandidate,
    correctCandidate
  };
}

describe('CalendarPilotApplicationService role boundary', () => {
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
