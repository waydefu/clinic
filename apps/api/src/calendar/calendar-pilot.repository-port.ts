import type {
  CalendarAvailabilityResponse,
  CalendarChangeCandidate,
  CalendarEventProjection,
  CalendarSourceCommandResponse,
  CalendarSourcePreflightResponse,
  CalendarSourceSummary,
  CalendarSyncStatus,
  CorrectCalendarCandidateRequest,
  CreateSyntheticAppointmentRequest,
  RescheduleSyntheticAppointmentRequest,
  SyntheticAppointmentCommandResponse
} from '@beauessence/contracts';

export interface CalendarCandidateReviewCommand {
  readonly candidateId: string;
  readonly action: 'accept' | 'reject' | 'resolve_system' | 'resolve_google';
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
  readonly actorId: string;
  readonly actorRole: 'manager' | 'front_desk';
  readonly occurredAt: string;
}

export type CalendarCandidateCorrectionCommand =
  CorrectCalendarCandidateRequest & {
    readonly candidateId: string;
    readonly actorId: string;
    readonly actorRole: 'manager' | 'front_desk';
    readonly occurredAt: string;
  };

export interface CalendarSourceCommand {
  readonly sourceId: string;
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
  readonly actorId: string;
  readonly occurredAt: string;
}

export interface CalendarPilotRepositoryPort {
  getStatus(now: string): Promise<CalendarSyncStatus>;
  listSources(): Promise<readonly CalendarSourceSummary[]>;
  listCandidates(): Promise<readonly CalendarChangeCandidate[]>;
  getAvailability(now: string): Promise<CalendarAvailabilityResponse>;
  listSyntheticAppointments(): Promise<
    readonly import('@beauessence/contracts').SyntheticAppointment[]
  >;
  listSyntheticPatients(): Promise<
    readonly import('@beauessence/contracts').SyntheticPatientSummary[]
  >;
  getSourcePreflight(
    preflightId: string
  ): Promise<CalendarSourcePreflightResponse>;
  requestSourcePreflight(
    command: CalendarSourceCommand
  ): Promise<CalendarSourcePreflightResponse>;
  activateSource(
    command: CalendarSourceCommand & { readonly preflightId: string }
  ): Promise<CalendarSourceCommandResponse>;
  rollbackSource(
    command: Omit<CalendarSourceCommand, 'sourceId'> & {
      readonly preflightId: string;
    }
  ): Promise<CalendarSourceCommandResponse>;
  reviewCandidate(command: CalendarCandidateReviewCommand): Promise<{
    readonly candidate: CalendarChangeCandidate;
    readonly projection: CalendarEventProjection | null;
  }>;
  correctCandidate(command: CalendarCandidateCorrectionCommand): Promise<{
    readonly candidate: CalendarChangeCandidate;
    readonly projection: CalendarEventProjection | null;
  }>;
  createSyntheticAppointment(
    command: CreateSyntheticAppointmentRequest & {
      readonly actorId: string;
      readonly occurredAt: string;
    }
  ): Promise<SyntheticAppointmentCommandResponse>;
  rescheduleSyntheticAppointment(
    appointmentId: string,
    command: RescheduleSyntheticAppointmentRequest & {
      readonly actorId: string;
      readonly occurredAt: string;
    }
  ): Promise<SyntheticAppointmentCommandResponse>;
  cancelSyntheticAppointment(
    appointmentId: string,
    command: {
      readonly idempotencyKey: string;
      readonly expectedVersion: number;
      readonly actorId: string;
      readonly occurredAt: string;
    }
  ): Promise<SyntheticAppointmentCommandResponse>;
}
