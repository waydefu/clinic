import type {
  CancelAppointmentRequest,
  CreateAppointmentRequest,
  DeleteAppointmentRequest,
  RecordFollowUpRequest,
  RescheduleAppointmentRequest
} from '@beauessence/contracts';
import type {
  BookingRequest,
  DeleteAppointmentRequest as DomainDeleteAppointmentRequest,
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
  DeletionResult,
  ReservationResult,
  TransitionResult
} from './appointment.repository-port.js';
import { InMemoryPatientDirectory } from '../patients/patient-directory.js';

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

const FOLLOW_UP_COMMAND: RecordFollowUpRequest = {
  idempotencyKey: 'follow_up_request_0001',
  decision: 'required',
  dueDate: '2030-01-02',
  dueTime: '12:15'
};

const DELETE_COMMAND: DeleteAppointmentRequest = {
  idempotencyKey: 'delete_request_0001',
  reasonCode: 'created_in_error'
};

const OPEN_RECORD: AppointmentRecord = {
  appointmentId: 'appointment_server_001',
  patientId: 'patient_opaque_001',
  slotId: 'slot_001',
  bookingKind: 'initial',
  status: 'confirmed',
  startsAt: '2026-07-25T04:00:00.000Z'
};

function createBoundService(
  patients?: InMemoryPatientDirectory,
  ids: () => string = () => 'appointment_server_001'
) {
  const reserve = vi.fn<
    (request: BookingRequest) => Promise<ReservationResult>
  >(() =>
    Promise.resolve({
      appointmentId: 'appointment_server_001',
      replayed: false,
      startsAt: '2026-07-25T04:00:00.000Z'
    })
  );
  const reschedule = vi.fn<
    (request: RescheduleRequest) => Promise<ReservationResult>
  >(() =>
    Promise.resolve({
      appointmentId: 'appointment_server_001',
      replayed: false,
      startsAt: '2026-07-25T04:30:00.000Z'
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
  const recordFollowUp = vi.fn(() =>
    Promise.resolve({
      appointmentId: 'appointment_server_001',
      replayed: false,
      decision: 'required' as const,
      dueAt: '2030-01-02T04:15:00.000Z'
    })
  );
  const deleteAppointment = vi.fn<
    (request: DomainDeleteAppointmentRequest) => Promise<DeletionResult>
  >(() =>
    Promise.resolve({
      appointmentId: 'appointment_server_001',
      replayed: false,
      auditEventId: 'audit_appointment_server_001_deleted_key'
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
  const assertCanComplete = vi.fn<
    AppointmentAuthorizationPolicy['assertCanComplete']
  >(() => Promise.resolve());
  const assertCanDecideFollowUp = vi.fn<
    AppointmentAuthorizationPolicy['assertCanDecideFollowUp']
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
    transition,
    recordFollowUp,
    deleteAppointment
  };
  const authorization: AppointmentAuthorizationPolicy = {
    assertCanCreate,
    assertCanReschedule,
    assertCanCancel,
    assertCanComplete,
    assertCanDecideFollowUp,
    assertCanQuery,
    assertCanDelete
  };
  const service = new AppointmentApplicationService(
    repository,
    authorization,
    { next: ids },
    { nowUtc: () => '2026-07-23T14:30:00.000Z' },
    { next: () => 'corr_server_001' },
    patients
  );

  return {
    assertCanCreate,
    assertCanReschedule,
    assertCanCancel,
    assertCanComplete,
    assertCanDecideFollowUp,
    assertCanQuery,
    assertCanDelete,
    patientIdOf,
    read,
    reserve,
    reschedule,
    transition,
    recordFollowUp,
    deleteAppointment,
    patients,
    service
  };
}

function createBoundary() {
  return createBoundService();
}

describe('AppointmentApplicationService', () => {
  it('maps a parsed command plus server identity, id and time to the domain', async () => {
    const { assertCanCreate, reserve, service } = createBoundary();

    await expect(service.create(COMMAND, AUTHENTICATION)).resolves.toEqual({
      appointmentId: 'appointment_server_001',
      status: 'confirmed',
      startsAt: '2026-07-25T04:00:00.000Z',
      endsAt: '2026-07-25T04:30:00.000Z'
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
        policyVersion: 'privacy-v1'
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
      status: 'confirmed',
      startsAt: '2026-07-25T04:00:00.000Z',
      endsAt: '2026-07-25T04:30:00.000Z'
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
      status: 'confirmed',
      startsAt: '2026-07-25T04:00:00.000Z',
      endsAt: '2026-07-25T04:30:00.000Z'
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
      status: 'confirmed',
      startsAt: '2026-07-25T04:30:00.000Z',
      endsAt: '2026-07-25T05:00:00.000Z'
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
      status: 'confirmed',
      startsAt: '2026-07-25T04:30:00.000Z',
      endsAt: '2026-07-25T05:00:00.000Z'
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
      status: 'confirmed',
      startsAt: '2026-07-25T04:30:00.000Z',
      endsAt: '2026-07-25T05:00:00.000Z'
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
      endsAt: '2026-07-25T04:30:00.000Z',
      bookingKind: 'initial',
      slotId: 'slot_001',
      patientId: 'patient_opaque_001'
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

describe('AppointmentApplicationService arrive, complete and no-show', () => {
  const STAFF: AuthenticationContext = {
    actorId: 'actor_verified_001',
    actorRole: 'test_front_desk'
  };

  it('lets staff mark a confirmed visit arrived', async () => {
    const { assertCanComplete, transition, service } = createBoundary();
    transition.mockResolvedValueOnce({
      appointmentId: 'appointment_server_001',
      replayed: false,
      status: 'arrived'
    });

    await expect(
      service.arrive('appointment_server_001', CANCEL_COMMAND, STAFF)
    ).resolves.toEqual({
      appointmentId: 'appointment_server_001',
      status: 'arrived'
    });
    expect(assertCanComplete).toHaveBeenCalledWith(STAFF, {
      appointmentPatientId: 'patient_opaque_001'
    });
    expect(transition.mock.calls[0]?.[0]).toMatchObject({
      appointmentId: 'appointment_server_001',
      transition: 'arrive'
    });
  });

  it('lets staff complete an arrived visit', async () => {
    const { assertCanComplete, transition, service } = createBoundary();
    transition.mockResolvedValueOnce({
      appointmentId: 'appointment_server_001',
      replayed: false,
      status: 'completed'
    });

    await expect(
      service.complete('appointment_server_001', CANCEL_COMMAND, STAFF)
    ).resolves.toEqual({
      appointmentId: 'appointment_server_001',
      status: 'completed'
    });
    expect(assertCanComplete).toHaveBeenCalledWith(STAFF, {
      appointmentPatientId: 'patient_opaque_001'
    });
    expect(transition.mock.calls[0]?.[0]).toMatchObject({
      appointmentId: 'appointment_server_001',
      transition: 'complete'
    });
  });

  it('lets staff record no-show', async () => {
    const { assertCanComplete, transition, service } = createBoundary();
    transition.mockResolvedValueOnce({
      appointmentId: 'appointment_server_001',
      replayed: false,
      status: 'no_show'
    });

    await expect(
      service.markNoShow('appointment_server_001', CANCEL_COMMAND, STAFF)
    ).resolves.toEqual({
      appointmentId: 'appointment_server_001',
      status: 'no_show'
    });
    expect(assertCanComplete).toHaveBeenCalledWith(STAFF, {
      appointmentPatientId: 'patient_opaque_001'
    });
    expect(transition.mock.calls[0]?.[0]).toMatchObject({
      transition: 'no_show'
    });
  });

  it('does not persist complete when authorization denies', async () => {
    const { assertCanComplete, transition, service } = createBoundary();
    assertCanComplete.mockRejectedValueOnce(new Error('denied'));

    await expect(
      service.complete('appointment_server_001', CANCEL_COMMAND, STAFF)
    ).rejects.toThrow('denied');
    expect(transition).not.toHaveBeenCalled();
  });

  it('does not read the appointment when complete is denied by role', async () => {
    const { assertCanComplete, read, transition, service } = createBoundary();
    assertCanComplete.mockRejectedValueOnce(new Error('denied'));
    const patient: AuthenticationContext = {
      actorId: 'anonymous',
      actorRole: 'patient'
    };

    await expect(
      service.complete('appointment_server_001', CANCEL_COMMAND, patient)
    ).rejects.toThrow('denied');
    expect(assertCanComplete).toHaveBeenCalledWith(patient, {});
    expect(read).not.toHaveBeenCalled();
    expect(transition).not.toHaveBeenCalled();
  });

  it('lets staff record a follow-up decision after authorization', async () => {
    const { assertCanDecideFollowUp, recordFollowUp, service } =
      createBoundary();

    await expect(
      service.recordFollowUp('appointment_server_001', FOLLOW_UP_COMMAND, STAFF)
    ).resolves.toEqual({
      appointmentId: 'appointment_server_001',
      decision: 'required',
      dueAt: '2030-01-02T04:15:00.000Z'
    });
    expect(assertCanDecideFollowUp).toHaveBeenCalledWith(STAFF, {
      appointmentPatientId: 'patient_opaque_001'
    });
    expect(recordFollowUp.mock.calls[0]?.[0]).toMatchObject({
      appointmentId: 'appointment_server_001',
      decision: 'required',
      dueDate: '2030-01-02',
      dueTime: '12:15'
    });
  });

  it('does not persist follow-up when authorization denies', async () => {
    const { assertCanDecideFollowUp, recordFollowUp, service } =
      createBoundary();
    assertCanDecideFollowUp.mockRejectedValueOnce(new Error('denied'));

    await expect(
      service.recordFollowUp('appointment_server_001', FOLLOW_UP_COMMAND, STAFF)
    ).rejects.toThrow('denied');
    expect(recordFollowUp).not.toHaveBeenCalled();
  });

  it('lets a manager delete with a closed reason code after authorization', async () => {
    const { assertCanDelete, deleteAppointment, service } = createBoundary();

    await expect(
      service.delete('appointment_server_001', DELETE_COMMAND, STAFF)
    ).resolves.toEqual({
      appointmentId: 'appointment_server_001',
      deleted: true,
      auditEventId: 'audit_appointment_server_001_deleted_key'
    });
    expect(assertCanDelete).toHaveBeenCalledWith(STAFF);
    expect(deleteAppointment.mock.calls[0]?.[0]).toMatchObject({
      appointmentId: 'appointment_server_001',
      audit: { reasonCode: 'created_in_error' }
    });
  });

  it('does not persist deletion when authorization denies', async () => {
    const { assertCanDelete, deleteAppointment, service } = createBoundary();
    assertCanDelete.mockRejectedValueOnce(new Error('denied'));

    await expect(
      service.delete('appointment_server_001', DELETE_COMMAND, STAFF)
    ).rejects.toThrow('denied');
    expect(deleteAppointment).not.toHaveBeenCalled();
  });
});

const SYNTHETIC_INTAKE = {
  name: '合成患者甲',
  phone: '0912000001',
  birthDate: '1990-01-15',
  nationalId: 'A123456789',
  privacyConsent: true as const
};

describe('accountless intake, return lookup and follow-up lineage', () => {
  const anonymous = {
    actorId: 'anonymous',
    actorRole: 'patient'
  } as const;

  it('creates from intake without an account and reuses the same patientId', async () => {
    const patients = new InMemoryPatientDirectory();
    let n = 0;
    const { reserve, service } = createBoundService(
      patients,
      () => `opaque_${++n}`
    );

    await service.create({ ...COMMAND, intake: SYNTHETIC_INTAKE }, anonymous);
    await service.create(
      {
        ...COMMAND,
        idempotencyKey: 'booking_request_0002',
        intake: SYNTHETIC_INTAKE
      },
      anonymous
    );

    expect(patients.createdPatientCount).toBe(1);
    expect(reserve.mock.calls[0]?.[0]).toMatchObject({
      patientId: reserve.mock.calls[1]?.[0].patientId
    });
  });

  it('returns a generic miss for an unknown lookup and does not enumerate', async () => {
    const patients = new InMemoryPatientDirectory();
    const { service } = createBoundService(patients);
    const failures: string[] = [];

    await expect(
      service.lookupReturn(
        { phone: '0912000001', birthDate: '1990-01-15' },
        '198.51.100.10',
        {
          assertLookupFailure: (id, ip) => {
            failures.push(`${id}:${ip}`);
            return Promise.resolve();
          }
        }
      )
    ).rejects.toMatchObject({ code: 'APPOINTMENT_NOT_FOUND' });
    expect(failures).toHaveLength(1);
    expect(failures[0]).not.toMatch(/0912|1990-01-15/);
  });

  it('returns schedule when follow-up is required and unscheduled', async () => {
    const patients = new InMemoryPatientDirectory();
    let n = 0;
    const { service } = createBoundService(patients, () => `opaque_${++n}`);
    await service.create({ ...COMMAND, intake: SYNTHETIC_INTAKE }, anonymous);
    const patientId = [...patients.patients.keys()][0] ?? '';
    patients.followUp.set(patientId, {
      required: true,
      sourceAppointmentId: 'appointment_source_001',
      sourceFollowUpId: 'follow_up_001'
    });

    await expect(
      service.lookupReturn(
        { phone: '0912000001', birthDate: '1990-01-15' },
        '198.51.100.10'
      )
    ).resolves.toEqual(
      expect.objectContaining({
        outcome: 'schedule'
      })
    );
    await expect(
      service.lookupReturn(
        { phone: '0912000001', birthDate: '1990-01-15' },
        '198.51.100.10'
      )
    ).resolves.not.toHaveProperty('appointmentId');
  });

  it('returns the existing follow-up time and refuses a duplicate', async () => {
    const patients = new InMemoryPatientDirectory();
    let n = 0;
    const { service } = createBoundService(patients, () => `opaque_${++n}`);
    await service.create({ ...COMMAND, intake: SYNTHETIC_INTAKE }, anonymous);
    const patientId = [...patients.patients.keys()][0] ?? '';
    patients.followUp.set(patientId, {
      required: true,
      sourceAppointmentId: 'appointment_source_001',
      sourceFollowUpId: 'follow_up_001',
      activeFollowUpAppointmentId: 'appointment_follow_001'
    });
    patients.appointments.push({
      appointmentId: 'appointment_follow_001',
      patientId,
      slotId: 'slot_follow_001',
      bookingKind: 'follow_up',
      status: 'confirmed',
      startsAt: '2026-08-01T04:00:00.000Z'
    });

    await expect(
      service.lookupReturn(
        { phone: '0912000001', birthDate: '1990-01-15' },
        '198.51.100.10'
      )
    ).resolves.toMatchObject({
      outcome: 'existing',
      appointmentId: 'appointment_follow_001',
      startsAt: '2026-08-01T04:00:00.000Z'
    });

    const sessionId = (
      await service.lookupReturn(
        { phone: '0912000001', birthDate: '1990-01-15' },
        '198.51.100.10'
      )
    ).sessionId;
    const verified = {
      actorId: patientId,
      actorRole: 'patient' as const,
      verifiedPatientId: patientId
    };
    expect(
      await patients.readReturnSession(sessionId, '2026-07-23T14:30:00.000Z')
    ).toBe(patientId);
    await expect(
      service.create(
        {
          ...COMMAND,
          bookingKind: 'follow_up',
          idempotencyKey: 'booking_request_follow'
        },
        verified
      )
    ).rejects.toMatchObject({ code: 'FOLLOW_UP_ALREADY_SCHEDULED' });
  });

  it('creates a follow-up on the same patientId when required and unscheduled', async () => {
    const patients = new InMemoryPatientDirectory();
    let n = 0;
    const { reserve, service } = createBoundService(
      patients,
      () => `opaque_${++n}`
    );
    await service.create({ ...COMMAND, intake: SYNTHETIC_INTAKE }, anonymous);
    const patientId = [...patients.patients.keys()][0] ?? '';
    patients.followUp.set(patientId, {
      required: true,
      sourceAppointmentId: 'appointment_source_001',
      sourceFollowUpId: 'follow_up_001'
    });
    patients.appointments.push({
      appointmentId: 'appointment_server_001',
      patientId,
      slotId: 'slot_001',
      bookingKind: 'initial',
      status: 'confirmed',
      startsAt: '2026-07-25T04:00:00.000Z'
    });

    const listed = await service.list('mine', {
      actorId: patientId,
      actorRole: 'patient',
      verifiedPatientId: patientId
    });
    expect(
      listed.appointments.every((item) => item.patientId === undefined)
    ).toBe(true);

    await service.create(
      {
        ...COMMAND,
        bookingKind: 'follow_up',
        idempotencyKey: 'booking_request_follow'
      },
      {
        actorId: patientId,
        actorRole: 'patient',
        verifiedPatientId: patientId
      }
    );
    expect(reserve.mock.calls.at(-1)?.[0]).toMatchObject({
      patientId,
      bookingKind: 'follow_up'
    });
    expect(patients.createdPatientCount).toBe(1);
  });

  it('creates a follow-up when the stored active pointer names a cancelled follow-up', async () => {
    const patients = new InMemoryPatientDirectory();
    let n = 0;
    const { reserve, service } = createBoundService(
      patients,
      () => `opaque_${++n}`
    );
    await service.create({ ...COMMAND, intake: SYNTHETIC_INTAKE }, anonymous);
    const patientId = [...patients.patients.keys()][0] ?? '';
    patients.followUp.set(patientId, {
      required: true,
      sourceAppointmentId: 'appointment_source_001',
      activeFollowUpAppointmentId: 'appointment_follow_cancelled'
    });
    patients.appointments.push({
      appointmentId: 'appointment_follow_cancelled',
      patientId,
      slotId: 'slot_follow_001',
      bookingKind: 'follow_up',
      status: 'cancelled',
      startsAt: '2026-08-01T04:15:00.000Z'
    });

    await service.create(
      {
        ...COMMAND,
        bookingKind: 'follow_up',
        idempotencyKey: 'booking_request_follow_again'
      },
      { actorId: patientId, actorRole: 'patient', verifiedPatientId: patientId }
    );

    expect(reserve.mock.calls.at(-1)?.[0]).toMatchObject({
      patientId,
      bookingKind: 'follow_up'
    });
  });

  it('does not entitle an unmatched patient to create a return appointment', async () => {
    const patients = new InMemoryPatientDirectory();
    const { service } = createBoundService(patients);
    await expect(
      service.create(
        { ...COMMAND, bookingKind: 'follow_up' },
        {
          actorId: 'patient_other',
          actorRole: 'patient',
          verifiedPatientId: 'patient_other'
        }
      )
    ).rejects.toMatchObject({ code: 'FOLLOW_UP_NOT_ENTITLED' });
    expect(patients.createdPatientCount).toBe(0);
  });
});
