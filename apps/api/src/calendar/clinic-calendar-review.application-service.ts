import type {
  CalendarChangeCandidate,
  ReviewCalendarCandidateRequest,
  ReviewCalendarCandidateResponse
} from '@beauessence/contracts';
import {
  CALENDAR_INBOUND_AUDIT_ACTIONS,
  canReviewCalendarCandidate,
  planCalendarCandidateReview,
  type BookingKind,
  type CalendarReviewRole,
  type RescheduleRequest,
  type Role,
  type SlotSnapshot,
  type TransitionRequest
} from '@beauessence/domain';

import type { AuthenticationContext } from '../auth/authentication-context.js';
import type { AppointmentRecord } from '../appointments/appointment.repository-port.js';
import {
  toRescheduleRequest,
  toTransitionRequest
} from '../appointments/appointment.application-service.js';
import {
  AuthorizationDeniedError,
  ConflictError
} from '../platform/errors/api-error.js';

export interface ClinicCalendarCandidateRecord {
  readonly candidateId: string;
  readonly status: CalendarChangeCandidate['status'];
  readonly kind: CalendarChangeCandidate['kind'];
  readonly displayLabel: string;
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  readonly sourceVersion: number;
  readonly expectedVersion: number;
  readonly validationErrors: CalendarChangeCandidate['validationErrors'];
  readonly createdAt: string;
  readonly before: CalendarChangeCandidate['before'];
  readonly appointmentId?: string | null;
  readonly localRecordId?: string;
  readonly changedFields?: CalendarChangeCandidate['changedFields'];
}

export interface ClinicCalendarReviewCommand {
  readonly candidateId: string;
  readonly action: 'accept' | 'reject';
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
  readonly actorId: string;
  readonly actorRole: CalendarReviewRole;
  readonly occurredAt: string;
}

/**
 * Everything a review decision may read. The store serves these from the same
 * transaction that later commits the decision, so what the decision saw is what
 * it writes against. There is deliberately no write here.
 */
export interface ClinicCalendarReviewReads {
  readAppointment(
    appointmentId: string
  ): Promise<AppointmentRecord | undefined>;
  findSlot(
    startsAt: string,
    bookingKind: BookingKind
  ): Promise<SlotSnapshot | undefined>;
  /**
   * The stored result of an earlier request with the same actor and key, or
   * `undefined` for a first request. Throws `ConflictError` when the key was
   * already used for different content.
   */
  replay(): Promise<ReviewCalendarCandidateResponse | undefined>;
}

export type ClinicCalendarAppointmentChange =
  | { readonly command: 'reschedule'; readonly request: RescheduleRequest }
  | { readonly command: 'cancel'; readonly request: TransitionRequest };

export type ClinicCalendarReviewDecision =
  /** Not a clinic appointment candidate: write nothing, let CAL-PILOT answer. */
  | { readonly kind: 'defer' }
  | {
      readonly kind: 'replay';
      readonly response: ReviewCalendarCandidateResponse;
    }
  | {
      readonly kind: 'decide';
      readonly status: 'accepted' | 'rejected' | 'superseded' | 'conflict';
      readonly auditAction: string;
      readonly restoreCalendar: boolean;
      /** Applied in the same transaction as the candidate decision. */
      readonly change?: ClinicCalendarAppointmentChange;
    };

export type ClinicCalendarReviewDecider = (
  candidate: ClinicCalendarCandidateRecord,
  reads: ClinicCalendarReviewReads
) => Promise<ClinicCalendarReviewDecision>;

export interface ClinicCalendarCandidateStore {
  /**
   * Runs one review as a single store transaction: reads the candidate, lets
   * `decide` read what it needs, then commits the candidate decision together
   * with any appointment change, audit event, outbox job and idempotency
   * record, or none of them. Resolves `undefined` without writing when the
   * candidate is unknown or `decide` defers it.
   */
  review(
    command: ClinicCalendarReviewCommand,
    decide: ClinicCalendarReviewDecider
  ): Promise<ReviewCalendarCandidateResponse | undefined>;
}

function liveFrom(record: AppointmentRecord): {
  readonly appointmentId: string;
  readonly bookingKind: BookingKind;
  readonly status: AppointmentRecord['status'];
  readonly startsAt: string;
  readonly slotId: string;
  readonly version: number;
} {
  return {
    appointmentId: record.appointmentId,
    bookingKind: record.bookingKind,
    status: record.status,
    startsAt: record.startsAt ?? '',
    slotId: record.slotId,
    version: 1
  };
}

/**
 * Clinic appointment inbound review. Approvals go through the booking
 * repository (domain reschedule/cancel), never a raw startsAt write.
 *
 * The whole decision runs inside one store transaction (see
 * `ClinicCalendarCandidateStore.review`): a concurrent review or appointment
 * change either happens before it, and is seen, or after it, and is rejected.
 */
export class ClinicCalendarReviewApplicationService {
  public constructor(
    private readonly candidates: ClinicCalendarCandidateStore,
    private readonly nowUtc: () => string
  ) {}

