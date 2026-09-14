import {
  INTERNAL_TEST_PRIVACY_POLICY_VERSION,
  type CancelAppointmentRequest,
  type CancelAppointmentResponse,
  type CreateAppointmentRequest,
  type CreateAppointmentResponse,
  type DeleteAppointmentRequest,
  type DeleteAppointmentResponse,
  type GetAppointmentResponse,
  type ListAppointmentsResponse,
  type RecordFollowUpRequest,
  type RecordFollowUpResponse,
  type RescheduleAppointmentRequest,
  type RescheduleAppointmentResponse,
  type ReturnLookupRequest,
  type ReturnLookupResponse,
  type TransitionAppointmentResponse
} from '@beauessence/contracts';
import type {
  AppointmentTransition,
  AuditContext,
  BookingRequest,
  DeleteAppointmentRequest as DomainDeleteAppointmentRequest,
  FollowUpDecisionRequest,
  RescheduleRequest,
  TransitionRequest
} from '@beauessence/domain';
import {
  DomainError,
  isWithinSelfCancelWindow,
  SLOT_DURATION_MINUTES
} from '@beauessence/domain';

import type { AuthenticationContext } from '../auth/authentication-context.js';
import type { AppointmentAuthorizationPolicy } from './appointment.policy.js';
import type {
  AppointmentRepositoryPort,
  ReservationResult
} from './appointment.repository-port.js';
import {
  createAppointmentIdempotency,
  deleteAppointmentIdempotency,
  followUpAppointmentIdempotency,
  rescheduleAppointmentIdempotency,
  transitionAppointmentIdempotency
} from '../idempotency/appointment-idempotency.js';
import {
  AuthenticationRequiredError,
  AuthorizationDeniedError
} from '../platform/errors/api-error.js';
import {
  assertFollowUpBookable,
  opaqueLookupIdentity,
  type PatientDirectoryPort
} from '../patients/patient-directory.js';

export interface AppointmentIdGenerator {
  next(): string;
}

export interface ApplicationClock {
  nowUtc(): string;
}

export interface CorrelationIdGenerator {
  next(): string;
}

/**
 * Extends `AuthenticationRequiredError` rather than `Error` so the central
 * mapper classifies it. As a plain Error it fell through to INTERNAL_ERROR, and
 * a caller who simply had not proved who they were got a 500 that reads as
 * "the server is broken" — the one response that tells them nothing about how
 * to succeed, while also polluting the error rate with a client condition.
 */
export class MissingVerifiedPatientError extends AuthenticationRequiredError {
  public constructor() {
    super();
    this.name = 'MissingVerifiedPatientError';
  }
}

function resolvedCreatePatientId(
  command: CreateAppointmentRequest,
  authentication: AuthenticationContext
): string {
  const verified = authentication.verifiedPatientId;
  const onBehalf = command.onBehalfPatientId;
  if (verified !== undefined) {
    if (onBehalf !== undefined && onBehalf !== verified) {
      throw new AuthorizationDeniedError();
    }
    return verified;
  }
  if (onBehalf !== undefined) return onBehalf;
  throw new MissingVerifiedPatientError();
}

function confirmedAppointmentResponse(
  appointmentId: string,
  startsAt: string
): CreateAppointmentResponse {
  return {
    appointmentId,
    status: 'confirmed',
    startsAt,
    endsAt: new Date(
      Date.parse(startsAt) + SLOT_DURATION_MINUTES * 60_000
    ).toISOString()
  };
}

function requireReservationStart(result: ReservationResult): string {
  if (result.startsAt === undefined) {
    throw new DomainError(
      'APPOINTMENT_NOT_FOUND',
      'The appointment does not exist.'
    );
  }
  return result.startsAt;
}

/**
 * Maps the executable API command to the pure domain request. Server-owned
 * values are explicit arguments so they cannot drift back into the HTTP body.
 */
