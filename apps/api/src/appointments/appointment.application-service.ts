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
  assertUtcTimestamp,
  DomainError,
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
  opaqueLookupIdentity,
  type AppointmentListWindow,
  type PatientDirectoryPort
} from '../patients/patient-directory.js';
import type { AppointmentRecord } from './appointment.repository-port.js';
import { decodeListCursor, encodeListCursor } from './list-cursor.js';

/** The lists show appointments from a week before now to 31 days after it. */
const LIST_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const LIST_HORIZON_MS = 31 * 24 * 60 * 60 * 1000;
/** Rows per list page: the default and the most a caller may ask for. */
export const LIST_PAGE_SIZE = 50;

export interface AppointmentListPage {
  readonly response: ListAppointmentsResponse;
  /** Present only when rows remain after this page. */
  readonly nextCursor?: string;
}

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
    ...(command.intake === undefined
      ? {}
      : { intakeNationality: command.intake.nationality }),
    // Advisory text: not part of the idempotency fingerprint, so a retried
    // request replays the first booking even if the note was edited.
    ...(command.patientNote === undefined || command.patientNote.trim() === ''
      ? {}
      : { patientNote: command.patientNote.trim() }),
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
    readonly expectedPatientId?: string;
    readonly requestedAt: string;
    readonly audit: AuditContext;
  }
): TransitionRequest {
  return {
    appointmentId,
    transition,
    ...(context.expectedPatientId === undefined
      ? {}
      : { expectedPatientId: context.expectedPatientId }),
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

  private nowUtc(): string {
    const now = this.clock.nowUtc();
    assertUtcTimestamp(now, 'clock.nowUtc');
    return now;
  }

  private async resolveCreateAuthentication(
    command: CreateAppointmentRequest,
    authentication: AuthenticationContext
  ): Promise<{
    authentication: AuthenticationContext;
    intake?: import('../patients/patient-directory.js').PreparedPatientIntake;
  }> {
    if (
      command.intake !== undefined &&
      authentication.verifiedPatientId !== undefined
    ) {
      throw new AuthorizationDeniedError();
    }
    if (authentication.verifiedPatientId !== undefined)
      return { authentication };
    // Intake is initial-booking identity, not proof for a return/follow-up.
    if (command.bookingKind === 'follow_up' && command.intake !== undefined) {
      throw new MissingVerifiedPatientError();
    }
    if (command.intake !== undefined) {
      if (this.patients === undefined) throw new MissingVerifiedPatientError();
      const intake = await this.patients.prepareIntake(
        command.intake,
        this.nowUtc(),
        () => this.ids.next()
      );
      const patientId = intake.patientId;
      return {
        intake,
        authentication: {
          actorId:
            authentication.actorId === 'anonymous'
              ? patientId
              : authentication.actorId,
          actorRole: authentication.actorRole,
          verifiedPatientId: patientId
        }
      };
    }
    return { authentication };
  }

  public async create(
    command: CreateAppointmentRequest,
    authentication: AuthenticationContext
  ): Promise<CreateAppointmentResponse> {
    const resolved = await this.resolveCreateAuthentication(
      command,
      authentication
    );
    const resolvedAuth = resolved.authentication;
    const patientId = resolvedCreatePatientId(command, resolvedAuth);
    // Whether the patient may book a follow-up is decided by the reserve
    // transaction, after it has replayed a recorded idempotency key. Judging it
    // here from the patient's current state turned the retry of a booking that
    // had succeeded into FOLLOW_UP_ALREADY_SCHEDULED, because that very booking
    // is what made the state unbookable (AUD-08).
    if (command.bookingKind === 'follow_up' && this.patients === undefined) {
      throw new DomainError(
        'FOLLOW_UP_NOT_ENTITLED',
        'No follow-up entitlement exists.'
      );
    }
    await this.authorization.assertCanCreate(resolvedAuth, command);

    const request = toBookingRequest(command, {
      appointmentId: this.ids.next(),
      patientId,
      requestedAt: this.nowUtc(),
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
    });
    const result =
      resolved.intake === undefined
        ? await this.repository.reserve(request)
        : await this.repository.reserve(request, resolved.intake);
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

    // The patient self-service window is judged by the reschedule transaction
    // (planReschedule), after it has replayed a recorded idempotency key.
    // Judging it here from the appointment's current time turned the retry of a
    // move that had succeeded into CANCELLATION_WINDOW_CLOSED, because that very
    // move is what put the appointment past its cutoff.
    const result = await this.repository.reschedule(
      toRescheduleRequest(appointmentId, command, {
        ...(authentication.verifiedPatientId === undefined
          ? {}
          : { expectedPatientId: authentication.verifiedPatientId }),
        requestedAt: this.nowUtc(),
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
    return (await this.listPage(scope, authentication)).response;
  }

  /**
   * One page of the list plus, when more rows follow, the cursor for the next
   * call. The response body stays `{ appointments }` (its schema is strict);
   * the cursor travels beside it. The directory is asked for one row more than
   * the page so "exactly one full page" is not reported as truncated.
   */
  public async listPage(
    scope: 'mine' | 'clinic',
    authentication: AuthenticationContext,
    query: {
      readonly limit?: number | undefined;
      readonly cursor?: string | undefined;
    } = {}
  ): Promise<AppointmentListPage> {
    if (this.patients === undefined) {
      throw new DomainError(
        'APPOINTMENT_NOT_FOUND',
        'The appointment does not exist.'
      );
    }
    let patientId: string | undefined;
    if (scope === 'clinic') {
      await this.authorization.assertCanQuery(authentication, {});
    } else {
      patientId = authentication.verifiedPatientId;
      if (patientId === undefined) throw new AuthenticationRequiredError();
      await this.authorization.assertCanQuery(authentication, {
        appointmentPatientId: patientId
      });
    }
    const limit = query.limit ?? LIST_PAGE_SIZE;
    if (!Number.isInteger(limit) || limit < 1 || limit > LIST_PAGE_SIZE) {
      throw new DomainError('INVALID_VALUE', 'The list limit is not valid.');
    }
    const after =
      query.cursor === undefined ? undefined : decodeListCursor(query.cursor);
    const window = this.listWindow();
    const fetched =
      patientId === undefined
        ? await this.patients.listClinic(limit + 1, window, after)
        : await this.patients.listByPatient(
            patientId,
            limit + 1,
            window,
            after
          );
    const records = fetched.slice(0, limit);
    const response = {
      appointments: records.flatMap((record) =>
        this.toListItem(record, scope === 'mine')
      )
    };
    const last = records.at(-1);
    return fetched.length > limit && last?.startsAt !== undefined
      ? {
          response,
          nextCursor: encodeListCursor({
            startsAt: last.startsAt,
            appointmentId: last.appointmentId
          })
        }
      : { response };
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
      this.nowUtc(),
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

  /**
   * The window `toListItem` applies, handed to the directory as well: asking
   * for the oldest rows and dropping the ones outside the window afterwards
   * left the page with nothing once enough old appointments existed.
   */
  private listWindow(): AppointmentListWindow {
    const nowMs = Date.parse(this.nowUtc());
    return {
      from: new Date(nowMs - LIST_LOOKBACK_MS).toISOString(),
      to: new Date(nowMs + LIST_HORIZON_MS).toISOString()
    };
  }

  private toListItem(
    record: AppointmentRecord,
    patientScope = false
  ): GetAppointmentResponse[] {
    if (record.startsAt === undefined) return [];
    assertUtcTimestamp(record.startsAt, 'appointment.startsAt');
    const startMs = Date.parse(record.startsAt);
    const nowMs = Date.parse(this.nowUtc());
    if (
      startMs < nowMs - LIST_LOOKBACK_MS ||
      startMs > nowMs + LIST_HORIZON_MS
    ) {
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
        // Nationality is a staff-only visit fact (ADR-0007): like patientId it
        // is never returned on a patient's own list.
        ...(patientScope ? {} : { patientId: record.patientId }),
        ...(patientScope || record.intakeNationality === undefined
          ? {}
          : { intakeNationality: record.intakeNationality }),
        ...(patientScope || record.patientNote === undefined
          ? {}
          : { patientNote: record.patientNote }),
        ...(patientScope || record.identityReviewRequired !== true
          ? {}
          : { identityReviewRequired: true as const })
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

    // The patient self-service window is judged by the transition transaction
    // (planTransition), after it has replayed a recorded idempotency key.
    // Judging it here from the appointment's start time turned the retry of a
    // cancel that had succeeded before the cutoff into CANCELLATION_WINDOW_CLOSED
    // once the cutoff had passed.
    const result = await this.repository.transition(
      toTransitionRequest(appointmentId, command, 'cancel', {
        ...(authentication.verifiedPatientId === undefined
          ? {}
          : { expectedPatientId: authentication.verifiedPatientId }),
        requestedAt: this.nowUtc(),
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
        requestedAt: this.nowUtc(),
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
        requestedAt: this.nowUtc(),
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
    // Role denial does not need the record. Reading first turned a 403 into a
    // 500 when Cloud Firestore credentials were absent.
    await this.authorization.assertCanComplete(authentication, {});
    const record = await this.repository.read(appointmentId);
    await this.authorization.assertCanComplete(
      authentication,
      record === undefined ? {} : { appointmentPatientId: record.patientId }
    );

    const result = await this.repository.transition(
      toTransitionRequest(appointmentId, command, transition, {
        requestedAt: this.nowUtc(),
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