  public async tryReview(input: {
    readonly candidateId: string;
    readonly action: 'accept' | 'reject';
    readonly command: ReviewCalendarCandidateRequest;
    readonly authentication: AuthenticationContext;
  }): Promise<ReviewCalendarCandidateResponse | undefined> {
    const role = input.authentication.actorRole as Role;
    if (!canReviewCalendarCandidate(role)) throw new AuthorizationDeniedError();
    const command: ClinicCalendarReviewCommand = {
      candidateId: input.candidateId,
      action: input.action,
      expectedVersion: input.command.expectedVersion,
      idempotencyKey: input.command.idempotencyKey,
      actorId: input.authentication.actorId,
      actorRole: role,
      occurredAt: this.nowUtc()
    };
    return this.candidates.review(command, (stored, reads) =>
      this.decide(command, input.authentication, stored, reads)
    );
  }

  private async decide(
    command: ClinicCalendarReviewCommand,
    authentication: AuthenticationContext,
    stored: ClinicCalendarCandidateRecord,
    reads: ClinicCalendarReviewReads
  ): Promise<ClinicCalendarReviewDecision> {
    const unmatched =
      stored.kind === 'unmatched' || stored.status === 'unmatched';
    const appointmentId = stored.appointmentId ?? stored.localRecordId;
    let linked:
      | {
          readonly appointmentId: string;
          readonly record: AppointmentRecord;
        }
      | undefined;
    const unlinkedUnmatched =
      unmatched && (appointmentId === undefined || appointmentId === null);
    if (!unlinkedUnmatched) {
      if (appointmentId === undefined || appointmentId === null)
        return { kind: 'defer' };
      const record = await reads.readAppointment(appointmentId);
      // Not a clinic booking: the CAL-PILOT repository owns this candidate,
      // including its idempotent replay, so nothing below may run here.
      if (record === undefined) return { kind: 'defer' };
      linked = { appointmentId, record };
    }

    // A retry carries the version the first request saw, which that request
    // has already advanced. Answer it from the stored result before any version
    // or state check, or the retry would be refused for the first request's own
    // effect. Different content under the same key is refused by `replay`.
    const replayed = await reads.replay();
    if (replayed !== undefined) return { kind: 'replay', response: replayed };
    if (stored.expectedVersion !== command.expectedVersion)
      throw new ConflictError();

    if (linked === undefined) {
      return {
        kind: 'decide',
        status: command.action === 'reject' ? 'rejected' : 'conflict',
        auditAction:
          command.action === 'reject'
            ? CALENDAR_INBOUND_AUDIT_ACTIONS.rejected
            : CALENDAR_INBOUND_AUDIT_ACTIONS.superseded,
        restoreCalendar: false
      };
    }
    const live = liveFrom(linked.record);
    const targetSlot =
      stored.startsAt === null
        ? undefined
        : await reads.findSlot(stored.startsAt, live.bookingKind);
    const plan = planCalendarCandidateReview({
      role: command.actorRole,
      action: command.action,
      candidate: {
        candidateId: stored.candidateId,
        status: stored.status === 'unmatched' ? 'unmatched' : stored.status,
        changeType:
          stored.kind === 'cancel_appointment'
            ? 'delete'
            : stored.kind === 'unmatched'
              ? 'unmatched'
              : 'reschedule',
        appointmentId: linked.appointmentId,
        expectedStartsAt: stored.before?.startsAt ?? live.startsAt,
        expectedStatus: live.status,
        ...(stored.startsAt === null
          ? {}
          : { proposedStartsAt: stored.startsAt }),
        changedFields: stored.changedFields ?? ['startsAt', 'endsAt'],
        expectedVersion: stored.expectedVersion
      },
      liveAppointment: live,
      ...(targetSlot === undefined ? {} : { targetSlot })
    });

    if (plan.outcome === 'denied') throw new AuthorizationDeniedError();
    if (plan.outcome === 'conflict') {
      return {
        kind: 'decide',
        status: plan.nextStatus,
        auditAction: plan.auditAction,
        restoreCalendar: false
      };
    }
    if (plan.outcome === 'noop') {
      return {
        kind: 'decide',
        status: plan.nextStatus,
        auditAction: CALENDAR_INBOUND_AUDIT_ACTIONS.rejected,
        restoreCalendar: plan.restoreCalendar
      };
    }

    const audit = {
      actorId: authentication.actorId,
      actorRole: authentication.actorRole,
      correlationId: `calendar_review_${stored.candidateId}`,
      source: 'api' as const,
      reasonCode: null,
      policyVersion: null
    };
    const change: ClinicCalendarAppointmentChange =
      plan.command === 'reschedule'
        ? {
            command: 'reschedule',
            request: toRescheduleRequest(
              linked.appointmentId,
              {
                idempotencyKey: command.idempotencyKey,
                targetSlotId: plan.targetSlotId
              },
              { requestedAt: command.occurredAt, audit }
            )
          }
        : {
            command: 'cancel',
            request: toTransitionRequest(
              linked.appointmentId,
              { idempotencyKey: command.idempotencyKey },
              'cancel',
              { requestedAt: command.occurredAt, audit }
            )
          };
    return {
      kind: 'decide',
      status: plan.nextStatus,
      auditAction: CALENDAR_INBOUND_AUDIT_ACTIONS.approved,
      restoreCalendar: false,
      change
    };
  }
}