export function toBookingRequest(
  command: CreateAppointmentRequest,
  context: {
    readonly appointmentId: string;
    readonly patientId: string;
    readonly requestedAt: string;
    readonly audit: AuditContext;
  }
): BookingRequest {
  return {
    appointmentId: context.appointmentId,
    slotId: command.slotId,
    patientId: context.patientId,
    bookingKind: command.bookingKind,
    itemId: command.serviceId,
    audit: context.audit,
    requestedAt: context.requestedAt,
    idempotency: createAppointmentIdempotency({
      key: command.idempotencyKey,
      actorId: context.audit.actorId,
      patientId: context.patientId,
      slotId: command.slotId,
      bookingKind: command.bookingKind,
      itemId: command.serviceId
    })
  };
}

/**
 * Maps the executable reschedule command to the pure domain request. Slot
 * occupancy, cutoff and horizon stay at their owning boundaries; this helper
 * only binds server-owned identity, time and idempotency.
 */
export function toRescheduleRequest(
  appointmentId: string,
  command: RescheduleAppointmentRequest,
  context: {
    readonly expectedPatientId?: string;
    readonly requestedAt: string;
    readonly audit: AuditContext;
  }
): RescheduleRequest {
  return {
    appointmentId,
    targetSlotId: command.targetSlotId,
    ...(context.expectedPatientId === undefined
      ? {}
      : { expectedPatientId: context.expectedPatientId }),
    audit: context.audit,
    requestedAt: context.requestedAt,
    idempotency: rescheduleAppointmentIdempotency({
      key: command.idempotencyKey,
      actorId: context.audit.actorId,
      appointmentId,
      targetSlotId: command.targetSlotId
    })
  };
}

export function toTransitionRequest(
  appointmentId: string,
  command: CancelAppointmentRequest,
  transition: AppointmentTransition,
  context: {
    readonly requestedAt: string;
    readonly audit: AuditContext;
  }
): TransitionRequest {
  return {
    appointmentId,
    transition,
    audit: context.audit,
    requestedAt: context.requestedAt,
    idempotency: transitionAppointmentIdempotency({
      key: command.idempotencyKey,
      actorId: context.audit.actorId,
      appointmentId,
      transition
    })
  };
}

export function toFollowUpRequest(
  appointmentId: string,
  command: RecordFollowUpRequest,
  context: {
    readonly requestedAt: string;
    readonly audit: AuditContext;
  }
): FollowUpDecisionRequest {
  return {
    appointmentId,
    decision: command.decision,
    ...(command.dueDate === undefined ? {} : { dueDate: command.dueDate }),
    ...(command.dueTime === undefined ? {} : { dueTime: command.dueTime }),
    audit: context.audit,
    requestedAt: context.requestedAt,
    idempotency: followUpAppointmentIdempotency({
      key: command.idempotencyKey,
      actorId: context.audit.actorId,
      appointmentId,
      decision: command.decision,
      ...(command.dueDate === undefined ? {} : { dueDate: command.dueDate }),
      ...(command.dueTime === undefined ? {} : { dueTime: command.dueTime })
    })
  };
}

export function toDeleteRequest(
  appointmentId: string,
  command: DeleteAppointmentRequest,
  context: {
    readonly requestedAt: string;
    readonly audit: AuditContext;
  }
): DomainDeleteAppointmentRequest {
  return {
    appointmentId,
    audit: context.audit,
    requestedAt: context.requestedAt,
    idempotency: deleteAppointmentIdempotency({
      key: command.idempotencyKey,
      actorId: context.audit.actorId,
      appointmentId,
      reasonCode: command.reasonCode
    })
  };
}

/**
 * Unrouted Stage 0 application boundary. A future controller may parse HTTP
 * input and call this service only after the authentication adapter has
 * produced a context; it must never call Firestore directly.
 */
export class AppointmentApplicationService {
  public constructor(
    private readonly repository: AppointmentRepositoryPort,
    private readonly authorization: AppointmentAuthorizationPolicy,
    private readonly ids: AppointmentIdGenerator,
    private readonly clock: ApplicationClock,
    private readonly correlations: CorrelationIdGenerator,
    private readonly patients?: PatientDirectoryPort
  ) {}

