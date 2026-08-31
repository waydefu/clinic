import type {
  ActivateCalendarSourceRequest,
  CalendarAvailabilityResponse,
  CalendarChangeCandidate,
  CalendarSourceCommandResponse,
  CalendarSourcePreflightResponse,
  CalendarSourceSummary,
  CalendarSyncStatus,
  CancelSyntheticAppointmentRequest,
  CreateSyntheticAppointmentRequest,
  RescheduleSyntheticAppointmentRequest,
  ResolveCalendarCandidateRequest,
  ReviewCalendarCandidateRequest,
  ReviewCalendarCandidateResponse,
  SyntheticAppointmentCommandResponse
} from '@beauessence/contracts';

import type { AuthenticationContext } from '../auth/authentication-context.js';
import {
  AuthenticationRequiredError,
  AuthorizationDeniedError
} from '../platform/errors/api-error.js';
import type { CalendarPilotRepositoryPort } from './calendar-pilot.repository-port.js';

export interface CalendarPilotClock {
  nowUtc(): string;
}

type StaffRole = 'manager' | 'front_desk';

function requireRole(
  authentication: AuthenticationContext,
  allowed: readonly StaffRole[]
): StaffRole {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(authentication.actorId))
    throw new AuthenticationRequiredError();
  if (
    authentication.actorRole !== 'manager' &&
    authentication.actorRole !== 'front_desk'
  )
    throw new AuthorizationDeniedError();
  if (!allowed.includes(authentication.actorRole))
    throw new AuthorizationDeniedError();
  return authentication.actorRole;
}

/**
 * Synthetic-only application boundary. It receives a server-established
 * identity and never accepts an actor, role, Calendar identifier or Google
 * event identifier from the browser.
 */
export class CalendarPilotApplicationService {
  public constructor(
    private readonly repository: CalendarPilotRepositoryPort,
    private readonly clock: CalendarPilotClock
  ) {}

  public status(
    authentication: AuthenticationContext
  ): Promise<CalendarSyncStatus> {
    requireRole(authentication, ['manager', 'front_desk']);
    return this.repository.getStatus(this.clock.nowUtc());
  }

  public sources(
    authentication: AuthenticationContext
  ): Promise<readonly CalendarSourceSummary[]> {
    requireRole(authentication, ['manager', 'front_desk']);
    return this.repository.listSources();
  }

  public candidates(
    authentication: AuthenticationContext
  ): Promise<readonly CalendarChangeCandidate[]> {
    requireRole(authentication, ['manager', 'front_desk']);
    return this.repository.listCandidates();
  }

  public availability(
    authentication: AuthenticationContext
  ): Promise<CalendarAvailabilityResponse> {
    requireRole(authentication, ['manager', 'front_desk']);
    return this.repository.getAvailability(this.clock.nowUtc());
  }

  public appointments(authentication: AuthenticationContext) {
    requireRole(authentication, ['manager', 'front_desk']);
    return this.repository.listSyntheticAppointments();
  }

  public patients(authentication: AuthenticationContext) {
    requireRole(authentication, ['manager', 'front_desk']);
    return this.repository.listSyntheticPatients();
  }

  public sourcePreflight(
    preflightId: string,
    authentication: AuthenticationContext
  ) {
    requireRole(authentication, ['manager']);
    return this.repository.getSourcePreflight(preflightId);
  }

  public preflightSource(
    command: ActivateCalendarSourceRequest,
    authentication: AuthenticationContext
  ): Promise<CalendarSourcePreflightResponse> {
    requireRole(authentication, ['manager']);
    return this.repository.requestSourcePreflight({
      ...command,
      actorId: authentication.actorId,
      occurredAt: this.clock.nowUtc()
    });
  }

  public activateSource(
    command: ActivateCalendarSourceRequest & { readonly preflightId: string },
    authentication: AuthenticationContext
  ): Promise<CalendarSourceCommandResponse> {
    requireRole(authentication, ['manager']);
    return this.repository.activateSource({
      ...command,
      actorId: authentication.actorId,
      occurredAt: this.clock.nowUtc()
    });
  }

  public rollbackSource(
    command: ReviewCalendarCandidateRequest & {
      readonly preflightId: string;
    },
    authentication: AuthenticationContext
  ): Promise<CalendarSourceCommandResponse> {
    requireRole(authentication, ['manager']);
    return this.repository.rollbackSource({
      ...command,
      actorId: authentication.actorId,
      occurredAt: this.clock.nowUtc()
    });
  }

  public reviewCandidate(
    candidateId: string,
    action: 'accept' | 'reject',
    command: ReviewCalendarCandidateRequest,
    authentication: AuthenticationContext
  ): Promise<ReviewCalendarCandidateResponse> {
    const role = requireRole(authentication, ['manager', 'front_desk']);
    return this.repository.reviewCandidate({
      candidateId,
      action,
      ...command,
      actorId: authentication.actorId,
      actorRole: role,
      occurredAt: this.clock.nowUtc()
    });
  }

  public resolveCandidate(
    candidateId: string,
    command: ResolveCalendarCandidateRequest,
    authentication: AuthenticationContext
  ): Promise<ReviewCalendarCandidateResponse> {
    const role = requireRole(authentication, ['manager', 'front_desk']);
    return this.repository.reviewCandidate({
      candidateId,
      action:
        command.resolution === 'system' ? 'resolve_system' : 'resolve_google',
      expectedVersion: command.expectedVersion,
      idempotencyKey: command.idempotencyKey,
      actorId: authentication.actorId,
      actorRole: role,
      occurredAt: this.clock.nowUtc()
    });
  }

  public createSyntheticAppointment(
    command: CreateSyntheticAppointmentRequest,
    authentication: AuthenticationContext
  ): Promise<SyntheticAppointmentCommandResponse> {
    requireRole(authentication, ['manager', 'front_desk']);
    return this.repository.createSyntheticAppointment({
      ...command,
      actorId: authentication.actorId,
      occurredAt: this.clock.nowUtc()
    });
  }

  public rescheduleSyntheticAppointment(
    appointmentId: string,
    command: RescheduleSyntheticAppointmentRequest,
    authentication: AuthenticationContext
  ): Promise<SyntheticAppointmentCommandResponse> {
    requireRole(authentication, ['manager', 'front_desk']);
    return this.repository.rescheduleSyntheticAppointment(appointmentId, {
      ...command,
      actorId: authentication.actorId,
      occurredAt: this.clock.nowUtc()
    });
  }

  public cancelSyntheticAppointment(
    appointmentId: string,
    command: CancelSyntheticAppointmentRequest,
    authentication: AuthenticationContext
  ): Promise<SyntheticAppointmentCommandResponse> {
    requireRole(authentication, ['manager', 'front_desk']);
    return this.repository.cancelSyntheticAppointment(appointmentId, {
      ...command,
      actorId: authentication.actorId,
      occurredAt: this.clock.nowUtc()
    });
  }
}
