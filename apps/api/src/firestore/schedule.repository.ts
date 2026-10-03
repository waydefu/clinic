import {
  DomainError,
  parseAppointmentSnapshot,
  parsePublishedScheduleSnapshot,
  parseSlotSnapshot,
  planSchedulePublication,
  resolveIdempotencyReplay,
  UNPUBLISHED_SCHEDULE,
  type PublishedScheduleSnapshot,
  type SchedulePublicationRequest,
  type ScheduledAppointmentSnapshot,
  type SlotSnapshot
} from '@beauessence/domain';
import {
  AuditEventV2Schema,
  IdempotencyRecordV1Schema
} from '@beauessence/contracts';
import type { DocumentSnapshot, Firestore } from 'firebase-admin/firestore';

import type {
  PublishedScheduleResult,
  ScheduleRepositoryPort
} from '../schedule/schedule.repository-port.js';
import { COLLECTIONS } from './booking.repository.js';

export const SCHEDULE_DOCUMENT_ID = 'current';

const OPEN_APPOINTMENT_STATUSES = ['confirmed', 'cancellation_requested'];

/**
 * Persists the clinic published grid. Slot occupancy stays on sparse `slots`
 * documents; publication does not rewrite the whole horizon in one
 * transaction (Firestore's 500-write cap).
 */
export class FirestoreScheduleRepository implements ScheduleRepositoryPort {
  public constructor(private readonly db: Firestore) {}

  public async readPublished(): Promise<PublishedScheduleSnapshot> {
    const snapshot = await this.scheduleRef().get();
    if (!snapshot.exists) return UNPUBLISHED_SCHEDULE;
    return parsePublishedScheduleSnapshot(snapshot.data());
  }

  public async listOccupiedSlots(): Promise<readonly SlotSnapshot[]> {
    const documents = await this.db.collection(COLLECTIONS.slots).get();
    return documents.docs.map((document) =>
      parseSlotSnapshot(document.id, document.data())
    );
  }

  public async publish(
    request: SchedulePublicationRequest
  ): Promise<PublishedScheduleResult> {
    const idempotencyRef = this.db
      .collection(COLLECTIONS.idempotencyKeys)
      .doc(request.idempotency.recordId);
    const scheduleRef = this.scheduleRef();

    return this.db.runTransaction(async (transaction) => {
      const idempotencyDocument = await transaction.get(idempotencyRef);
      if (idempotencyDocument.exists) {
        return this.replayOf(idempotencyDocument, request);
      }

      const scheduleDocument = await transaction.get(scheduleRef);
      const current = scheduleDocument.exists
        ? parsePublishedScheduleSnapshot(scheduleDocument.data())
        : UNPUBLISHED_SCHEDULE;

      // Both reads are queries made inside this transaction. Listing the open
      // appointments and the slot rows before it started left them out of what
      // the commit is checked against: a booking created in between wrote a new
      // appointment and slot row that this transaction never read, so the
      // publication committed over it and orphaned the booking (AUD-02).
      const openAppointmentDocuments = await transaction.get(
        this.db
          .collection(COLLECTIONS.appointments)
          .where('status', 'in', OPEN_APPOINTMENT_STATUSES)
      );
      const appointments: ScheduledAppointmentSnapshot[] =
        openAppointmentDocuments.docs.map((document) => {
          const parsed = parseAppointmentSnapshot(document.id, document.data());
          return {
            id: parsed.id,
            slotId: parsed.slotId,
            status: parsed.status
          };
        });

      const slotDocuments = await transaction.get(
        this.db.collection(COLLECTIONS.slots)
      );
      const existingSlots: SlotSnapshot[] = slotDocuments.docs.map((document) =>
        parseSlotSnapshot(document.id, document.data())
      );

      const plan = planSchedulePublication(
        request,
        {
          publishedVersion: current.publishedVersion,
          publishedAt: current.publishedAt
        },
        existingSlots,
        appointments
      );

      transaction.set(scheduleRef, {
        schemaVersion: 1,
        publishedVersion: plan.publishedVersion,
        publishedAt: plan.publishedAt,
        schedule: plan.schedule
      });
      transaction.create(
        this.db
          .collection(COLLECTIONS.auditEvents)
          .doc(plan.auditEvent.eventId),
        plan.auditEvent
      );
      transaction.create(idempotencyRef, plan.idempotencyRecord);

      return {
        publishedVersion: plan.publishedVersion,
        publishedAt: plan.publishedAt,
        slotCount: plan.slots.length,
        replayed: false
      };
    });
  }

  private scheduleRef() {
    return this.db.collection(COLLECTIONS.schedules).doc(SCHEDULE_DOCUMENT_ID);
  }

  private async replayOf(
    snapshot: DocumentSnapshot,
    request: SchedulePublicationRequest
  ): Promise<PublishedScheduleResult> {
    const record = IdempotencyRecordV1Schema.parse(snapshot.data());
    const resourceId = resolveIdempotencyReplay(record, request.idempotency);
    const match = /^schedule_v(\d+)$/.exec(resourceId);
    const publishedVersion = Number(match?.[1]);
    if (!Number.isInteger(publishedVersion) || publishedVersion < 1) {
      throw new DomainError(
        'INVALID_VALUE',
        'The schedule idempotency replay is unreadable.'
      );
    }
    const audit = await this.db
      .collection(COLLECTIONS.auditEvents)
      .doc(`audit_schedule_v${publishedVersion}`)
      .get();
    const event = AuditEventV2Schema.parse(audit.data());
    const slotCount =
      event.after !== null &&
      'slotCount' in event.after &&
      typeof event.after.slotCount === 'number'
        ? event.after.slotCount
        : 0;
    return {
      publishedVersion,
      publishedAt: record.recordedAt,
      slotCount,
      replayed: true
    };
  }
}