  private async resolveCreateAuthentication(
    command: CreateAppointmentRequest,
    authentication: AuthenticationContext
  ): Promise<AuthenticationContext> {
    if (authentication.verifiedPatientId !== undefined) return authentication;
    if (command.intake !== undefined) {
      if (this.patients === undefined) throw new MissingVerifiedPatientError();
      const patientId = await this.patients.resolveFromIntake(
        command.intake,
        this.clock.nowUtc(),
        () => this.ids.next()
      );
      return {
        actorId:
          authentication.actorId === 'anonymous'
            ? patientId
            : authentication.actorId,
        actorRole: authentication.actorRole,
        verifiedPatientId: patientId
      };
    }
    return authentication;
  }

  public async create(
    command: CreateAppointmentRequest,
    authentication: AuthenticationContext
  ): Promise<CreateAppointmentResponse> {
    const resolvedAuth = await this.resolveCreateAuthentication(
      command,
      authentication
    );
    const patientId = resolvedCreatePatientId(command, resolvedAuth);
    if (command.bookingKind === 'follow_up') {
      if (this.patients === undefined) {
        throw new DomainError(
          'FOLLOW_UP_NOT_ENTITLED',
          'No follow-up entitlement exists.'
        );
      }
      assertFollowUpBookable(
        await this.patients.readFollowUpState(patientId),
        command.bookingKind
      );
    }
    await this.authorization.assertCanCreate(resolvedAuth, command);

    const result = await this.repository.reserve(
      toBookingRequest(command, {
        appointmentId: this.ids.next(),
        patientId,
        requestedAt: this.clock.nowUtc(),
        audit: {
          actorId: resolvedAuth.actorId,
          actorRole: resolvedAuth.actorRole,
          correlationId: this.correlations.next(),
          source: 'api',
          reasonCode: null,
          // IP-001 internal-test identifier. accepted_at is audit.occurredAt.
          // Create must not take a client privacyAcceptance payload.
          policyVersion: INTERNAL_TEST_PRIVACY_POLICY_VERSION
        }
      })
    );
    return confirmedAppointmentResponse(
      result.appointmentId,
      requireReservationStart(result)
    );
  }

  public async reschedule(
    appointmentId: string,
    command: RescheduleAppointmentRequest,
    authentication: AuthenticationContext
  ): Promise<RescheduleAppointmentResponse> {
    const record = await this.repository.read(appointmentId);
    await this.authorization.assertCanReschedule(
      authentication,
      record === undefined ? {} : { appointmentPatientId: record.patientId }
    );

    if (authentication.verifiedPatientId !== undefined) {
      const nowMs = Date.parse(this.clock.nowUtc());
      if (
        record?.startsAt === undefined ||
        !isWithinSelfCancelWindow(record.startsAt, nowMs)
      ) {
        throw new DomainError(
          'CANCELLATION_WINDOW_CLOSED',
          'The self-reschedule window has closed.'
        );
      }
    }

    const result = await this.repository.reschedule(
      toRescheduleRequest(appointmentId, command, {
        ...(authentication.verifiedPatientId === undefined
          ? {}
          : { expectedPatientId: authentication.verifiedPatientId }),
        requestedAt: this.clock.nowUtc(),
        audit: {
          actorId: authentication.actorId,
          actorRole: authentication.actorRole,
          correlationId: this.correlations.next(),
          source: 'api',
          reasonCode: null,
          policyVersion: null
        }
      })
    );
    return confirmedAppointmentResponse(
      result.appointmentId,
      requireReservationStart(result)
    );
  }

  public async get(
    appointmentId: string,
    authentication: AuthenticationContext
  ): Promise<GetAppointmentResponse> {
    const record = await this.repository.read(appointmentId);
    await this.authorization.assertCanQuery(
      authentication,
      record === undefined ? {} : { appointmentPatientId: record.patientId }
    );
    if (record === undefined || record.startsAt === undefined) {
      throw new DomainError(
        'APPOINTMENT_NOT_FOUND',
        'The appointment does not exist.'
      );
    }
    return {
      appointmentId: record.appointmentId,
      status: record.status,
      startsAt: record.startsAt,
      endsAt: new Date(
        Date.parse(record.startsAt) + SLOT_DURATION_MINUTES * 60_000
      ).toISOString(),
      bookingKind: record.bookingKind,
      slotId: record.slotId,
      ...(authentication.actorRole === 'patient'
        ? {}
        : { patientId: record.patientId })
    };
  }

