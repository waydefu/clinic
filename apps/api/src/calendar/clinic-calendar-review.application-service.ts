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
  type Role,
  type SlotSnapshot
} from '@beauessence/domain';

import type { AuthenticationContext } from '../auth/authentication-context.js';
import type {
  AppointmentRecord,
  AppointmentRepositoryPort
} from '../appointments/appointment.repository-port.js';
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

export interface ClinicCalendarCandidateStore {
  read(candidateId: string): Promise<ClinicCalendarCandidateRecord | undefined>;
  markReviewed(input: {
    readonly candidateId: string;
    readonly expectedVersion: number;
    readonly status: 'accepted' | 'rejected' | 'superseded' | 'conflict';
    readonly actorId: string;
    readonly actorRole: CalendarReviewRole;
    readonly occurredAt: string;
    readonly auditAction: string;
    readonly restoreCalendar: boolean;
  }): Promise<CalendarChangeCandidate>;
}

export interface ClinicSlotLookup {
  find(
    startsAt: string,
    bookingKind: BookingKind
  ): Promise<SlotSnapshot | undefined>;
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
 */
export class ClinicCalendarReviewApplicationService {
  public constructor(
    private readonly appointments: AppointmentRepositoryPort,
    private readonly candidates: ClinicCalendarCandidateStore,
    private readonly slots: ClinicSlotLookup,
    private readonly nowUtc: () => string
  ) {}

  public async tryReview(input: {
    readonly candidateId: string;
    readonly action: 'accept' | 'reject';
    readonly command: ReviewCalendarCandidateRequest;
    readonly authentication: AuthenticationContext;
  }): Promise<ReviewCalendarCandidateResponse | undefined> {
    const stored = await this.candidates.read(input.candidateId);
    if (stored === undefined) return undefined;
    if (stored.expectedVersion !== input.command.expectedVersion)
      throw new ConflictError();

    const role = input.authentication.actorRole as Role;
    if (!canReviewCalendarCandidate(role)) throw new AuthorizationDeniedError();
    const unmatched =
      stored.kind === 'unmatched' || stored.status === 'unmatched';
    const appointmentId = stored.appointmentId ?? stored.localRecordId;
    if (unmatched && (appointmentId === undefined || appointmentId === null)) {
      const candidate = await this.candidates.markReviewed({
        candidateId: stored.candidateId,
        expectedVersion: input.command.expectedVersion,
        status: input.action === 'reject' ? 'rejected' : 'conflict',
        actorId: input.authentication.actorId,
        actorRole: role,
        occurredAt: this.nowUtc(),
        auditAction:
          input.action === 'reject'
            ? CALENDAR_INBOUND_AUDIT_ACTIONS.rejected
            : CALENDAR_INBOUND_AUDIT_ACTIONS.superseded,
        restoreCalendar: false
      });
      return { candidate, projection: null };
    }
    if (appointmentId === undefined || appointmentId === null) return undefined;
    const liveRecord = await this.appointments.read(appointmentId);
    if (liveRecord === undefined) return undefined;
    const live = liveFrom(liveRecord);
    const targetSlot =
      stored.startsAt === null
        ? undefined
        : await this.slots.find(stored.startsAt, live.bookingKind);
    const plan = planCalendarCandidateReview({
      role,
      action: input.action,
      candidate: {
        candidateId: stored.candidateId,
        status: stored.status === 'unmatched' ? 'unmatched' : stored.status,
        changeType:
          stored.kind === 'cancel_appointment'
            ? 'delete'
            : stored.kind === 'unmatched'
              ? 'unmatched'
              : 'reschedule',
        appointmentId,
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
      const candidate = await this.candidates.markReviewed({
        candidateId: stored.candidateId,
        expectedVersion: input.command.expectedVersion,
        status: plan.nextStatus,
        actorId: input.authentication.actorId,
        actorRole: role,
        occurredAt: this.nowUtc(),
        auditAction: plan.auditAction,
        restoreCalendar: false
      });
      return { candidate, projection: null };
    }

    if (plan.outcome === 'apply' && plan.mutateAppointment) {
      const occurredAt = this.nowUtc();
      const audit = {
        actorId: input.authentication.actorId,
        actorRole: input.authentication.actorRole,
        correlationId: `calendar_review_${stored.candidateId}`,
        source: 'api' as const,
        reasonCode: null,
        policyVersion: null
      };
      if (plan.command === 'reschedule') {
        await this.appointments.reschedule(
          toRescheduleRequest(
            appointmentId,
            {
              idempotencyKey: input.command.idempotencyKey,
              targetSlotId: plan.targetSlotId
            },
            {
              requestedAt: occurredAt,
              audit
            }
          )
        );
      } else {
        await this.appointments.transition(
          toTransitionRequest(
            appointmentId,
            { idempotencyKey: input.command.idempotencyKey },
            'cancel',
            { requestedAt: occurredAt, audit }
          )
        );
      }
    }

    const candidate = await this.candidates.markReviewed({
      candidateId: stored.candidateId,
      expectedVersion: input.command.expectedVersion,
      status: plan.nextStatus,
      actorId: input.authentication.actorId,
      actorRole: role,
      occurredAt: this.nowUtc(),
      auditAction:
        plan.outcome === 'noop'
          ? CALENDAR_INBOUND_AUDIT_ACTIONS.rejected
          : CALENDAR_INBOUND_AUDIT_ACTIONS.approved,
      restoreCalendar: plan.outcome === 'noop' ? plan.restoreCalendar : false
    });
    return { candidate, projection: null };
  }
}
