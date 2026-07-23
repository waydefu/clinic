import {
  planBooking,
  planReschedule,
  planTransition,
  type AppointmentSnapshot,
  type BookingRequest,
  type PatientBookingGuardSnapshot,
  type PlannedPatientBookingGuardMutation,
  type RescheduleRequest,
  type SlotSnapshot,
  type TransitionRequest
} from '@beauessence/domain';
import type {
  DocumentSnapshot,
  Firestore,
  Transaction
} from 'firebase-admin/firestore';

import type {
  AppointmentRepositoryPort,
  ReservationResult
} from '../appointments/appointment.repository-port.js';

export const COLLECTIONS = {
  slots: 'slots',
  appointments: 'appointments',
  patientBookingGuards: 'patient_booking_guards',
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
export class FirestoreBookingRepository implements AppointmentRepositoryPort {
  public constructor(private readonly db: Firestore) {}

  public async reserve(request: BookingRequest): Promise<ReservationResult> {
    const idempotencyRef = this.db
      .collection(COLLECTIONS.idempotencyKeys)
      .doc(request.idempotencyKey);
    const slotRef = this.db.collection(COLLECTIONS.slots).doc(request.slotId);
    const patientGuardRef = this.db
      .collection(COLLECTIONS.patientBookingGuards)
      .doc(request.patientId);

    return this.db.runTransaction(async (transaction) => {
      // --- reads -------------------------------------------------------
      const replay = await transaction.get(idempotencyRef);
      if (replay.exists) {
        return {
          appointmentId: replay.data()?.['appointmentId'] as string,
          replayed: true
        };
      }

      const patientGuardDocument = await transaction.get(patientGuardRef);
      const slotDocument = await transaction.get(slotRef);

      const slot = slotDocument.exists
        ? ({
            id: slotDocument.id,
            ...slotDocument.data()
          } as SlotSnapshot)
        : undefined;
      const patientBookingGuard = patientGuardDocument.exists
        ? (patientGuardDocument.data() as PatientBookingGuardSnapshot)
        : undefined;

      // --- decision (pure) ---------------------------------------------
      const plan = planBooking(request, slot, patientBookingGuard);

      // --- writes -------------------------------------------------------
      transaction.set(
        this.db.collection(COLLECTIONS.appointments).doc(plan.appointment.id),
        plan.appointment
      );
      transaction.update(slotRef, {
        reservationId: plan.slotReservation.reservationId
      });
      transaction.create(patientGuardRef, plan.patientBookingGuard);
      transaction.create(
        this.db
          .collection(COLLECTIONS.auditEvents)
          .doc(plan.auditEvent.eventId),
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

  /** 冪等重放的共用判斷：已記錄過同一把鑰匙就不再寫入。 */
  private replayOf(snapshot: DocumentSnapshot): ReservationResult | undefined {
    if (!snapshot.exists) return undefined;
    return {
      appointmentId: snapshot.data()?.['appointmentId'] as string,
      replayed: true
    };
  }

  private snapshotOf(
    document: DocumentSnapshot
  ): AppointmentSnapshot | undefined {
    if (!document.exists) return undefined;
    return { id: document.id, ...document.data() } as AppointmentSnapshot;
  }

  private patientGuardSnapshotOf(
    document: DocumentSnapshot | undefined
  ): PatientBookingGuardSnapshot | undefined {
    if (document === undefined || !document.exists) return undefined;
    return document.data() as PatientBookingGuardSnapshot;
  }

  /**
   * 釋出時段時必須確認它仍指向這筆預約。若時段已被改期或其他流程接手，
   * 貿然清掉 reservationId 會把別人的預約踢掉。
   */
  private releaseSlot(
    transaction: Transaction,
    slotDocument: DocumentSnapshot,
    appointmentId: string
  ): void {
    if (!slotDocument.exists) return;
    if (slotDocument.data()?.['reservationId'] !== appointmentId) return;
    transaction.update(slotDocument.ref, { reservationId: null });
  }

  /**
   * A terminal transition may release only the guard that still names this
   * appointment. It must never delete a newer appointment's lock.
   */
  private applyPatientGuardMutation(
    transaction: Transaction,
    guardDocument: DocumentSnapshot | undefined,
    mutation: PlannedPatientBookingGuardMutation
  ): void {
    if (guardDocument === undefined) return;

    if (mutation.action === 'release') {
      if (
        guardDocument.exists &&
        guardDocument.data()?.['activeAppointmentId'] ===
          mutation.activeAppointmentId
      ) {
        transaction.delete(guardDocument.ref);
      }
      return;
    }

    transaction.update(guardDocument.ref, mutation.guard);
  }

  /** 取消、提出取消、到診與未到；規則由 planTransition 決定。 */
  public async transition(
    request: TransitionRequest
  ): Promise<ReservationResult> {
    const idempotencyRef = this.db
      .collection(COLLECTIONS.idempotencyKeys)
      .doc(request.idempotencyKey);
    const appointmentRef = this.db
      .collection(COLLECTIONS.appointments)
      .doc(request.appointmentId);

    return this.db.runTransaction(async (transaction) => {
      // --- reads -------------------------------------------------------
      const replay = this.replayOf(await transaction.get(idempotencyRef));
      if (replay !== undefined) return replay;

      const appointmentDocument = await transaction.get(appointmentRef);
      const appointment = this.snapshotOf(appointmentDocument);
      const patientGuardDocument =
        appointment === undefined
          ? undefined
          : await transaction.get(
              this.db
                .collection(COLLECTIONS.patientBookingGuards)
                .doc(appointment.patientId)
            );

      // 時段必須在任何寫入之前讀取，即使這次轉換不會釋出它。
      const slotDocument =
        appointment === undefined
          ? undefined
          : await transaction.get(
              this.db.collection(COLLECTIONS.slots).doc(appointment.slotId)
            );

      // --- decision (pure) ---------------------------------------------
      const plan = planTransition(
        request,
        appointment,
        this.patientGuardSnapshotOf(patientGuardDocument)
      );

      // --- writes -------------------------------------------------------
      transaction.update(appointmentRef, {
        status: plan.nextStatus,
        updatedAt: plan.updatedAt,
        ...(plan.completedAt === undefined
          ? {}
          : { completedAt: plan.completedAt })
      });
      if (plan.releaseSlotId !== undefined && slotDocument !== undefined) {
        this.releaseSlot(transaction, slotDocument, plan.appointmentId);
      }
      this.applyPatientGuardMutation(
        transaction,
        patientGuardDocument,
        plan.patientBookingGuard
      );
      transaction.create(
        this.db
          .collection(COLLECTIONS.auditEvents)
          .doc(plan.auditEvent.eventId),
        plan.auditEvent
      );
      transaction.set(
        this.db.collection(COLLECTIONS.outboxJobs).doc(plan.outboxJob.id),
        plan.outboxJob
      );
      transaction.create(idempotencyRef, plan.idempotencyRecord);

      return { appointmentId: plan.appointmentId, replayed: false };
    });
  }

  /** 改期：在同一筆交易內釋出原時段並占用新時段。 */
  public async reschedule(
    request: RescheduleRequest
  ): Promise<ReservationResult> {
    const idempotencyRef = this.db
      .collection(COLLECTIONS.idempotencyKeys)
      .doc(request.idempotencyKey);
    const appointmentRef = this.db
      .collection(COLLECTIONS.appointments)
      .doc(request.appointmentId);
    const targetRef = this.db
      .collection(COLLECTIONS.slots)
      .doc(request.targetSlotId);

    return this.db.runTransaction(async (transaction) => {
      // --- reads -------------------------------------------------------
      const replay = this.replayOf(await transaction.get(idempotencyRef));
      if (replay !== undefined) return replay;

      const appointmentDocument = await transaction.get(appointmentRef);
      const appointment = this.snapshotOf(appointmentDocument);
      const targetDocument = await transaction.get(targetRef);
      const previousDocument =
        appointment === undefined
          ? undefined
          : await transaction.get(
              this.db.collection(COLLECTIONS.slots).doc(appointment.slotId)
            );
      const patientGuardDocument =
        appointment === undefined
          ? undefined
          : await transaction.get(
              this.db
                .collection(COLLECTIONS.patientBookingGuards)
                .doc(appointment.patientId)
            );

      const targetSlot = targetDocument.exists
        ? ({ id: targetDocument.id, ...targetDocument.data() } as SlotSnapshot)
        : undefined;

      // --- decision (pure) ---------------------------------------------
      const plan = planReschedule(
        request,
        appointment,
        targetSlot,
        this.patientGuardSnapshotOf(patientGuardDocument)
      );

      // --- writes -------------------------------------------------------
      if (previousDocument !== undefined) {
        this.releaseSlot(transaction, previousDocument, plan.appointmentId);
      }
      transaction.update(targetRef, { reservationId: plan.appointmentId });
      transaction.update(appointmentRef, {
        slotId: plan.reserveSlotId,
        startsAt: plan.startsAt,
        status: plan.nextStatus,
        updatedAt: plan.updatedAt
      });
      this.applyPatientGuardMutation(
        transaction,
        patientGuardDocument,
        plan.patientBookingGuard
      );
      transaction.create(
        this.db
          .collection(COLLECTIONS.auditEvents)
          .doc(plan.auditEvent.eventId),
        plan.auditEvent
      );
      transaction.set(
        this.db.collection(COLLECTIONS.outboxJobs).doc(plan.outboxJob.id),
        plan.outboxJob
      );
      transaction.create(idempotencyRef, plan.idempotencyRecord);

      return { appointmentId: plan.appointmentId, replayed: false };
    });
  }
}