  public async list(
    scope: 'mine' | 'clinic',
    authentication: AuthenticationContext
  ): Promise<ListAppointmentsResponse> {
    if (this.patients === undefined) {
      throw new DomainError(
        'APPOINTMENT_NOT_FOUND',
        'The appointment does not exist.'
      );
    }
    if (scope === 'clinic') {
      await this.authorization.assertCanQuery(authentication, {});
      const records = await this.patients.listClinic(50);
      return {
        appointments: records.flatMap((record) => this.toListItem(record))
      };
    }
    const patientId = authentication.verifiedPatientId;
    if (patientId === undefined) throw new AuthenticationRequiredError();
    await this.authorization.assertCanQuery(authentication, {
      appointmentPatientId: patientId
    });
    const records = await this.patients.listByPatient(patientId, 50);
    return {
      appointments: records.flatMap((record) => this.toListItem(record, true))
    };
  }

  public async lookupReturn(
    command: ReturnLookupRequest,
    ip: string,
    limiter?: { assertLookupFailure(id: string, ip: string): Promise<void> }
  ): Promise<ReturnLookupResponse> {
    if (this.patients === undefined) {
      throw new DomainError(
        'APPOINTMENT_NOT_FOUND',
        'The appointment does not exist.'
      );
    }
    const result = await this.patients.lookupReturn(
      command.phone,
      command.birthDate,
      this.clock.nowUtc(),
      () => this.ids.next()
    );
    if (result === undefined) {
      if (limiter !== undefined) {
        await limiter.assertLookupFailure(
          opaqueLookupIdentity(command.phone, command.birthDate),
          ip
        );
      }
      throw new DomainError(
        'APPOINTMENT_NOT_FOUND',
        'The appointment does not exist.'
      );
    }
    return {
      sessionId: result.sessionId,
      expiresAt: result.expiresAt,
      outcome: result.outcome,
      ...(result.appointmentId === undefined
        ? {}
        : { appointmentId: result.appointmentId }),
      ...(result.startsAt === undefined ? {} : { startsAt: result.startsAt }),
      ...(result.endsAt === undefined ? {} : { endsAt: result.endsAt })
    };
  }

  private toListItem(
    record: import('./appointment.repository-port.js').AppointmentRecord,
    patientScope = false
  ): GetAppointmentResponse[] {
    if (record.startsAt === undefined) return [];
    const startMs = Date.parse(record.startsAt);
    const nowMs = Date.parse(this.clock.nowUtc());
    const lookbackMs = 7 * 24 * 60 * 60 * 1000;
    const horizonMs = 31 * 24 * 60 * 60 * 1000;
    if (startMs < nowMs - lookbackMs || startMs > nowMs + horizonMs) {
      return [];
    }
    return [
      {
        appointmentId: record.appointmentId,
        status: record.status,
        startsAt: record.startsAt,
        endsAt: new Date(
          Date.parse(record.startsAt) + SLOT_DURATION_MINUTES * 60_000
        ).toISOString(),
        bookingKind: record.bookingKind,
        slotId: record.slotId,
        ...(patientScope ? {} : { patientId: record.patientId })
      }
    ];
  }

  public async cancel(
    appointmentId: string,
    command: CancelAppointmentRequest,
    authentication: AuthenticationContext
  ): Promise<CancelAppointmentResponse> {
    const record = await this.repository.read(appointmentId);
    await this.authorization.assertCanCancel(
      authentication,
      record === undefined ? {} : { appointmentPatientId: record.patientId }
    );

    if (authentication.verifiedPatientId !== undefined) {
      const nowMs = Date.parse(this.clock.nowUtc());
      if (
        record?.startsAt === undefined ||
        !isWithinSelfCancelWindow(record.startsAt, nowMs)
      ) {
        throw new DomainError(
          'CANCELLATION_WINDOW_CLOSED',
          'The self-cancellation window has closed.'
        );
      }
    }

    const result = await this.repository.transition(
      toTransitionRequest(appointmentId, command, 'cancel', {
        requestedAt: this.clock.nowUtc(),
        audit: {
          actorId: authentication.actorId,
          actorRole: authentication.actorRole,
          correlationId: this.correlations.next(),
          source: 'api',
          reasonCode: null,
          policyVersion: null
        }
      })
    );

    if (
      result.status !== 'cancelled' &&
      result.status !== 'cancellation_requested'
    ) {
      throw new DomainError(
        'TRANSITION_NOT_ALLOWED',
        'The appointment cannot be cancelled.'
      );
    }

    return {
      appointmentId: result.appointmentId,
      status: result.status
    };
  }

