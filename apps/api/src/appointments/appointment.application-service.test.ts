import type {
  CancelAppointmentRequest,
  CreateAppointmentRequest,
  DeleteAppointmentRequest,
  RecordFollowUpRequest,
  RescheduleAppointmentRequest
} from '@beauessence/contracts';
import type {
  AppointmentSnapshot,
  BookingRequest,
  DeleteAppointmentRequest as DomainDeleteAppointmentRequest,
  RescheduleRequest,
  SlotSnapshot,
  TransitionRequest
} from '@beauessence/domain';
import {
  DomainError,
  planIdempotencyRecord,
  planReschedule,
  planTransition,
  resolveIdempotencyReplay,
  type PlannedIdempotencyRecord
} from '@beauessence/domain';
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
import {
  assertFollowUpBookable,
  InMemoryPatientDirectory
} from '../patients/patient-directory.js';

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

/** Slots the stand-in repository can move an appointment to. */
const TARGET_SLOTS: Readonly<Record<string, SlotSnapshot>> = {
  slot_002: {
    id: 'slot_002',
    kind: 'initial',
    startsAt: '2026-07-25T04:30:00.000Z'
  },
  // 15:00, 15:30 and 16:00 in Taipei on 2026-07-23: after that day's 10:00
  // self-service cutoff.
  slot_same_day_a: {
    id: 'slot_same_day_a',
    kind: 'initial',
    startsAt: '2026-07-23T07:00:00.000Z'
  },
  slot_same_day_b: {
    id: 'slot_same_day_b',
    kind: 'initial',
    startsAt: '2026-07-23T07:30:00.000Z'
  },
  slot_same_day_c: {
    id: 'slot_same_day_c',
    kind: 'initial',
    startsAt: '2026-07-23T08:00:00.000Z'
  }
};

/**
 * What the reschedule transaction decides: the domain planner, applied to the
 * appointment as the transaction reads it. Every rule the planner owns, the
 * patient self-service window included, is therefore judged here and not by
 * the service ahead of the transaction.
 */
function planStandInReschedule(
  request: RescheduleRequest,
  record: AppointmentRecord | undefined
) {
  const appointment: AppointmentSnapshot | undefined =
    record === undefined
      ? undefined
      : {
          id: record.appointmentId,
          slotId: record.slotId,
          patientId: record.patientId,
          bookingKind: record.bookingKind,
          status: record.status,
          ...(record.startsAt === undefined
            ? {}
            : { startsAt: record.startsAt })
        };
  return planReschedule(
    request,
    appointment,
    TARGET_SLOTS[request.targetSlotId],
    appointment === undefined
      ? undefined
      : {
          activeAppointmentIds: [appointment.id],
          updatedAt: request.requestedAt
        }
  );
}

/**
 * What the transition transaction decides: the domain planner, applied to the
 * appointment as the transaction reads it. The patient self-service window is
 * therefore judged here, for a request that carries the verified patient id,
 * and not by the service ahead of the transaction.
 */
function planStandInTransition(
  request: TransitionRequest,
  record: AppointmentRecord | undefined
) {
  const appointment: AppointmentSnapshot | undefined =
    record === undefined
      ? undefined
      : {
          id: record.appointmentId,
          slotId: record.slotId,
          patientId: record.patientId,
          bookingKind: record.bookingKind,
          status: record.status,
          ...(record.startsAt === undefined
            ? {}
            : { startsAt: record.startsAt })
        };
  return planTransition(
    request,
    appointment,
    appointment === undefined
      ? undefined
      : {
          activeAppointmentIds: [appointment.id],
          updatedAt: request.requestedAt
        }
  );
}

