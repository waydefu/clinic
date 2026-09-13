import type {
  CancelAppointmentRequest,
  CreateAppointmentRequest,
  RescheduleAppointmentRequest
} from '@beauessence/contracts';
import type {
  BookingRequest,
  RescheduleRequest,
  TransitionRequest
} from '@beauessence/domain';
import { DomainError } from '@beauessence/domain';
import { describe, expect, it, vi } from 'vitest';

import type { AuthenticationContext } from '../auth/authentication-context.js';
import {
  AppointmentApplicationService,
  MissingVerifiedPatientError,
  toBookingRequest,
  toRescheduleRequest
} from './appointment.application-service.js';
import { AuthorizationDeniedError } from '../platform/errors/api-error.js';
import {
  createAppointmentIdempotency,
  rescheduleAppointmentIdempotency
} from '../idempotency/appointment-idempotency.js';
import type { AppointmentAuthorizationPolicy } from './appointment.policy.js';
import type {
  AppointmentRecord,
  AppointmentRepositoryPort,
  ReservationResult,
  TransitionResult
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

const RESCHEDULE_COMMAND: RescheduleAppointmentRequest = {
  idempotencyKey: 'reschedule_request_0001',
  targetSlotId: 'slot_002'
};

const CANCEL_COMMAND: CancelAppointmentRequest = {
  idempotencyKey: 'cancel_request_0001'
};

const OPEN_RECORD: AppointmentRecord = {
  appointmentId: 'appointment_server_001',
  patientId: 'patient_opaque_001',
  slotId: 'slot_001',
  bookingKind: 'initial',
  status: 'confirmed',
  startsAt: '2026-07-25T04:00:00.000Z'
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
  const reschedule = vi.fn<
    (request: RescheduleRequest) => Promise<ReservationResult>
  >(() =>
    Promise.resolve({
      appointmentId: 'appointment_server_001',
      replayed: false
    })
  );
  const patientIdOf = vi.fn<() => Promise<string | undefined>>(() =>
    Promise.resolve('patient_opaque_001')
  );
  const read = vi.fn<() => Promise<AppointmentRecord | undefined>>(() =>
    Promise.resolve(OPEN_RECORD)
  );
  const transition = vi.fn<
    (request: TransitionRequest) => Promise<TransitionResult>
  >(() =>
    Promise.resolve({
      appointmentId: 'appointment_server_001',
      replayed: false,
      status: 'cancelled'
    })
  );
  const assertCanCreate = vi.fn<
    AppointmentAuthorizationPolicy['assertCanCreate']
  >(() => Promise.resolve());
  const assertCanReschedule = vi.fn<
    AppointmentAuthorizationPolicy['assertCanReschedule']
  >(() => Promise.resolve());
  const assertCanCancel = vi.fn<
    AppointmentAuthorizationPolicy['assertCanCancel']
  >(() => Promise.resolve());
  const assertCanQuery = vi.fn<
    AppointmentAuthorizationPolicy['assertCanQuery']
  >(() => Promise.resolve());
  const assertCanDelete = vi.fn<
    AppointmentAuthorizationPolicy['assertCanDelete']
  >(() => Promise.resolve());
  const repository: AppointmentRepositoryPort = {
    reserve,
    reschedule,
    patientIdOf,
    read,
    transition
  };
  const authorization: AppointmentAuthorizationPolicy = {
    assertCanCreate,
    assertCanReschedule,
    assertCanCancel,
    assertCanQuery,
    assertCanDelete
  };
  const service = new AppointmentApplicationService(
    repository,
    authorization,
    { next: () => 'appointment_server_001' },
    { nowUtc: () => '2026-07-23T14:30:00.000Z' },
    { next: () => 'corr_server_001' }
  );

  return {
    assertCanCreate,
    assertCanReschedule,
    assertCanCancel,
    assertCanQuery,
    patientIdOf,
    read,
    reserve,
    reschedule,
    transition,
    service
  };
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

  it('lets staff create on behalf of an opaque patient id', async () => {
    const { assertCanCreate, reserve, service } = createBoundary();
    const staff: AuthenticationContext = {
      actorId: 'actor_verified_001',
      actorRole: 'test_front_desk'
    };
    const command = {
      ...COMMAND,
      onBehalfPatientId: 'patient_opaque_002'
    };

    await expect(service.create(command, staff)).resolves.toEqual({
      appointmentId: 'appointment_server_001',
      replayed: false
    });
    expect(assertCanCreate).toHaveBeenCalledWith(staff, command);
    expect(reserve.mock.calls[0]?.[0]).toMatchObject({
      patientId: 'patient_opaque_002'
    });
  });

  it('ignores a matching on-behalf id and refuses a different one', async () => {
    const { assertCanCreate, reserve, service } = createBoundary();

    await expect(
      service.create(
        { ...COMMAND, onBehalfPatientId: 'patient_opaque_001' },
        AUTHENTICATION
      )
    ).resolves.toEqual({
      appointmentId: 'appointment_server_001',
      replayed: false
    });
    expect(reserve.mock.calls[0]?.[0]).toMatchObject({
      patientId: 'patient_opaque_001'
    });

    await expect(
      service.create(
        { ...COMMAND, onBehalfPatientId: 'patient_opaque_002' },
        AUTHENTICATION
      )
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    expect(assertCanCreate).toHaveBeenCalledTimes(1);
    expect(reserve).toHaveBeenCalledTimes(1);
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

describe('AppointmentApplicationService reschedule', () => {
  it('maps a parsed command plus server identity and time to the domain', async () => {
    const { assertCanReschedule, reschedule, service } = createBoundary();

    await expect(
      service.reschedule(
        'appointment_server_001',
        RESCHEDULE_COMMAND,
        AUTHENTICATION
      )
    ).resolves.toEqual({
      appointmentId: 'appointment_server_001',
      replayed: false
    });

    expect(assertCanReschedule).toHaveBeenCalledWith(AUTHENTICATION, {
      appointmentPatientId: 'patient_opaque_001'
    });
    expect(reschedule).toHaveBeenCalledWith({
      appointmentId: 'appointment_server_001',
      targetSlotId: 'slot_002',
      expectedPatientId: 'patient_opaque_001',
      audit: {
        actorId: 'actor_verified_001',
        actorRole: 'test_front_desk',
        correlationId: 'corr_server_001',
        source: 'api',
        reasonCode: null,
        policyVersion: null
      },
      requestedAt: '2026-07-23T14:30:00.000Z',
      idempotency: rescheduleAppointmentIdempotency({
        key: 'reschedule_request_0001',
        actorId: 'actor_verified_001',
        appointmentId: 'appointment_server_001',
        targetSlotId: 'slot_002'
      })
    });
  });

  it('lets staff reschedule without a verified patient identity', async () => {
    const { assertCanReschedule, reschedule, service } = createBoundary();
    const staff: AuthenticationContext = {
      actorId: 'actor_verified_001',
      actorRole: 'test_front_desk'
    };

    await expect(
      service.reschedule('appointment_server_001', RESCHEDULE_COMMAND, staff)
    ).resolves.toEqual({
      appointmentId: 'appointment_server_001',
      replayed: false
    });
    expect(assertCanReschedule).toHaveBeenCalledWith(staff, {
      appointmentPatientId: 'patient_opaque_001'
    });
    expect(reschedule.mock.calls[0]?.[0]).not.toHaveProperty(
      'expectedPatientId'
    );
  });

  it('rejects a patient after the appointment-day 10:00 cutoff', async () => {
    const { read, reschedule, service } = createBoundary();
    read.mockResolvedValueOnce({
      ...OPEN_RECORD,
      startsAt: '2026-07-23T04:00:00.000Z'
    });

    await expect(
      service.reschedule(
        'appointment_server_001',
        RESCHEDULE_COMMAND,
        AUTHENTICATION
      )
    ).rejects.toMatchObject<Partial<DomainError>>({
      code: 'CANCELLATION_WINDOW_CLOSED'
    });
    expect(reschedule).not.toHaveBeenCalled();
  });

  it('lets staff reschedule after the patient cutoff', async () => {
    const { read, reschedule, service } = createBoundary();
    read.mockResolvedValueOnce({
      ...OPEN_RECORD,
      startsAt: '2026-07-23T04:00:00.000Z'
    });
    const staff: AuthenticationContext = {
      actorId: 'actor_verified_001',
      actorRole: 'test_front_desk'
    };

    await expect(
      service.reschedule('appointment_server_001', RESCHEDULE_COMMAND, staff)
    ).resolves.toEqual({
      appointmentId: 'appointment_server_001',
      replayed: false
    });
    expect(reschedule).toHaveBeenCalled();
  });

  it('keeps retry identity stable when server execution metadata changes', () => {
    const first = toRescheduleRequest(
      'appointment_server_001',
      RESCHEDULE_COMMAND,
      {
        expectedPatientId: 'patient_opaque_001',
        requestedAt: '2026-07-23T14:30:00.000Z',
        audit: {
          actorId: 'actor_verified_001',
          actorRole: 'test_front_desk',
          correlationId: 'corr_server_001',
          source: 'api',
          reasonCode: null,
          policyVersion: null
        }
      }
    );
    const retry = toRescheduleRequest(
      'appointment_server_001',
      RESCHEDULE_COMMAND,
      {
        expectedPatientId: 'patient_opaque_001',
        requestedAt: '2026-07-23T14:31:00.000Z',
        audit: {
          ...first.audit,
          correlationId: 'corr_server_002'
        }
      }
    );

    expect(retry.requestedAt).not.toBe(first.requestedAt);
    expect(retry.audit.correlationId).not.toBe(first.audit.correlationId);
    expect(retry.idempotency).toEqual(first.idempotency);
  });

  it('does not persist when authorization denies the command', async () => {
    const { assertCanReschedule, reschedule, service } = createBoundary();
    assertCanReschedule.mockRejectedValueOnce(new Error('denied'));

    await expect(
      service.reschedule(
        'appointment_server_001',
        RESCHEDULE_COMMAND,
        AUTHENTICATION
      )
    ).rejects.toThrow('denied');
    expect(reschedule).not.toHaveBeenCalled();
  });

  it('scopes reschedule authorization to the appointment owner', async () => {
    const { assertCanReschedule, read, reschedule, service } = createBoundary();
    read.mockResolvedValueOnce({
      ...OPEN_RECORD,
      patientId: 'patient_other'
    });
    assertCanReschedule.mockRejectedValueOnce(new Error('denied'));

    await expect(
      service.reschedule(
        'appointment_server_001',
        RESCHEDULE_COMMAND,
        AUTHENTICATION
      )
    ).rejects.toThrow('denied');
    expect(assertCanReschedule).toHaveBeenCalledWith(AUTHENTICATION, {
      appointmentPatientId: 'patient_other'
    });
    expect(reschedule).not.toHaveBeenCalled();
  });
});

describe('AppointmentApplicationService query', () => {
  it('returns opaque identifiers and computed end time', async () => {
    const { assertCanQuery, service } = createBoundary();

    await expect(
      service.get('appointment_server_001', AUTHENTICATION)
    ).resolves.toEqual({
      appointmentId: 'appointment_server_001',
      status: 'confirmed',
      startsAt: '2026-07-25T04:00:00.000Z',
      endsAt: '2026-07-25T04:30:00.000Z'
    });
    expect(assertCanQuery).toHaveBeenCalledWith(AUTHENTICATION, {
      appointmentPatientId: 'patient_opaque_001'
    });
  });

  it('does not reveal a missing row to a patient', async () => {
    const { assertCanQuery, read, service } = createBoundary();
    read.mockResolvedValueOnce(undefined);
    assertCanQuery.mockRejectedValueOnce(new Error('denied'));

    await expect(
      service.get('appointment_server_001', AUTHENTICATION)
    ).rejects.toThrow('denied');
  });
});

describe('AppointmentApplicationService cancel', () => {
  it('lets a patient cancel immediately before the day-10:00 cutoff', async () => {
    const { assertCanCancel, transition, service } = createBoundary();

    await expect(
      service.cancel('appointment_server_001', CANCEL_COMMAND, AUTHENTICATION)
    ).resolves.toEqual({
      appointmentId: 'appointment_server_001',
      status: 'cancelled'
    });
    expect(assertCanCancel).toHaveBeenCalledWith(AUTHENTICATION, {
      appointmentPatientId: 'patient_opaque_001'
    });
    expect(transition.mock.calls[0]?.[0]).toMatchObject({
      appointmentId: 'appointment_server_001',
      transition: 'cancel'
    });
  });

  it('rejects a patient after the appointment-day 10:00 cutoff', async () => {
    const { read, transition, service } = createBoundary();
    read.mockResolvedValueOnce({
      ...OPEN_RECORD,
      startsAt: '2026-07-23T04:00:00.000Z'
    });

    await expect(
      service.cancel('appointment_server_001', CANCEL_COMMAND, AUTHENTICATION)
    ).rejects.toMatchObject<Partial<DomainError>>({
      code: 'CANCELLATION_WINDOW_CLOSED'
    });
    expect(transition).not.toHaveBeenCalled();
  });

  it('lets staff cancel after the patient cutoff', async () => {
    const { read, transition, service } = createBoundary();
    read.mockResolvedValueOnce({
      ...OPEN_RECORD,
      startsAt: '2026-07-23T04:00:00.000Z'
    });
    const staff: AuthenticationContext = {
      actorId: 'actor_verified_001',
      actorRole: 'test_front_desk'
    };

    await expect(
      service.cancel('appointment_server_001', CANCEL_COMMAND, staff)
    ).resolves.toEqual({
      appointmentId: 'appointment_server_001',
      status: 'cancelled'
    });
    expect(transition).toHaveBeenCalled();
  });
});

describe('AppointmentApplicationService query', () => {
  it('returns opaque identifiers and computed end time', async () => {
    const { assertCanQuery, service } = createBoundary();

    await expect(
      service.get('appointment_server_001', AUTHENTICATION)
    ).resolves.toEqual({
      appointmentId: 'appointment_server_001',
      status: 'confirmed',
      startsAt: '2026-07-25T04:00:00.000Z',
      endsAt: '2026-07-25T04:30:00.000Z'
    });
    expect(assertCanQuery).toHaveBeenCalledWith(AUTHENTICATION, {
      appointmentPatientId: 'patient_opaque_001'
    });
  });

  it('does not reveal a missing row to a patient', async () => {
    const { assertCanQuery, read, service } = createBoundary();
    read.mockResolvedValueOnce(undefined);
    assertCanQuery.mockRejectedValueOnce(new Error('denied'));

    await expect(
      service.get('appointment_server_001', AUTHENTICATION)
    ).rejects.toThrow('denied');
  });
});

describe('AppointmentApplicationService cancel', () => {
  it('lets a patient cancel immediately before the day-10:00 cutoff', async () => {
    const { assertCanCancel, transition, service } = createBoundary();

    await expect(
      service.cancel('appointment_server_001', CANCEL_COMMAND, AUTHENTICATION)
    ).resolves.toEqual({
      appointmentId: 'appointment_server_001',
      status: 'cancelled'
    });
    expect(assertCanCancel).toHaveBeenCalledWith(AUTHENTICATION, {
      appointmentPatientId: 'patient_opaque_001'
    });
    expect(transition.mock.calls[0]?.[0]).toMatchObject({
      appointmentId: 'appointment_server_001',
      transition: 'cancel'
    });
  });

  it('rejects a patient after the appointment-day 10:00 cutoff', async () => {
    const { read, transition, service } = createBoundary();
    read.mockResolvedValueOnce({
      ...OPEN_RECORD,
      startsAt: '2026-07-23T04:00:00.000Z'
    });

    await expect(
      service.cancel('appointment_server_001', CANCEL_COMMAND, AUTHENTICATION)
    ).rejects.toMatchObject<Partial<DomainError>>({
      code: 'CANCELLATION_WINDOW_CLOSED'
    });
    expect(transition).not.toHaveBeenCalled();
  });

  it('lets staff cancel after the patient cutoff', async () => {
    const { read, transition, service } = createBoundary();
    read.mockResolvedValueOnce({
      ...OPEN_RECORD,
      startsAt: '2026-07-23T04:00:00.000Z'
    });
    const staff: AuthenticationContext = {
      actorId: 'actor_verified_001',
      actorRole: 'test_front_desk'
    };

    await expect(
      service.cancel('appointment_server_001', CANCEL_COMMAND, staff)
    ).resolves.toEqual({
      appointmentId: 'appointment_server_001',
      status: 'cancelled'
    });
    expect(transition).toHaveBeenCalled();
  });
});
