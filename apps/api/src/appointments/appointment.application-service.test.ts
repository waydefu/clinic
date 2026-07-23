import type { CreateAppointmentRequest } from '@beauessence/contracts';
import type { BookingRequest } from '@beauessence/domain';
import { describe, expect, it, vi } from 'vitest';

import type { AuthenticationContext } from '../auth/authentication-context.js';
import {
  AppointmentApplicationService,
  MissingVerifiedPatientError,
  toBookingRequest
} from './appointment.application-service.js';
import { createAppointmentIdempotency } from '../idempotency/appointment-idempotency.js';
import type { AppointmentAuthorizationPolicy } from './appointment.policy.js';
import type {
  AppointmentRepositoryPort,
  ReservationResult
} from './appointment.repository-port.js';

const COMMAND: CreateAppointmentRequest = {
  idempotencyKey: 'booking_request_0001',
  slotId: 'slot_001',
  serviceId: 'service_consult',
  bookingKind: 'initial'
};

const AUTHENTICATION: AuthenticationContext = {
  actorId: 'actor_verified_001',
  actorRole: 'test_front_desk',
  verifiedPatientId: 'patient_opaque_001'
};

function createBoundary() {
  const reserve = vi.fn<
    (request: BookingRequest) => Promise<ReservationResult>
  >(() =>
    Promise.resolve({
      appointmentId: 'appointment_server_001',
      replayed: false
    })
  );
  const assertCanCreate = vi.fn<
    AppointmentAuthorizationPolicy['assertCanCreate']
  >(() => Promise.resolve());
  const repository: AppointmentRepositoryPort = { reserve };
  const authorization: AppointmentAuthorizationPolicy = { assertCanCreate };
  const service = new AppointmentApplicationService(
    repository,
    authorization,
    { next: () => 'appointment_server_001' },
    { nowUtc: () => '2026-07-23T14:30:00.000Z' },
    { next: () => 'corr_server_001' }
  );

  return { assertCanCreate, reserve, service };
}

describe('AppointmentApplicationService', () => {
  it('maps a parsed command plus server identity, id and time to the domain', async () => {
    const { assertCanCreate, reserve, service } = createBoundary();

    await expect(service.create(COMMAND, AUTHENTICATION)).resolves.toEqual({
      appointmentId: 'appointment_server_001',
      replayed: false
    });

    expect(assertCanCreate).toHaveBeenCalledWith(AUTHENTICATION, COMMAND);
    expect(reserve).toHaveBeenCalledWith({
      appointmentId: 'appointment_server_001',
      slotId: 'slot_001',
      patientId: 'patient_opaque_001',
      bookingKind: 'initial',
      itemId: 'service_consult',
      audit: {
        actorId: 'actor_verified_001',
        actorRole: 'test_front_desk',
        correlationId: 'corr_server_001',
        source: 'api',
        reasonCode: null,
        policyVersion: null
      },
      requestedAt: '2026-07-23T14:30:00.000Z',
      idempotency: createAppointmentIdempotency({
        key: 'booking_request_0001',
        actorId: 'actor_verified_001',
        patientId: 'patient_opaque_001',
        slotId: 'slot_001',
        bookingKind: 'initial',
        itemId: 'service_consult'
      })
    });
  });

  it('rejects an unverified patient before policy or persistence', async () => {
    const { assertCanCreate, reserve, service } = createBoundary();

    await expect(
      service.create(COMMAND, {
        actorId: 'actor_verified_001',
        actorRole: 'test_front_desk'
      })
    ).rejects.toBeInstanceOf(MissingVerifiedPatientError);
    expect(assertCanCreate).not.toHaveBeenCalled();
    expect(reserve).not.toHaveBeenCalled();
  });

  it('keeps retry identity stable when server execution metadata changes', () => {
    const first = toBookingRequest(COMMAND, {
      appointmentId: 'appointment_server_001',
      patientId: 'patient_opaque_001',
      requestedAt: '2026-07-23T14:30:00.000Z',
      audit: {
        actorId: 'actor_verified_001',
        actorRole: 'test_front_desk',
        correlationId: 'corr_server_001',
        source: 'api',
        reasonCode: null,
        policyVersion: null
      }
    });
    const retry = toBookingRequest(COMMAND, {
      appointmentId: 'appointment_server_002',
      patientId: 'patient_opaque_001',
      requestedAt: '2026-07-23T14:31:00.000Z',
      audit: {
        ...first.audit,
        correlationId: 'corr_server_002'
      }
    });

    expect(retry.appointmentId).not.toBe(first.appointmentId);
    expect(retry.requestedAt).not.toBe(first.requestedAt);
    expect(retry.audit.correlationId).not.toBe(first.audit.correlationId);
    expect(retry.idempotency).toEqual(first.idempotency);
  });

  it('does not persist when authorization denies the command', async () => {
    const { assertCanCreate, reserve, service } = createBoundary();
    assertCanCreate.mockRejectedValueOnce(new Error('denied'));

    await expect(service.create(COMMAND, AUTHENTICATION)).rejects.toThrow(
      'denied'
    );
    expect(reserve).not.toHaveBeenCalled();
  });
});
