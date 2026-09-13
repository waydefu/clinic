import type {
  CancelAppointmentRequest,
  CancelAppointmentResponse,
  CreateAppointmentRequest,
  CreateAppointmentResponse,
  GetAppointmentResponse,
  RescheduleAppointmentRequest,
  RescheduleAppointmentResponse
} from '@beauessence/contracts';
import type {
  AppointmentTransition,
  AuditContext,
  BookingRequest,
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
  rescheduleAppointmentIdempotency,
  transitionAppointmentIdempotency
} from '../idempotency/appointment-idempotency.js';
import {
  AuthenticationRequiredError,
  AuthorizationDeniedError
} from '../platform/errors/api-error.js';

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
    private readonly correlations: CorrelationIdGenerator
  ) {}

  public async create(
    command: CreateAppointmentRequest,
    authentication: AuthenticationContext
  ): Promise<CreateAppointmentResponse> {
    const patientId = resolvedCreatePatientId(command, authentication);
    await this.authorization.assertCanCreate(authentication, command);

    const result = await this.repository.reserve(
      toBookingRequest(command, {
        appointmentId: this.ids.next(),
        patientId,
        requestedAt: this.clock.nowUtc(),
        audit: {
          actorId: authentication.actorId,
          actorRole: authentication.actorRole,
          correlationId: this.correlations.next(),
          source: 'api',
          reasonCode: null,
          // The approved policy/rule version will be loaded here after the
          // D-003/D-004 decisions land; Stage 0 must not invent one.
          policyVersion: null
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
      ).toISOString()
    };
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
}
