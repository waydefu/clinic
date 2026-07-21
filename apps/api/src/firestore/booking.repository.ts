import {
  ACTIVE_BOOKING_STATUSES,
  planBooking,
  type BookingRequest,
  type SlotSnapshot
} from '@beauessence/domain';
import type { Firestore } from 'firebase-admin/firestore';

export interface ReservationResult {
  readonly appointmentId: string;
  /** True when the request replayed an idempotency key instead of writing. */
  readonly replayed: boolean;
}

export const COLLECTIONS = {
  slots: 'slots',
  appointments: 'appointments',
  auditEvents: 'audit_events',
  outboxJobs: 'outbox_jobs',
  idempotencyKeys: 'idempotency_keys'
} as const;

/**
 * Applies a booking plan inside one Firestore transaction.
 *
 * The repository holds no rules. It reads, asks `planBooking` what to write,
 * and writes exactly that. Firestore retries a transaction whose reads changed
 * underneath it, which is what makes the slot check safe under concurrency:
 * the losing request re-reads a now-reserved slot and the planner rejects it.
 *
 * Every read happens before every write, as the transaction API requires, and
 * no external service is called from inside it (ADR-0002).
 */
export class FirestoreBookingRepository {
  public constructor(private readonly db: Firestore) {}

  public async reserve(request: BookingRequest): Promise<ReservationResult> {
    const idempotencyRef = this.db
      .collection(COLLECTIONS.idempotencyKeys)
      .doc(request.idempotencyKey);
    const slotRef = this.db.collection(COLLECTIONS.slots).doc(request.slotId);
    const activeBookingsQuery = this.db
      .collection(COLLECTIONS.appointments)
      .where('patientId', '==', request.patientId)
      .where('status', 'in', [...ACTIVE_BOOKING_STATUSES]);

    return this.db.runTransaction(async (transaction) => {
      // --- reads -------------------------------------------------------
      const replay = await transaction.get(idempotencyRef);
      if (replay.exists) {
        return {
          appointmentId: replay.data()?.['appointmentId'] as string,
          replayed: true
        };
      }

      const slotDocument = await transaction.get(slotRef);
      const activeBookings = await transaction.get(activeBookingsQuery);

      const slot = slotDocument.exists
        ? ({
            id: slotDocument.id,
            ...slotDocument.data()
          } as SlotSnapshot)
        : undefined;

      // --- decision (pure) ---------------------------------------------
      const plan = planBooking(request, slot, activeBookings.size);

      // --- writes -------------------------------------------------------
      transaction.set(
        this.db.collection(COLLECTIONS.appointments).doc(plan.appointment.id),
        plan.appointment
      );
      transaction.update(slotRef, {
        reservationId: plan.slotReservation.reservationId
      });
      transaction.set(
        this.db.collection(COLLECTIONS.auditEvents).doc(plan.auditEvent.id),
        plan.auditEvent
      );
      transaction.set(
        this.db.collection(COLLECTIONS.outboxJobs).doc(plan.outboxJob.id),
        plan.outboxJob
      );
      transaction.create(idempotencyRef, plan.idempotencyRecord);

      return { appointmentId: plan.appointment.id, replayed: false };
    });
  }
}