function createBoundService(
  patients?: InMemoryPatientDirectory,
  ids: () => string = () => 'appointment_server_001',
  nowUtc = '2026-07-23T14:30:00.000Z'
) {
  // The appointment as the repository sees it. `read` and the reschedule
  // stand-in share it so a test sets the row once.
  const stored: { record: AppointmentRecord | undefined } = {
    record: OPEN_RECORD
  };
  // The clock a test can move between two requests.
  const time = { nowUtc };
  // Follow-up entitlement is decided by the repository transaction, after it
  // has replayed a recorded idempotency key (FirestoreBookingRepository.reserve).
  // The stand-in repository applies the same rule so a service that stopped
  // checking it would still be caught by the tests below.
  const reserve = vi.fn<
    (
      request: BookingRequest,
      intake?: import('../patients/patient-directory.js').PreparedPatientIntake
    ) => Promise<ReservationResult>
  >(async (request, intake) => {
    if (patients !== undefined) {
      assertFollowUpBookable(
        await patients.readFollowUpState(request.patientId),
        request.bookingKind
      );
    }
    if (patients !== undefined && intake !== undefined) {
      await patients.resolveFromIntake(
        intake.intake,
        time.nowUtc,
        () => intake.patientId
      );
    }
    return {
      appointmentId: 'appointment_server_001',
      replayed: false,
      startsAt: '2026-07-25T04:00:00.000Z'
    };
  });
  const reschedule = vi.fn<
    (request: RescheduleRequest) => Promise<ReservationResult>
  >((request) => {
    const plan = planStandInReschedule(request, stored.record);
    return Promise.resolve({
      appointmentId: plan.appointmentId,
      replayed: false,
      startsAt: plan.startsAt
    });
  });
  const patientIdOf = vi.fn<() => Promise<string | undefined>>(() =>
    Promise.resolve('patient_opaque_001')
  );
  const read = vi.fn<() => Promise<AppointmentRecord | undefined>>(() =>
    Promise.resolve(stored.record)
  );
  const transition = vi.fn<
    (request: TransitionRequest) => Promise<TransitionResult>
  >((request) => {
    const plan = planStandInTransition(request, stored.record);
    return Promise.resolve({
      appointmentId: plan.appointmentId,
      replayed: false,
      status: plan.nextStatus
    });
  });
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
    { nowUtc: () => time.nowUtc },
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
    stored,
    time,
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

  it('trims the booking note and drops a blank one', () => {
    const context = {
      appointmentId: 'appointment_note_001',
      patientId: 'patient_opaque_001',
      requestedAt: '2026-07-23T14:30:00.000Z',
      audit: {
        actorId: 'actor_verified_001',
        actorRole: 'test_front_desk',
        correlationId: 'corr_note_001',
        source: 'api' as const,
        reasonCode: null,
        policyVersion: null
      }
    };
    expect(
      toBookingRequest({ ...COMMAND, patientNote: '  合成備註  ' }, context)
        .patientNote
    ).toBe('合成備註');
    expect(
      'patientNote' in
        toBookingRequest({ ...COMMAND, patientNote: '   ' }, context)
    ).toBe(false);
    // The note is advisory and not part of the retry fingerprint.
    expect(
      toBookingRequest({ ...COMMAND, patientNote: 'a' }, context).idempotency
    ).toEqual(
      toBookingRequest({ ...COMMAND, patientNote: 'b' }, context).idempotency
    );
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
    const { reschedule, service, stored } = createBoundary();
    stored.record = { ...OPEN_RECORD, startsAt: '2026-07-23T04:00:00.000Z' };

    await expect(
      service.reschedule(
        'appointment_server_001',
        RESCHEDULE_COMMAND,
        AUTHENTICATION
      )
    ).rejects.toMatchObject<Partial<DomainError>>({
      code: 'CANCELLATION_WINDOW_CLOSED'
    });
    // The transaction judges the window, so it is reached and refuses.
    expect(reschedule).toHaveBeenCalledOnce();
  });

  it('lets staff reschedule after the patient cutoff', async () => {
    const { reschedule, service, stored } = createBoundary();
    stored.record = { ...OPEN_RECORD, startsAt: '2026-07-23T04:00:00.000Z' };
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
    const { transition, service, stored } = createBoundary();
    stored.record = { ...OPEN_RECORD, startsAt: '2026-07-23T04:00:00.000Z' };

    await expect(
      service.cancel('appointment_server_001', CANCEL_COMMAND, AUTHENTICATION)
    ).rejects.toMatchObject<Partial<DomainError>>({
      code: 'CANCELLATION_WINDOW_CLOSED'
    });
    // The transaction judges the window, so it is reached and refuses.
    expect(transition).toHaveBeenCalledOnce();
  });

  it('hands the verified patient id to the transition for a patient and none for staff', async () => {
    const { transition, service } = createBoundary();
    const staff: AuthenticationContext = {
      actorId: 'actor_verified_001',
      actorRole: 'test_front_desk'
    };

    await service.cancel(
      'appointment_server_001',
      CANCEL_COMMAND,
      AUTHENTICATION
    );
    await service.cancel('appointment_server_001', CANCEL_COMMAND, staff);

    expect(transition.mock.calls[0]?.[0]).toMatchObject({
      expectedPatientId: 'patient_opaque_001'
    });
    expect(transition.mock.calls[1]?.[0]).not.toHaveProperty(
      'expectedPatientId'
    );
  });

  it('lets staff cancel after the patient cutoff', async () => {
    const { transition, service, stored } = createBoundary();
    stored.record = { ...OPEN_RECORD, startsAt: '2026-07-23T04:00:00.000Z' };
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
  birthDate: '--01-15',
  nationality: 'domestic' as const,
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

  it('requires existing verified identity before resolving follow-up intake', async () => {
    const patients = new InMemoryPatientDirectory();
    const resolveFromIntake = vi.spyOn(patients, 'resolveFromIntake');
    const { reserve, service } = createBoundService(patients);
    await expect(
      service.create(
        { ...COMMAND, bookingKind: 'follow_up', intake: SYNTHETIC_INTAKE },
        anonymous
      )
    ).rejects.toBeInstanceOf(MissingVerifiedPatientError);
    expect(resolveFromIntake).not.toHaveBeenCalled();
    expect(patients.createdPatientCount).toBe(0);
    expect(reserve).not.toHaveBeenCalled();
  });

  it('rejects intake alongside a verified patient before resolution or reservation', async () => {
    const patients = new InMemoryPatientDirectory();
    const resolveFromIntake = vi.spyOn(patients, 'resolveFromIntake');
    const { assertCanCreate, reserve, service } = createBoundService(patients);
    const verifiedPatient: AuthenticationContext = {
      actorId: 'patient_opaque_001',
      actorRole: 'patient',
      verifiedPatientId: 'patient_opaque_001'
    };

    await expect(
      service.create({ ...COMMAND, intake: SYNTHETIC_INTAKE }, verifiedPatient)
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    expect(resolveFromIntake).not.toHaveBeenCalled();
    expect(assertCanCreate).not.toHaveBeenCalled();
    expect(reserve).not.toHaveBeenCalled();
  });

  it('still resolves intake for a staff-only new booking', async () => {
    const patients = new InMemoryPatientDirectory();
    let n = 0;
    const { assertCanCreate, reserve, service } = createBoundService(
      patients,
      () => `opaque_${++n}`
    );
    const staff: AuthenticationContext = {
      actorId: 'actor_verified_002',
      actorRole: 'test_front_desk'
    };
    const command = { ...COMMAND, intake: SYNTHETIC_INTAKE };

    await expect(service.create(command, staff)).resolves.toMatchObject({
      status: 'confirmed'
    });

    expect(assertCanCreate).toHaveBeenCalledWith(
      { ...staff, verifiedPatientId: 'opaque_1' },
      command
    );
    expect(reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        patientId: 'opaque_1',
        audit: expect.objectContaining({ actorId: 'actor_verified_002' })
      }),
      expect.objectContaining({
        patientId: 'opaque_1',
        intake: SYNTHETIC_INTAKE
      })
    );
    expect(patients.createdPatientCount).toBe(1);
  });

  it('returns a generic miss for an unknown lookup and does not enumerate', async () => {
    const patients = new InMemoryPatientDirectory();
    const { service } = createBoundService(patients);
    const failures: string[] = [];

    await expect(
      service.lookupReturn(
        { phone: '0912000001', birthDate: '--01-15' },
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
    expect(failures[0]).not.toMatch(/0912|01-15/);
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
        { phone: '0912000001', birthDate: '--01-15' },
        '198.51.100.10'
      )
    ).resolves.toEqual(
      expect.objectContaining({
        outcome: 'schedule'
      })
    );
    await expect(
      service.lookupReturn(
        { phone: '0912000001', birthDate: '--01-15' },
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
        { phone: '0912000001', birthDate: '--01-15' },
        '198.51.100.10'
      )
    ).resolves.toMatchObject({
      outcome: 'existing',
      appointmentId: 'appointment_follow_001',
      startsAt: '2026-08-01T04:00:00.000Z'
    });

    const sessionId = (
      await service.lookupReturn(
        { phone: '0912000001', birthDate: '--01-15' },
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

  // ADR-0007: nationality is a staff-only visit fact. The clinic list carries
  // it for the Workbench; a patient's own list never does, same as patientId.
  it('returns the booking note on the staff clinic list only', async () => {
    const patients = new InMemoryPatientDirectory();
    const { service } = createBoundService(patients);
    patients.appointments.push({
      appointmentId: 'appointment_note_list_001',
      patientId: 'patient_opaque_102',
      slotId: 'slot_001',
      bookingKind: 'initial',
      status: 'confirmed',
      startsAt: '2026-07-25T04:00:00.000Z',
      patientNote: '合成備註'
    });
    const clinic = await service.list('clinic', {
      actorId: 'actor_verified_001',
      actorRole: 'test_front_desk'
    });
    expect(clinic.appointments[0]?.patientNote).toBe('合成備註');
  });

  it('returns intake nationality on the staff clinic list only', async () => {
    const patients = new InMemoryPatientDirectory();
    const { service } = createBoundService(patients);
    patients.appointments.push(
      {
        appointmentId: 'appointment_nationality_001',
        patientId: 'patient_opaque_101',
        slotId: 'slot_001',
        bookingKind: 'initial',
        status: 'confirmed',
        startsAt: '2026-07-25T04:00:00.000Z',
        intakeNationality: 'foreign'
      },
      {
        appointmentId: 'appointment_nationality_002',
        patientId: 'patient_opaque_101',
        slotId: 'slot_002',
        bookingKind: 'follow_up',
        status: 'confirmed',
        startsAt: '2026-07-26T04:15:00.000Z'
      }
    );

    const clinic = await service.list('clinic', {
      actorId: 'actor_verified_001',
      actorRole: 'test_front_desk'
    });
    expect(clinic.appointments.map((item) => item.intakeNationality)).toEqual([
      'foreign',
      undefined
    ]);
    expect(
      clinic.appointments.every((item) => 'intakeNationality' in item)
    ).toBe(false);

    const mine = await service.list('mine', {
      actorId: 'patient_opaque_101',
      actorRole: 'patient',
      verifiedPatientId: 'patient_opaque_101'
    });
    expect(mine.appointments).toHaveLength(2);
    for (const item of mine.appointments) {
      expect(item).not.toHaveProperty('intakeNationality');
      expect(item).not.toHaveProperty('patientId');
    }
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

describe('follow-up booking retried with the same idempotency key (AUD-08)', () => {
  const PATIENT_ID = 'patient_follow_retry_001';
  const patientAuthentication: AuthenticationContext = {
    actorId: PATIENT_ID,
    actorRole: 'patient',
    verifiedPatientId: PATIENT_ID
  };
  const FOLLOW_UP_BOOKING: CreateAppointmentRequest = {
    idempotencyKey: 'booking_follow_retry_0001',
    slotId: 'slot_follow_001',
    serviceId: 'service_consult',
    bookingKind: 'follow_up'
  };
  const FOLLOW_UP_STARTS_AT = '2026-07-25T04:15:00.000Z';

  /**
   * A repository stand-in with the ordering of the real transaction: a
   * recorded idempotency key is replayed (or rejected for other content)
   * before follow-up entitlement is judged, and a first booking moves the
   * patient's active follow-up pointer to itself.
   */
  function entitledPatientWithRecordingRepository() {
    const patients = new InMemoryPatientDirectory();
    patients.followUp.set(PATIENT_ID, {
      required: true,
      sourceAppointmentId: 'appointment_source_001',
      sourceFollowUpId: 'follow_up_001'
    });
    const recorded = new Map<string, PlannedIdempotencyRecord>();
    let n = 0;
    const bound = createBoundService(patients, () => `opaque_${++n}`);
    bound.reserve.mockImplementation(async (request) => {
      const replay = recorded.get(request.idempotency.recordId);
      if (replay !== undefined) {
        return {
          appointmentId: resolveIdempotencyReplay(replay, request.idempotency),
          replayed: true,
          startsAt: FOLLOW_UP_STARTS_AT
        };
      }
      assertFollowUpBookable(
        await patients.readFollowUpState(request.patientId),
        request.bookingKind
      );
      recorded.set(
        request.idempotency.recordId,
        planIdempotencyRecord(
          request.idempotency,
          request.appointmentId,
          request.requestedAt
        )
      );
      patients.appointments.push({
        appointmentId: request.appointmentId,
        patientId: request.patientId,
        slotId: request.slotId,
        bookingKind: request.bookingKind,
        status: 'confirmed',
        startsAt: FOLLOW_UP_STARTS_AT
      });
      patients.followUp.set(request.patientId, {
        required: true,
        sourceAppointmentId: 'appointment_source_001',
        sourceFollowUpId: 'follow_up_001',
        activeFollowUpAppointmentId: request.appointmentId
      });
      return {
        appointmentId: request.appointmentId,
        replayed: false,
        startsAt: FOLLOW_UP_STARTS_AT
      };
    });
    return { ...bound, patients, recorded };
  }

  it('replays the original result instead of refusing the retry', async () => {
    const { patients, recorded, reserve, service } =
      entitledPatientWithRecordingRepository();

    const first = await service.create(
      FOLLOW_UP_BOOKING,
      patientAuthentication
    );
    expect(first.appointmentId).toBe('opaque_1');
    // The state that used to turn the retry into FOLLOW_UP_ALREADY_SCHEDULED.
    expect(
      (await patients.readFollowUpState(PATIENT_ID))
        ?.activeFollowUpAppointmentId
    ).toBe('opaque_1');

    const retried = await service.create(
      FOLLOW_UP_BOOKING,
      patientAuthentication
    );

    expect(retried).toEqual(first);
    expect(reserve).toHaveBeenCalledTimes(2);
    expect(recorded.size).toBe(1);
    expect(patients.appointments).toHaveLength(1);
  });

  it('rejects the same key with different content as a reused key', async () => {
    const { patients, service } = entitledPatientWithRecordingRepository();
    await service.create(FOLLOW_UP_BOOKING, patientAuthentication);

    await expect(
      service.create(
        { ...FOLLOW_UP_BOOKING, slotId: 'slot_follow_002' },
        patientAuthentication
      )
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
    expect(patients.appointments).toHaveLength(1);
  });

  it('still refuses a second follow-up under a new key', async () => {
    const { patients, service } = entitledPatientWithRecordingRepository();
    await service.create(FOLLOW_UP_BOOKING, patientAuthentication);

    await expect(
      service.create(
        {
          ...FOLLOW_UP_BOOKING,
          idempotencyKey: 'booking_follow_retry_0002',
          slotId: 'slot_follow_002'
        },
        patientAuthentication
      )
    ).rejects.toMatchObject({ code: 'FOLLOW_UP_ALREADY_SCHEDULED' });
    expect(patients.appointments).toHaveLength(1);
  });

  it('fails closed when no patient directory is wired', async () => {
    const { reserve, service } = createBoundService();

    await expect(
      service.create(FOLLOW_UP_BOOKING, patientAuthentication)
    ).rejects.toMatchObject({ code: 'FOLLOW_UP_NOT_ENTITLED' });
    expect(reserve).not.toHaveBeenCalled();
  });
});

describe('patient self-reschedule retried with the same idempotency key', () => {
  const PATIENT_ID = 'patient_opaque_001';
  const patientAuthentication: AuthenticationContext = {
    actorId: PATIENT_ID,
    actorRole: 'patient',
    verifiedPatientId: PATIENT_ID
  };
  // 11:00 in Taipei on 2026-07-23: after that day's 10:00 cutoff, while the
  // appointment below (2026-07-25) is still inside its own window.
  const NOW_AFTER_CUTOFF = '2026-07-23T03:00:00.000Z';
  const SAME_DAY_MOVE: RescheduleAppointmentRequest = {
    idempotencyKey: 'reschedule_retry_0001',
    targetSlotId: 'slot_same_day_a'
  };

  /**
   * A repository stand-in with the ordering of the real transaction: a
   * recorded idempotency key is replayed (or rejected for other content)
   * before any rule is judged, and a first reschedule moves the stored row.
   */
  function recordingRepository() {
    const recorded = new Map<string, PlannedIdempotencyRecord>();
    const bound = createBoundService(
      undefined,
      () => 'appointment_server_001',
      NOW_AFTER_CUTOFF
    );
    bound.reschedule.mockImplementation((request) => {
      const replay = recorded.get(request.idempotency.recordId);
      if (replay !== undefined) {
        return Promise.resolve({
          appointmentId: resolveIdempotencyReplay(replay, request.idempotency),
          replayed: true,
          ...(bound.stored.record?.startsAt === undefined
            ? {}
            : { startsAt: bound.stored.record.startsAt })
        });
      }
      const plan = planStandInReschedule(request, bound.stored.record);
      recorded.set(request.idempotency.recordId, plan.idempotencyRecord);
      bound.stored.record = {
        ...OPEN_RECORD,
        slotId: plan.reserveSlotId,
        startsAt: plan.startsAt
      };
      return Promise.resolve({
        appointmentId: plan.appointmentId,
        replayed: false,
        startsAt: plan.startsAt
      });
    });
    return { ...bound, recorded };
  }

  it('replays the original result although the new time is already past the cutoff', async () => {
    const { recorded, reschedule, service, stored } = recordingRepository();

    const first = await service.reschedule(
      'appointment_server_001',
      SAME_DAY_MOVE,
      patientAuthentication
    );
    expect(first.startsAt).toBe('2026-07-23T07:00:00.000Z');
    // The state that used to turn the retry into CANCELLATION_WINDOW_CLOSED.
    expect(stored.record?.startsAt).toBe('2026-07-23T07:00:00.000Z');

    const retried = await service.reschedule(
      'appointment_server_001',
      SAME_DAY_MOVE,
      patientAuthentication
    );

    expect(retried).toEqual(first);
    expect(reschedule).toHaveBeenCalledTimes(2);
    expect(recorded.size).toBe(1);
    expect(stored.record?.slotId).toBe('slot_same_day_a');
  });

  it('rejects the same key with different content as a reused key', async () => {
    const { recorded, service, stored } = recordingRepository();
    await service.reschedule(
      'appointment_server_001',
      SAME_DAY_MOVE,
      patientAuthentication
    );

    await expect(
      service.reschedule(
        'appointment_server_001',
        { ...SAME_DAY_MOVE, targetSlotId: 'slot_same_day_b' },
        patientAuthentication
      )
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
    expect(recorded.size).toBe(1);
    expect(stored.record?.slotId).toBe('slot_same_day_a');
  });

  it('still closes the window for a new key once the appointment sits past the cutoff', async () => {
    const { recorded, service, stored } = recordingRepository();
    await service.reschedule(
      'appointment_server_001',
      SAME_DAY_MOVE,
      patientAuthentication
    );

    await expect(
      service.reschedule(
        'appointment_server_001',
        {
          idempotencyKey: 'reschedule_retry_0002',
          targetSlotId: 'slot_same_day_b'
        },
        patientAuthentication
      )
    ).rejects.toMatchObject({ code: 'CANCELLATION_WINDOW_CLOSED' });
    expect(recorded.size).toBe(1);
    expect(stored.record?.slotId).toBe('slot_same_day_a');
  });

  it('refuses a first request from a patient whose appointment is already inside the closed window, and leaves it unchanged', async () => {
    const { recorded, service, stored } = recordingRepository();
    stored.record = { ...OPEN_RECORD, startsAt: '2026-07-23T07:00:00.000Z' };

    await expect(
      service.reschedule(
        'appointment_server_001',
        SAME_DAY_MOVE,
        patientAuthentication
      )
    ).rejects.toMatchObject({ code: 'CANCELLATION_WINDOW_CLOSED' });
    expect(recorded.size).toBe(0);
    expect(stored.record.startsAt).toBe('2026-07-23T07:00:00.000Z');
  });

  it('fails closed for a patient when the stored appointment has no start time', async () => {
    const { recorded, service, stored } = recordingRepository();
    const { startsAt: _startsAt, ...withoutStart } = OPEN_RECORD;
    stored.record = withoutStart;

    await expect(
      service.reschedule(
        'appointment_server_001',
        SAME_DAY_MOVE,
        patientAuthentication
      )
    ).rejects.toMatchObject({ code: 'CANCELLATION_WINDOW_CLOSED' });
    expect(recorded.size).toBe(0);
  });

  it('does not apply the patient window to a staff retry or a staff first request', async () => {
    const { recorded, service, stored } = recordingRepository();
    const staff: AuthenticationContext = {
      actorId: 'actor_verified_001',
      actorRole: 'test_front_desk'
    };
    stored.record = { ...OPEN_RECORD, startsAt: '2026-07-23T04:00:00.000Z' };

    const first = await service.reschedule(
      'appointment_server_001',
      SAME_DAY_MOVE,
      staff
    );
    await expect(
      service.reschedule('appointment_server_001', SAME_DAY_MOVE, staff)
    ).resolves.toEqual(first);
    expect(recorded.size).toBe(1);
  });
});

describe('patient self-cancel retried with the same idempotency key', () => {
  const PATIENT_ID = 'patient_opaque_001';
  const patientAuthentication: AuthenticationContext = {
    actorId: PATIENT_ID,
    actorRole: 'patient',
    verifiedPatientId: PATIENT_ID
  };
  const STAFF: AuthenticationContext = {
    actorId: 'actor_verified_001',
    actorRole: 'test_front_desk'
  };
  // The appointment is at 12:00 in Taipei on 2026-07-23; that day's 10:00
  // self-service cutoff is 02:00 UTC.
  const APPOINTMENT_STARTS_AT = '2026-07-23T04:00:00.000Z';
  const BEFORE_CUTOFF = '2026-07-23T01:59:00.000Z';
  const AFTER_CUTOFF = '2026-07-23T03:00:00.000Z';

  /**
   * A repository stand-in with the ordering of the real transaction: a
   * recorded idempotency key is replayed (or rejected for other content)
   * before any rule is judged, and a first cancellation changes the stored row.
   */
  function recordingRepository() {
    const recorded = new Map<string, PlannedIdempotencyRecord>();
    const bound = createBoundService(
      undefined,
      () => 'appointment_server_001',
      BEFORE_CUTOFF
    );
    bound.stored.record = {
      ...OPEN_RECORD,
      startsAt: APPOINTMENT_STARTS_AT
    };
    bound.transition.mockImplementation((request) => {
      const replay = recorded.get(request.idempotency.recordId);
      if (replay !== undefined) {
        return Promise.resolve({
          appointmentId: resolveIdempotencyReplay(replay, request.idempotency),
          replayed: true,
          status: bound.stored.record?.status ?? 'cancelled'
        });
      }
      const plan = planStandInTransition(request, bound.stored.record);
      recorded.set(request.idempotency.recordId, plan.idempotencyRecord);
      if (bound.stored.record !== undefined) {
        bound.stored.record = {
          ...bound.stored.record,
          status: plan.nextStatus
        };
      }
      return Promise.resolve({
        appointmentId: plan.appointmentId,
        replayed: false,
        status: plan.nextStatus
      });
    });
    return { ...bound, recorded };
  }

  it('replays the original result although the cutoff has passed since', async () => {
    const { recorded, service, stored, time, transition } =
      recordingRepository();

    const first = await service.cancel(
      'appointment_server_001',
      CANCEL_COMMAND,
      patientAuthentication
    );
    expect(first).toEqual({
      appointmentId: 'appointment_server_001',
      status: 'cancelled'
    });
    // The state that used to turn the retry into CANCELLATION_WINDOW_CLOSED.
    time.nowUtc = AFTER_CUTOFF;

    const retried = await service.cancel(
      'appointment_server_001',
      CANCEL_COMMAND,
      patientAuthentication
    );

    expect(retried).toEqual(first);
    expect(transition).toHaveBeenCalledTimes(2);
    expect(recorded.size).toBe(1);
    expect(stored.record?.status).toBe('cancelled');
  });

  it('still closes the window for a new key once the cutoff has passed', async () => {
    const { recorded, service, stored, time } = recordingRepository();
    await service.cancel(
      'appointment_server_001',
      CANCEL_COMMAND,
      patientAuthentication
    );
    time.nowUtc = AFTER_CUTOFF;

    await expect(
      service.cancel(
        'appointment_server_001',
        { idempotencyKey: 'cancel_request_0002' },
        patientAuthentication
      )
    ).rejects.toMatchObject({ code: 'CANCELLATION_WINDOW_CLOSED' });
    expect(recorded.size).toBe(1);
    expect(stored.record?.status).toBe('cancelled');
  });

  it('refuses a first request made after the cutoff, and leaves the appointment unchanged', async () => {
    const { recorded, service, stored, time } = recordingRepository();
    time.nowUtc = AFTER_CUTOFF;

    await expect(
      service.cancel(
        'appointment_server_001',
        CANCEL_COMMAND,
        patientAuthentication
      )
    ).rejects.toMatchObject({ code: 'CANCELLATION_WINDOW_CLOSED' });
    expect(recorded.size).toBe(0);
    expect(stored.record?.status).toBe('confirmed');
  });

  it('fails closed for a patient when the stored appointment has no start time', async () => {
    const { recorded, service, stored } = recordingRepository();
    const { startsAt: _startsAt, ...withoutStart } = OPEN_RECORD;
    stored.record = withoutStart;

    await expect(
      service.cancel(
        'appointment_server_001',
        CANCEL_COMMAND,
        patientAuthentication
      )
    ).rejects.toMatchObject({ code: 'CANCELLATION_WINDOW_CLOSED' });
    expect(recorded.size).toBe(0);
  });

  it('does not apply the patient window to a staff retry or a staff first request', async () => {
    const { recorded, service, stored, time } = recordingRepository();
    time.nowUtc = AFTER_CUTOFF;

    const first = await service.cancel(
      'appointment_server_001',
      CANCEL_COMMAND,
      STAFF
    );
    await expect(
      service.cancel('appointment_server_001', CANCEL_COMMAND, STAFF)
    ).resolves.toEqual(first);
    expect(recorded.size).toBe(1);
    expect(stored.record?.status).toBe('cancelled');
  });

  it('keeps another patient’s appointment out of reach when the transaction is reached', async () => {
    const { recorded, service, stored, time } = recordingRepository();
    time.nowUtc = AFTER_CUTOFF;
    stored.record = {
      ...OPEN_RECORD,
      startsAt: APPOINTMENT_STARTS_AT,
      patientId: 'patient_other'
    };

    await expect(
      service.cancel(
        'appointment_server_001',
        CANCEL_COMMAND,
        patientAuthentication
      )
    ).rejects.toMatchObject({ code: 'APPOINTMENT_NOT_FOUND' });
    expect(recorded.size).toBe(0);
  });
});

describe('AppointmentApplicationService list reads only the rows it will return', () => {
  // The clock is 2026-07-23T14:30:00.000Z: the list shows appointments from
  // seven days before it to 31 days after it.
  const WINDOW = {
    from: '2026-07-16T14:30:00.000Z',
    to: '2026-08-23T14:30:00.000Z'
  };
  const STAFF: AuthenticationContext = {
    actorId: 'actor_verified_001',
    actorRole: 'test_front_desk'
  };

  function oldAppointments(count: number, patientId: string) {
    return Array.from({ length: count }, (_, index) => ({
      appointmentId: `appointment_old_${index}`,
      patientId,
      slotId: `slot_old_${index}`,
      bookingKind: 'initial' as const,
      status: 'completed' as const,
      startsAt: new Date(
        Date.parse('2026-01-01T04:00:00.000Z') + index * 30 * 60_000
      ).toISOString()
    }));
  }

  const inWindow = (patientId: string): AppointmentRecord[] => [
    {
      appointmentId: 'appointment_now_a',
      patientId,
      slotId: 'slot_now_a',
      bookingKind: 'initial',
      status: 'confirmed',
      startsAt: '2026-07-24T04:00:00.000Z'
    },
    {
      appointmentId: 'appointment_now_b',
      patientId,
      slotId: 'slot_now_b',
      bookingKind: 'initial',
      status: 'confirmed',
      startsAt: '2026-07-25T04:00:00.000Z'
    }
  ];

  it('passes the window it applies to the clinic list query', async () => {
    const patients = new InMemoryPatientDirectory();
    const listClinic = vi.spyOn(patients, 'listClinic');
    const { service } = createBoundService(patients);

    await service.list('clinic', STAFF);

    expect(listClinic).toHaveBeenCalledWith(50, WINDOW);
  });

  it('passes the same window to the patient list query', async () => {
    const patients = new InMemoryPatientDirectory();
    const listByPatient = vi.spyOn(patients, 'listByPatient');
    const { service } = createBoundService(patients);

    await service.list('mine', {
      actorId: 'patient_opaque_001',
      actorRole: 'patient',
      verifiedPatientId: 'patient_opaque_001'
    });

    expect(listByPatient).toHaveBeenCalledWith(
      'patient_opaque_001',
      50,
      WINDOW
    );
  });

  it('lists the appointments in the window although more than a page of older ones exist', async () => {
    const patients = new InMemoryPatientDirectory();
    patients.appointments.push(
      ...oldAppointments(60, 'patient_opaque_101'),
      ...inWindow('patient_opaque_101')
    );
    const { service } = createBoundService(patients);

    const clinic = await service.list('clinic', STAFF);
    const mine = await service.list('mine', {
      actorId: 'patient_opaque_101',
      actorRole: 'patient',
      verifiedPatientId: 'patient_opaque_101'
    });

    const expected = ['appointment_now_a', 'appointment_now_b'];
    expect(clinic.appointments.map((item) => item.appointmentId)).toEqual(
      expected
    );
    expect(mine.appointments.map((item) => item.appointmentId)).toEqual(
      expected
    );
  });

  it('still drops a row outside the window that a directory returned anyway', async () => {
    const patients = new InMemoryPatientDirectory();
    patients.appointments.push(
      ...oldAppointments(1, 'patient_opaque_101'),
      ...inWindow('patient_opaque_101')
    );
    // A directory that ignores the window, like the in-memory one before.
    vi.spyOn(patients, 'listClinic').mockImplementation(() =>
      Promise.resolve([...patients.appointments])
    );
    const { service } = createBoundService(patients);

    const clinic = await service.list('clinic', STAFF);

    expect(clinic.appointments.map((item) => item.appointmentId)).toEqual([
      'appointment_now_a',
      'appointment_now_b'
    ]);
  });
});
