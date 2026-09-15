import { randomUUID } from 'node:crypto';

import type { CalendarChangeCandidate } from '@beauessence/contracts';
import {
  parseSlotSnapshot,
  type BookingKind,
  type CalendarReviewRole,
  type SlotSnapshot
} from '@beauessence/domain';
import type { Firestore } from 'firebase-admin/firestore';

import type {
  ClinicCalendarCandidateRecord,
  ClinicCalendarCandidateStore,
  ClinicSlotLookup
} from '../calendar/clinic-calendar-review.application-service.js';
import { COLLECTIONS } from './booking.repository.js';
import { ConflictError } from '../platform/errors/api-error.js';

const CANDIDATES = 'calendar_pilot_candidates';
const AUDITS = 'calendar_pilot_audit_events';
const OUTBOX = 'calendar_pilot_outbox';

export class FirestoreClinicCalendarCandidateStore implements ClinicCalendarCandidateStore {
  public constructor(private readonly db: Firestore) {}

  public async read(
    candidateId: string
  ): Promise<ClinicCalendarCandidateRecord | undefined> {
    const document = await this.db
      .collection(CANDIDATES)
      .doc(candidateId)
      .get();
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

  public async markReviewed(input: {
    readonly candidateId: string;
    readonly expectedVersion: number;
    readonly status: 'accepted' | 'rejected' | 'superseded' | 'conflict';
    readonly actorId: string;
    readonly actorRole: CalendarReviewRole;
    readonly occurredAt: string;
    readonly auditAction: string;
    readonly restoreCalendar: boolean;
  }): Promise<CalendarChangeCandidate> {
    return this.db.runTransaction(async (transaction) => {
      const reference = this.db.collection(CANDIDATES).doc(input.candidateId);
      const snapshot = await transaction.get(reference);
      const stored = snapshot.data() as
        ClinicCalendarCandidateRecord | undefined;
      if (
        stored === undefined ||
        stored.expectedVersion !== input.expectedVersion
      )
        throw new ConflictError();
      const next: CalendarChangeCandidate = {
        candidateId: stored.candidateId,
        kind: stored.kind,
        status: input.status,
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
      };
      transaction.update(reference, {
        status: next.status,
        expectedVersion: next.expectedVersion,
        reviewedBy: input.actorId,
        reviewedAt: input.occurredAt
      });
      transaction.create(this.db.collection(AUDITS).doc(randomUUID()), {
        action: input.auditAction,
        actorId: input.actorId,
        actorRole: input.actorRole,
        candidateId: input.candidateId,
        occurredAt: input.occurredAt
      });
      if (input.restoreCalendar && stored.localRecordId !== undefined) {
        transaction.set(
          this.db.collection(OUTBOX).doc(`${input.candidateId}_restore`),
          {
            kind: 'calendar_projection_restore',
            mirrorId: stored.localRecordId,
            status: 'pending',
            createdAt: input.occurredAt,
            attemptCount: 0
          }
        );
      }
      return next;
    });
  }
}

export class FirestoreClinicSlotLookup implements ClinicSlotLookup {
  public constructor(private readonly db: Firestore) {}

  public async find(
    startsAt: string,
    bookingKind: BookingKind
  ): Promise<SlotSnapshot | undefined> {
    const snapshot = await this.db
      .collection(COLLECTIONS.slots)
      .where('startsAt', '==', startsAt)
      .where('kind', '==', bookingKind)
      .limit(1)
      .get();
    if (snapshot.empty) return undefined;
    const document = snapshot.docs[0]!;
    try {
      return parseSlotSnapshot(document.id, document.data());
    } catch {
      return undefined;
    }
  }
}
