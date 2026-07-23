import type { CreateAppointmentRequest } from '@beauessence/contracts';
import type { AuditContext, BookingRequest } from '@beauessence/domain';

import type { AuthenticationContext } from '../auth/authentication-context.js';
import type { AppointmentAuthorizationPolicy } from './appointment.policy.js';
import type {
  AppointmentRepositoryPort,
  ReservationResult
} from './appointment.repository-port.js';
import { createAppointmentIdempotency } from '../idempotency/appointment-idempotency.js';

export interface AppointmentIdGenerator {
  next(): string;
}

export interface ApplicationClock {
  nowUtc(): string;
}

export interface CorrelationIdGenerator {
  next(): string;
}

export class MissingVerifiedPatientError extends Error {
  public constructor() {
    super('A server-verified patient identity is required.');
    this.name = 'MissingVerifiedPatientError';
  }
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
  ): Promise<ReservationResult> {
    if (authentication.verifiedPatientId === undefined) {
      throw new MissingVerifiedPatientError();
    }

    await this.authorization.assertCanCreate(authentication, command);

    return this.repository.reserve(
      toBookingRequest(command, {
        appointmentId: this.ids.next(),
        patientId: authentication.verifiedPatientId,
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
  }
}
