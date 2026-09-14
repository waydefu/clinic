import {
  assertIdempotencyContext,
  DomainError,
  parseAppointmentSnapshot,
  parsePatientBookingGuard,
  parsePublishedScheduleSnapshot,
  parseSlotSnapshot,
  planBooking,
  planFollowUpDecision,
  planReschedule,
  planTransition,
  resolveIdempotencyReplay,
  resolvePublishedSlot,
  type AppointmentSnapshot,
  type BookingRequest,
  type ExistingFollowUpSnapshot,
  type FollowUpDecisionRequest,
  type IdempotencyContext,
  type PatientBookingGuardSnapshot,
  type PlannedPatientBookingGuardMutation,
  type RescheduleRequest,
  type SlotSnapshot,
  type TransitionRequest
} from '@beauessence/domain';
import { IdempotencyRecordV1Schema } from '@beauessence/contracts';
import type {
  DocumentSnapshot,
  Firestore,
  Transaction
} from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';

import type {
  AppointmentRecord,
  AppointmentRepositoryPort,
  FollowUpResult,
  ReservationResult,
  TransitionResult
} from '../appointments/appointment.repository-port.js';

export const COLLECTIONS = {
  slots: 'slots',
  appointments: 'appointments',
  patientBookingGuards: 'patient_booking_guards',
  auditEvents: 'audit_events',
  outboxJobs: 'outbox_jobs',
  idempotencyKeys: 'idempotency_keys',
  schedules: 'schedules',
  followUps: 'follow_ups'
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

  public async patientIdOf(appointmentId: string): Promise<string | undefined> {
    const record = await this.read(appointmentId);
    return record?.patientId;
  }

  public async read(
    appointmentId: string
  ): Promise<AppointmentRecord | undefined> {
    const snapshot = await this.db
      .collection(COLLECTIONS.appointments)
      .doc(appointmentId)
      .get();
    if (!snapshot.exists) return undefined;
    const parsed = parseAppointmentSnapshot(snapshot.id, snapshot.data());
    return {
      appointmentId: parsed.id,
      patientId: parsed.patientId,
      slotId: parsed.slotId,
      bookingKind: parsed.bookingKind,
      status: parsed.status,
      ...(parsed.startsAt === undefined ? {} : { startsAt: parsed.startsAt })
    };
  }

  public async reserve(request: BookingRequest): Promise<ReservationResult> {
    assertIdempotencyContext(request.idempotency, request.audit.actorId);
    const idempotencyRef = this.db
      .collection(COLLECTIONS.idempotencyKeys)
      .doc(request.idempotency.recordId);
    const slotRef = this.db.collection(COLLECTIONS.slots).doc(request.slotId);
    const patientGuardRef = this.db
      .collection(COLLECTIONS.patientBookingGuards)
      .doc(request.patientId);
    const scheduleRef = this.db
      .collection(COLLECTIONS.schedules)
      .doc('current');

    return this.db.runTransaction(async (transaction) => {
      // --- reads -------------------------------------------------------
      const replay = await this.reservationFromReplay(
        transaction,
        await transaction.get(idempotencyRef),
        request.idempotency
      );
      if (replay !== undefined) return replay;

      const patientGuardDocument = await transaction.get(patientGuardRef);
      const slotDocument = await transaction.get(slotRef);
      const scheduleDocument = await transaction.get(scheduleRef);

      const existingSlot = slotDocument.exists
        ? parseSlotSnapshot(slotDocument.id, slotDocument.data())
        : undefined;
      const slot = this.slotForWrite(
        scheduleDocument,
        request.slotId,
        existingSlot,
        request.requestedAt
      );
      const patientBookingGuard =
        this.patientGuardSnapshotOf(patientGuardDocument);

      // --- decision (pure) ---------------------------------------------
      const plan = planBooking(request, slot, patientBookingGuard);

      // --- writes -------------------------------------------------------
      transaction.set(
        this.db.collection(COLLECTIONS.appointments).doc(plan.appointment.id),
        plan.appointment
      );
      this.writeSlotReservation(
        transaction,
        slotDocument,
        slot,
        plan.slotReservation.reservationId
      );
      if (patientGuardDocument.exists) {
        transaction.set(patientGuardRef, plan.patientBookingGuard);
      } else {
        transaction.create(patientGuardRef, plan.patientBookingGuard);
      }
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

      return {
        appointmentId: plan.appointment.id,
        replayed: false,
        startsAt: plan.appointment.startsAt
      };
    });
  }

  /** Exact matches replay; scoped-key reuse with other content is rejected. */
  private replayOf(
    snapshot: DocumentSnapshot,
    context: IdempotencyContext
  ): ReservationResult | undefined {
    if (!snapshot.exists) return undefined;
    const record = IdempotencyRecordV1Schema.parse(snapshot.data());
    return {
      appointmentId: resolveIdempotencyReplay(record, context),
      replayed: true
    };
  }

  private async reservationFromReplay(
    transaction: Transaction,
    snapshot: DocumentSnapshot,
    context: IdempotencyContext
  ): Promise<ReservationResult | undefined> {
    const replay = this.replayOf(snapshot, context);
    if (replay === undefined) return undefined;
    const appointment = this.snapshotOf(
      await transaction.get(
        this.db.collection(COLLECTIONS.appointments).doc(replay.appointmentId)
      )
    );
    return {
      ...replay,
      ...(appointment?.startsAt === undefined
        ? {}
        : { startsAt: appointment.startsAt })
    };
  }

  private snapshotOf(
    document: DocumentSnapshot
  ): AppointmentSnapshot | undefined {
    if (!document.exists) return undefined;
    return parseAppointmentSnapshot(document.id, document.data());
  }

  private patientGuardSnapshotOf(
    document: DocumentSnapshot | undefined
  ): PatientBookingGuardSnapshot | undefined {
    if (document === undefined || !document.exists) return undefined;
    return parsePatientBookingGuard(document.data());
  }

  /**
   * When a published grid exists, a missing slot document is materialised
   * from that grid. Emulator tests that seed slot rows without a schedule
   * keep the previous occupancy-only path.
   */
  private slotForWrite(
    scheduleDocument: DocumentSnapshot,
    slotId: string,
    existing: SlotSnapshot | undefined,
    requestedAt: string
  ): SlotSnapshot | undefined {
    if (!scheduleDocument.exists) return existing;
    const published = parsePublishedScheduleSnapshot(scheduleDocument.data());
    if (published.schedule === null) return existing;
    return resolvePublishedSlot(
      published.schedule,
      slotId,
      existing,
      requestedAt
    );
  }

  private writeSlotReservation(
    transaction: Transaction,
    slotDocument: DocumentSnapshot,
    slot: SlotSnapshot | undefined,
    reservationId: string
  ): void {
    if (slotDocument.exists) {
      transaction.update(slotDocument.ref, { reservationId });
      return;
    }
    if (slot === undefined) return;
    transaction.create(slotDocument.ref, {
      schemaVersion: 1,
      kind: slot.kind,
      startsAt: slot.startsAt,
      reservationId
    });
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
    transaction.update(slotDocument.ref, {
      reservationId: FieldValue.delete()
    });
  }

  /**
   * A terminal transition may release only the appointment named in this
   * mutation. It must never delete or overwrite a guard that no longer lists
   * that appointment — another unfinished booking may still hold the lock.
   */
  private applyPatientGuardMutation(
    transaction: Transaction,
    guardDocument: DocumentSnapshot | undefined,
    mutation: PlannedPatientBookingGuardMutation
  ): void {
    if (guardDocument === undefined || !guardDocument.exists) return;

    const current = parsePatientBookingGuard(guardDocument.data());

    if (mutation.action === 'release') {
      if (
        !current.activeAppointmentIds.includes(mutation.activeAppointmentId)
      ) {
        return;
      }
      if (mutation.remainingGuard === undefined) {
        transaction.delete(guardDocument.ref);
        return;
      }
      transaction.set(guardDocument.ref, mutation.remainingGuard);
      return;
    }

    transaction.set(guardDocument.ref, mutation.guard);
  }

  /** 取消、提出取消、到診與未到；規則由 planTransition 決定。 */
  public async transition(
    request: TransitionRequest
  ): Promise<TransitionResult> {
    assertIdempotencyContext(request.idempotency, request.audit.actorId);
    const idempotencyRef = this.db
      .collection(COLLECTIONS.idempotencyKeys)
      .doc(request.idempotency.recordId);
    const appointmentRef = this.db
      .collection(COLLECTIONS.appointments)
      .doc(request.appointmentId);

    return this.db.runTransaction(async (transaction) => {
      // --- reads -------------------------------------------------------
      const replay = this.replayOf(
        await transaction.get(idempotencyRef),
        request.idempotency
      );
      const appointmentDocument = await transaction.get(appointmentRef);
      const appointment = this.snapshotOf(appointmentDocument);
      if (replay !== undefined) {
        return {
          appointmentId: replay.appointmentId,
          replayed: true,
          status: appointment?.status ?? 'cancelled'
        };
      }
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

      return {
        appointmentId: plan.appointmentId,
        replayed: false,
        status: plan.nextStatus
      };
    });
  }

  /** 改期：同一筆交易內先占用新時段，再釋出原時段。 */
  public async reschedule(
    request: RescheduleRequest
  ): Promise<ReservationResult> {
    assertIdempotencyContext(request.idempotency, request.audit.actorId);
    const idempotencyRef = this.db
      .collection(COLLECTIONS.idempotencyKeys)
      .doc(request.idempotency.recordId);
    const appointmentRef = this.db
      .collection(COLLECTIONS.appointments)
      .doc(request.appointmentId);
    const targetRef = this.db
      .collection(COLLECTIONS.slots)
      .doc(request.targetSlotId);
    const scheduleRef = this.db
      .collection(COLLECTIONS.schedules)
      .doc('current');

    return this.db.runTransaction(async (transaction) => {
      // --- reads -------------------------------------------------------
      const replay = await this.reservationFromReplay(
        transaction,
        await transaction.get(idempotencyRef),
        request.idempotency
      );
      if (replay !== undefined) return replay;

      const appointmentDocument = await transaction.get(appointmentRef);
      const appointment = this.snapshotOf(appointmentDocument);
      const targetDocument = await transaction.get(targetRef);
      const scheduleDocument = await transaction.get(scheduleRef);
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

      const existingTarget = targetDocument.exists
        ? parseSlotSnapshot(targetDocument.id, targetDocument.data())
        : undefined;
      const targetSlot = this.slotForWrite(
        scheduleDocument,
        request.targetSlotId,
        existingTarget,
        request.requestedAt
      );

      // --- decision (pure) ---------------------------------------------
      const plan = planReschedule(
        request,
        appointment,
        targetSlot,
        this.patientGuardSnapshotOf(patientGuardDocument)
      );

      // --- writes -------------------------------------------------------
      // Reserve the new slot before releasing the old one. If the new slot
      // cannot be taken, the transaction aborts and the original booking is
      // unchanged. Releasing first would drop the old slot on a failed reserve.
      this.writeSlotReservation(
        transaction,
        targetDocument,
        targetSlot,
        plan.appointmentId
      );
      if (previousDocument !== undefined) {
        this.releaseSlot(transaction, previousDocument, plan.appointmentId);
      }
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

      return {
        appointmentId: plan.appointmentId,
        replayed: false,
        startsAt: plan.startsAt
      };
    });
  }

  public async recordFollowUp(
    request: FollowUpDecisionRequest
  ): Promise<FollowUpResult> {
    assertIdempotencyContext(request.idempotency, request.audit.actorId);
    const idempotencyRef = this.db
      .collection(COLLECTIONS.idempotencyKeys)
      .doc(request.idempotency.recordId);
    const appointmentRef = this.db
      .collection(COLLECTIONS.appointments)
      .doc(request.appointmentId);
    const followUpRef = this.db
      .collection(COLLECTIONS.followUps)
      .doc(request.appointmentId);
    const scheduleRef = this.db
      .collection(COLLECTIONS.schedules)
      .doc('current');

    return this.db.runTransaction(async (transaction) => {
      const replay = this.replayOf(
        await transaction.get(idempotencyRef),
        request.idempotency
      );
      const appointmentDocument = await transaction.get(appointmentRef);
      const followUpDocument = await transaction.get(followUpRef);
      if (replay !== undefined) {
        const stored = this.followUpSnapshotOf(followUpDocument);
        if (stored === undefined) {
          throw new DomainError(
            'INVALID_VALUE',
            'The follow-up decision is unreadable.'
          );
        }
        return {
          appointmentId: replay.appointmentId,
          replayed: true,
          decision: stored.decision,
          dueAt: stored.dueAt
        };
      }

      const scheduleDocument = await transaction.get(scheduleRef);
      if (!scheduleDocument.exists) {
        throw new DomainError(
          'INVALID_VALUE',
          'A published schedule is required to record follow-up.'
        );
      }
      const published = parsePublishedScheduleSnapshot(scheduleDocument.data());
      if (published.schedule === null) {
        throw new DomainError(
          'INVALID_VALUE',
          'A published schedule is required to record follow-up.'
        );
      }

      const appointment = this.snapshotOf(appointmentDocument);
      const plan = planFollowUpDecision(
        request,
        appointment === undefined
          ? undefined
          : {
              id: appointment.id,
              patientId: appointment.patientId,
              status: appointment.status
            },
        published.schedule,
        this.followUpSnapshotOf(followUpDocument)
      );

      transaction.set(followUpRef, {
        schemaVersion: 1,
        appointmentId: plan.appointmentId,
        patientId: plan.patientId,
        decision: plan.decision,
        dueAt: plan.dueAt,
        decidedAt: plan.decidedAt
      });
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

      return {
        appointmentId: plan.appointmentId,
        replayed: false,
        decision: plan.decision,
        dueAt: plan.dueAt
      };
    });
  }

  private followUpSnapshotOf(
    document: DocumentSnapshot
  ): ExistingFollowUpSnapshot | undefined {
    if (!document.exists) return undefined;
    const data: unknown = document.data();
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      throw new DomainError(
        'INVALID_VALUE',
        'The follow-up decision is unreadable.'
      );
    }
    const record = data as Record<string, unknown>;
    const decision = record['decision'];
    if (decision !== 'required' && decision !== 'not_required') {
      throw new DomainError(
        'INVALID_VALUE',
        'The follow-up decision is unreadable.'
      );
    }
    const dueAt = record['dueAt'];
    if (dueAt === undefined || dueAt === null) {
      return { decision, dueAt: null };
    }
    if (typeof dueAt !== 'string' || dueAt.length === 0) {
      throw new DomainError(
        'INVALID_VALUE',
        'The follow-up decision is unreadable.'
      );
    }
    return { decision, dueAt };
  }
}
