import { createHash, randomUUID } from 'node:crypto';

import type {
  CalendarChangeCandidate,
  ReviewCalendarCandidateResponse
} from '@beauessence/contracts';
import {
  calendarEventIdForAppointment,
  parseSlotSnapshot,
  type BookingKind,
  type SlotSnapshot
} from '@beauessence/domain';
import type {
  DocumentSnapshot,
  Firestore,
  Transaction
} from 'firebase-admin/firestore';

import type {
  ClinicCalendarCandidateRecord,
  ClinicCalendarCandidateStore,
  ClinicCalendarReviewCommand,
  ClinicCalendarReviewDecider
} from '../calendar/clinic-calendar-review.application-service.js';
import {
  COLLECTIONS,
  type FirestoreBookingRepository
} from './booking.repository.js';
import { parsePilotIdempotencyRecord } from './calendar-pilot.repository.js';
import { ConflictError } from '../platform/errors/api-error.js';

const CANDIDATES = 'calendar_pilot_candidates';
const AUDITS = 'calendar_pilot_audit_events';
const APPOINTMENT_OUTBOX = 'outbox_jobs';
// Shared with the CAL-PILOT review path on purpose: the key, the fingerprint
// and the stored response have the same shape there, so a retry is answered
// the same way whichever path recorded the first request.
const IDEMPOTENCY = 'calendar_pilot_idempotency';

export function clinicCalendarRestoreOutbox(input: {
  readonly candidateId: string;
  readonly appointmentId: string;
  readonly auditEventId: string;
  readonly occurredAt: string;
}) {
  return {
    id: `outbox_calendar_review_${input.candidateId}`,
    record: {
      type: 'calendar_projection_requested',
      appointmentId: input.appointmentId,
      correlationId: `calendar_review_${input.candidateId}`,
      causationId: input.auditEventId,
      idempotencyKey: calendarEventIdForAppointment(input.appointmentId),
      status: 'pending',
      attempts: 0,
      createdAt: input.occurredAt,
      nextAttemptAt: input.occurredAt
    }
  } as const;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, field]) => field !== undefined)
  ) as T;
}

function candidateOf(
  document: DocumentSnapshot
): ClinicCalendarCandidateRecord | undefined {
  if (!document.exists) return undefined;
  const data = document.data() ?? {};
  if (
    typeof data['candidateId'] !== 'string' ||
    typeof data['status'] !== 'string' ||
    typeof data['kind'] !== 'string'
  )
    return undefined;
  return data as ClinicCalendarCandidateRecord;
}

/**
 * One transaction per review. The candidate, the appointment it changes, the
 * target slot and the idempotency record are all read inside it, the decision
 * is made on those reads, and the candidate update, the appointment change,
 * the audit events, the outbox jobs and the idempotency record commit together
 * or not at all. Nothing external is called from inside it (ADR-0002): the
 * Calendar effect is an outbox job.
 */
export class FirestoreClinicCalendarCandidateStore implements ClinicCalendarCandidateStore {
  public constructor(
    private readonly db: Firestore,
    private readonly bookings: FirestoreBookingRepository
  ) {}

  public review(
    command: ClinicCalendarReviewCommand,
    decide: ClinicCalendarReviewDecider
  ): Promise<ReviewCalendarCandidateResponse | undefined> {
    const candidateRef = this.db
      .collection(CANDIDATES)
      .doc(command.candidateId);
    const idempotencyRef = this.db
      .collection(IDEMPOTENCY)
      .doc(sha256(`${command.actorId}:${command.idempotencyKey}`).slice(0, 40));
    const fingerprint = sha256(
      JSON.stringify({
        candidateId: command.candidateId,
        action: command.action,
        expectedVersion: command.expectedVersion
      })
    );

    return this.db.runTransaction(async (transaction) => {
      // --- reads -------------------------------------------------------
      const stored = candidateOf(await transaction.get(candidateRef));
      if (stored === undefined) return undefined;
      const decision = await decide(stored, {
        readAppointment: (appointmentId) =>
          this.bookings.readWithin(transaction, appointmentId),
        findSlot: (startsAt, bookingKind) =>
          this.findSlot(transaction, startsAt, bookingKind),
        replay: async () => {
          const document = await transaction.get(idempotencyRef);
          if (!document.exists) return undefined;
          const record =
            parsePilotIdempotencyRecord<ReviewCalendarCandidateResponse>(
              document.data()
            );
          if (record.fingerprint !== fingerprint) throw new ConflictError();
          return record.response;
        }
      });
      if (decision.kind === 'defer') return undefined;
      if (decision.kind === 'replay') return decision.response;

      // The appointment change reads what it needs and then writes. Every read
      // the decision made is already done, so it must run before the writes
      // below and after nothing that writes.
      if (decision.change?.command === 'reschedule')
        await this.bookings.reschedule(decision.change.request, transaction);
      else if (decision.change?.command === 'cancel')
        await this.bookings.transition(decision.change.request, transaction);

      // --- writes -------------------------------------------------------
      // Firestore refuses `undefined`, and this copy is stored for replays.
      const next: CalendarChangeCandidate = withoutUndefined({
        candidateId: stored.candidateId,
        kind: stored.kind,
        status: decision.status,
        displayLabel: stored.displayLabel,
        startsAt: stored.startsAt,
        endsAt: stored.endsAt,
        sourceVersion: stored.sourceVersion,
        expectedVersion: stored.expectedVersion + 1,
        validationErrors: stored.validationErrors,
        createdAt: stored.createdAt,
        before: stored.before,
        ...(stored.appointmentId === undefined
          ? {}
          : { appointmentId: stored.appointmentId }),
        ...(stored.changedFields === undefined
          ? {}
          : { changedFields: stored.changedFields })
      });
      transaction.update(candidateRef, {
        status: next.status,
        expectedVersion: next.expectedVersion,
        reviewedBy: command.actorId,
        reviewedAt: command.occurredAt
      });
      const auditEventId = randomUUID();
      transaction.create(this.db.collection(AUDITS).doc(auditEventId), {
        action: decision.auditAction,
        actorId: command.actorId,
        actorRole: command.actorRole,
        candidateId: command.candidateId,
        occurredAt: command.occurredAt
      });
      if (decision.restoreCalendar && stored.localRecordId !== undefined) {
        const restore = clinicCalendarRestoreOutbox({
          candidateId: command.candidateId,
          appointmentId: stored.localRecordId,
          auditEventId,
          occurredAt: command.occurredAt
        });
        transaction.set(
          this.db.collection(APPOINTMENT_OUTBOX).doc(restore.id),
          restore.record
        );
      }
      const response: ReviewCalendarCandidateResponse = {
        candidate: next,
        projection: null
      };
      transaction.create(idempotencyRef, { fingerprint, response });
      return response;
    });
  }

  private async findSlot(
    transaction: Transaction,
    startsAt: string,
    bookingKind: BookingKind
  ): Promise<SlotSnapshot | undefined> {
    const snapshot = await transaction.get(
      this.db
        .collection(COLLECTIONS.slots)
        .where('startsAt', '==', startsAt)
        .where('kind', '==', bookingKind)
        .limit(1)
    );
    if (snapshot.empty) return undefined;
    const document = snapshot.docs[0]!;
    try {
      return parseSlotSnapshot(document.id, document.data());
    } catch {
      return undefined;
    }
  }
}