  public async arrive(
    appointmentId: string,
    command: CancelAppointmentRequest,
    authentication: AuthenticationContext
  ): Promise<TransitionAppointmentResponse> {
    return this.staffVisitTransition(
      appointmentId,
      command,
      authentication,
      'arrive',
      'arrived'
    );
  }

  public async complete(
    appointmentId: string,
    command: CancelAppointmentRequest,
    authentication: AuthenticationContext
  ): Promise<TransitionAppointmentResponse> {
    return this.staffVisitTransition(
      appointmentId,
      command,
      authentication,
      'complete',
      'completed'
    );
  }

  public async markNoShow(
    appointmentId: string,
    command: CancelAppointmentRequest,
    authentication: AuthenticationContext
  ): Promise<TransitionAppointmentResponse> {
    return this.staffVisitTransition(
      appointmentId,
      command,
      authentication,
      'no_show',
      'no_show'
    );
  }

  public async recordFollowUp(
    appointmentId: string,
    command: RecordFollowUpRequest,
    authentication: AuthenticationContext
  ): Promise<RecordFollowUpResponse> {
    const record = await this.repository.read(appointmentId);
    await this.authorization.assertCanDecideFollowUp(
      authentication,
      record === undefined ? {} : { appointmentPatientId: record.patientId }
    );

    const result = await this.repository.recordFollowUp(
      toFollowUpRequest(appointmentId, command, {
        requestedAt: this.clock.nowUtc(),
        audit: {
          actorId: authentication.actorId,
          actorRole: authentication.actorRole,
          correlationId: this.correlations.next(),
          source: 'api',
          reasonCode: null,
          policyVersion: null
        }
      })
    );

    return {
      appointmentId: result.appointmentId,
      decision: result.decision,
      dueAt: result.dueAt
    };
  }

  public async delete(
    appointmentId: string,
    command: DeleteAppointmentRequest,
    authentication: AuthenticationContext
  ): Promise<DeleteAppointmentResponse> {
    await this.authorization.assertCanDelete(authentication);
    const result = await this.repository.deleteAppointment(
      toDeleteRequest(appointmentId, command, {
        requestedAt: this.clock.nowUtc(),
        audit: {
          actorId: authentication.actorId,
          actorRole: authentication.actorRole,
          correlationId: this.correlations.next(),
          source: 'api',
          reasonCode: command.reasonCode,
          policyVersion: null
        }
      })
    );

    return {
      appointmentId: result.appointmentId,
      deleted: true,
      auditEventId: result.auditEventId
    };
  }

  private async staffVisitTransition(
    appointmentId: string,
    command: CancelAppointmentRequest,
    authentication: AuthenticationContext,
    transition: 'arrive' | 'complete' | 'no_show',
    expectedStatus: 'arrived' | 'completed' | 'no_show'
  ): Promise<TransitionAppointmentResponse> {
    const record = await this.repository.read(appointmentId);
    await this.authorization.assertCanComplete(
      authentication,
      record === undefined ? {} : { appointmentPatientId: record.patientId }
    );

    const result = await this.repository.transition(
      toTransitionRequest(appointmentId, command, transition, {
        requestedAt: this.clock.nowUtc(),
        audit: {
          actorId: authentication.actorId,
          actorRole: authentication.actorRole,
          correlationId: this.correlations.next(),
          source: 'api',
          reasonCode: null,
          policyVersion: null
        }
      })
    );

    if (result.status !== expectedStatus) {
      throw new DomainError(
        'TRANSITION_NOT_ALLOWED',
        'The appointment cannot change visit status.'
      );
    }

    return {
      appointmentId: result.appointmentId,
      status: result.status
    };
  }
}
