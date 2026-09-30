import { createHash } from 'node:crypto';

import {
  DomainError,
  planRetentionOperation,
  type ApprovedBusinessDeliveryPolicy,
  type RetentionOperation
} from '@beauessence/domain';
import type {
  PatientArchivedResponse,
  PatientLegalHoldResponse,
  PatientPermanentlyDeletedResponse,
  PatientRestoredResponse,
  PendingPatientDeletionResponse,
  RetentionReasonCode
} from '@beauessence/contracts';
import { NotFoundException } from '@nestjs/common';
import {
  FieldValue,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
  type Transaction
} from 'firebase-admin/firestore';

import { ConflictError } from '../platform/errors/api-error.js';
import { COLLECTIONS } from './booking.repository.js';
import {
  opaqueLookupIdentity,
  PATIENT_COLLECTIONS
} from '../patients/patient-directory.js';

export const RETENTION_COLLECTIONS = {
  log: 'bd_retention_log'
} as const;

const MAX_TRANSACTION_WRITES = 400;
const OPAQUE_REQUEST_PREFIX = 'retention_';

interface RetentionCommand {
  readonly idempotencyKey: string;
  readonly patientId: string;
  readonly actorRef: string;
  readonly now: string;
  readonly scope: 'internal_synthetic' | 'production';
  readonly policy: ApprovedBusinessDeliveryPolicy;
}

export type ArchivePatientCommand = RetentionCommand;
export type RestorePatientCommand = RetentionCommand;
export interface PermanentlyDeletePatientCommand extends RetentionCommand {
  readonly reasonCode: RetentionReasonCode;
}
export interface SetPatientLegalHoldCommand extends RetentionCommand {
  readonly hold: boolean;
  readonly reasonCode: RetentionReasonCode;
}

interface StoredRetentionLog {
  readonly schemaVersion: 1;
  readonly action: string;
  readonly patientId: string;
  readonly actorRef: string;
  readonly at: string;
  readonly requestHash: string;
  readonly result: unknown;
  readonly reasonCode?: RetentionReasonCode;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function stringField(
  data: Record<string, unknown> | undefined,
  key: string
): string | undefined {
  const value = data?.[key];
  return typeof value === 'string' ? value : undefined;
}

function hasArchivedAt(data: Record<string, unknown> | undefined): boolean {
  return data?.['archivedAt'] !== undefined && data['archivedAt'] !== null;
}

function logId(action: string, idempotencyKey: string): string {
  return `${action}_${sha256(idempotencyKey).slice(0, 40)}`;
}

function requestHash(payload: readonly unknown[]): string {
  return sha256(JSON.stringify(payload));
}

function replayResult<T>(
  snapshot: DocumentSnapshot,
  expectedRequestHash: string
): { readonly found: false } | { readonly found: true; readonly result: T } {
  if (!snapshot.exists) return { found: false };
  const stored = snapshot.data() as StoredRetentionLog;
  if (stored.requestHash !== expectedRequestHash) throw new ConflictError();
  return { found: true, result: stored.result as T };
}

function writeLog(
  transaction: Transaction,
  reference: DocumentReference,
  input: {
    readonly action: string;
    readonly patientId: string;
    readonly actorRef: string;
    readonly at: string;
    readonly requestHash: string;
    readonly result: unknown;
    readonly reasonCode?: RetentionReasonCode;
  }
): void {
  const record: StoredRetentionLog = {
    schemaVersion: 1,
    action: input.action,
    patientId: input.patientId,
    actorRef: input.actorRef,
    at: input.at,
    requestHash: input.requestHash,
    result: input.result,
    ...(input.reasonCode === undefined ? {} : { reasonCode: input.reasonCode })
  };
  transaction.create(reference, record);
}

function assertWriteLimit(writeCount: number): void {
  if (writeCount > MAX_TRANSACTION_WRITES) throw new ConflictError();
}

function planRetention(input: {
  readonly operation: RetentionOperation;
  readonly command: RetentionCommand;
  readonly requestId: string;
  readonly patient: Record<string, unknown>;
  readonly dependenciesReconciled?: boolean;
}): ReturnType<typeof planRetentionOperation> {
  const archivedAt = stringField(input.patient, 'archivedAt') ?? null;
  const recoverableUntil =
    stringField(input.patient, 'restorableUntil') ?? null;
  const requiresReauthentication =
    input.operation === 'archive' || input.operation === 'permanent_delete';
  try {
    return planRetentionOperation({
      operation: input.operation,
      resourceId: input.command.patientId,
      requestId: input.requestId,
      state: hasArchivedAt(input.patient) ? 'archived' : 'active',
      nowAt: input.command.now,
      archivedAt,
      recoverableUntil,
      legalHold: input.patient['legalHold'] === true,
      ...(input.dependenciesReconciled === undefined
        ? {}
        : { dependenciesReconciled: input.dependenciesReconciled }),
      policy: input.command.policy.retention,
      proof: {
        scopeId: input.command.scope,
        requestId: input.requestId,
        authorizationReference: input.command.actorRef,
        ...(requiresReauthentication
          ? { reauthenticationReference: input.command.actorRef }
          : {}),
        authorized: true,
        reauthenticated: requiresReauthentication
      }
    });
  } catch (error) {
    if (error instanceof DomainError) throw new ConflictError();
    throw error;
  }
}

function isActiveIdentity(data: Record<string, unknown> | undefined): boolean {
  return data !== undefined && !hasArchivedAt(data);
}

function validStoredIdentity(
  data: Record<string, unknown>
):
  { readonly phoneDigits: string; readonly birthMonthDay: string } | undefined {
  const phoneDigits = stringField(data, 'phoneDigits');
  const birthMonthDay = stringField(data, 'birthMonthDay');
  if (
    phoneDigits === undefined ||
    !/^\d{8,20}$/.test(phoneDigits) ||
    birthMonthDay === undefined ||
    !/^--\d{2}-\d{2}$/.test(birthMonthDay)
  ) {
    return undefined;
  }
  return { phoneDigits, birthMonthDay };
}

/**
 * CP-05 patient retention store. Each action and its non-PII idempotency/audit
 * record are committed in one transaction. Backup/PITR is deliberately left
 * to its independent retention and restore process.
 */
export class FirestoreBusinessRetentionRepository {
  public constructor(private readonly db: Firestore) {}

  public async archive(
    command: ArchivePatientCommand
  ): Promise<PatientArchivedResponse> {
    const action = 'archive';
    const hash = requestHash([action, command.patientId]);
    const requestId = `${OPAQUE_REQUEST_PREFIX}${sha256(`${action}:${command.idempotencyKey}`).slice(0, 40)}`;
    const logRef = this.db
      .collection(RETENTION_COLLECTIONS.log)
      .doc(logId(action, command.idempotencyKey));
    const patientRef = this.db
      .collection(PATIENT_COLLECTIONS.patients)
      .doc(command.patientId);
    const appointmentsQuery = this.db
      .collection(COLLECTIONS.appointments)
      .where('patientId', '==', command.patientId);

    return this.db.runTransaction(async (transaction) => {
      const existingLog = await transaction.get(logRef);
      const replay = replayResult<PatientArchivedResponse>(existingLog, hash);
      if (replay.found) return replay.result;

      const patientSnapshot = await transaction.get(patientRef);
      if (!patientSnapshot.exists) throw new NotFoundException();
      const patient = patientSnapshot.data() ?? {};
      if (hasArchivedAt(patient)) throw new ConflictError();
      const appointments = await transaction.get(appointmentsQuery);
      if (
        appointments.docs.some((appointment) => {
          const data = appointment.data();
          const startsAt = stringField(data, 'startsAt');
          const startsAtMs =
            startsAt === undefined ? NaN : Date.parse(startsAt);
          return (
            (data['status'] === 'confirmed' || data['status'] === 'arrived') &&
            Number.isFinite(startsAtMs) &&
            startsAtMs > Date.parse(command.now)
          );
        })
      ) {
        throw new ConflictError();
      }

      const plan = planRetention({
        operation: 'archive',
        command,
        requestId,
        patient
      });
      const response: PatientArchivedResponse = {
        patientId: command.patientId,
        state: 'archived',
        restorableUntil: plan.recoverableUntil!
      };
      assertWriteLimit(appointments.size + 2);

      transaction.update(patientRef, {
        archivedAt: plan.archivedAt,
        archivedByRef: command.actorRef,
        restorableUntil: plan.recoverableUntil,
        legalHold: patient['legalHold'] === true,
        updatedAt: command.now
      });
      for (const appointment of appointments.docs) {
        transaction.update(appointment.ref, { patientArchived: true });
      }
      writeLog(transaction, logRef, {
        action,
        patientId: command.patientId,
        actorRef: command.actorRef,
        at: command.now,
        requestHash: hash,
        result: response
      });
      return response;
    });
  }

  public async restore(
    command: RestorePatientCommand
  ): Promise<PatientRestoredResponse> {
    const action = 'restore';
    const hash = requestHash([action, command.patientId]);
    const requestId = `${OPAQUE_REQUEST_PREFIX}${sha256(`${action}:${command.idempotencyKey}`).slice(0, 40)}`;
    const logRef = this.db
      .collection(RETENTION_COLLECTIONS.log)
      .doc(logId(action, command.idempotencyKey));
    const patientRef = this.db
      .collection(PATIENT_COLLECTIONS.patients)
      .doc(command.patientId);
    const appointmentsQuery = this.db
      .collection(COLLECTIONS.appointments)
      .where('patientId', '==', command.patientId);

    return this.db.runTransaction(async (transaction) => {
      const existingLog = await transaction.get(logRef);
      const replay = replayResult<PatientRestoredResponse>(existingLog, hash);
      if (replay.found) return replay.result;

      const patientSnapshot = await transaction.get(patientRef);
      if (!patientSnapshot.exists) throw new NotFoundException();
      const patient = patientSnapshot.data() ?? {};
      planRetention({
        operation: 'restore',
        command,
        requestId,
        patient
      });

      const identity = validStoredIdentity(patient);
      if (identity !== undefined) {
        const lookupRef = this.db
          .collection(PATIENT_COLLECTIONS.lookupIndex)
          .doc(
            opaqueLookupIdentity(identity.phoneDigits, identity.birthMonthDay)
          );
        const lookup = await transaction.get(lookupRef);
        const candidateIds = [
          ...new Set(
            Array.isArray(lookup.data()?.['patientIds'])
              ? (lookup.data()?.['patientIds'] as unknown[]).filter(
                  (id): id is string => typeof id === 'string' && id !== ''
                )
              : []
          )
        ];
        const candidates =
          candidateIds.length === 0
            ? []
            : await transaction.getAll(
                ...candidateIds.map((id) =>
                  this.db.collection(PATIENT_COLLECTIONS.patients).doc(id)
                )
              );
        if (
          candidates.some(
            (candidate) =>
              candidate.id !== command.patientId &&
              candidate.exists &&
              isActiveIdentity(candidate.data())
          )
        ) {
          throw new ConflictError();
        }
      }

      const appointments = await transaction.get(appointmentsQuery);
      const response: PatientRestoredResponse = {
        patientId: command.patientId,
        state: 'active'
      };
      assertWriteLimit(appointments.size + 2);

      transaction.update(patientRef, {
        archivedAt: FieldValue.delete(),
        archivedByRef: FieldValue.delete(),
        restorableUntil: FieldValue.delete(),
        updatedAt: command.now
      });
      for (const appointment of appointments.docs) {
        transaction.update(appointment.ref, {
          patientArchived: FieldValue.delete()
        });
      }
      writeLog(transaction, logRef, {
        action,
        patientId: command.patientId,
        actorRef: command.actorRef,
        at: command.now,
        requestHash: hash,
        result: response
      });
      return response;
    });
  }

  public async permanentlyDelete(
    command: PermanentlyDeletePatientCommand
  ): Promise<PatientPermanentlyDeletedResponse> {
    const action = 'permanent_delete';
    const hash = requestHash([action, command.patientId, command.reasonCode]);
    const requestId = `${OPAQUE_REQUEST_PREFIX}${sha256(`${action}:${command.idempotencyKey}`).slice(0, 40)}`;
    const logRef = this.db
      .collection(RETENTION_COLLECTIONS.log)
      .doc(logId(action, command.idempotencyKey));
    const patientRef = this.db
      .collection(PATIENT_COLLECTIONS.patients)
      .doc(command.patientId);
    const appointmentsQuery = this.db
      .collection(COLLECTIONS.appointments)
      .where('patientId', '==', command.patientId);
    const returnSessionsQuery = this.db
      .collection(PATIENT_COLLECTIONS.returnSessions)
      .where('patientId', '==', command.patientId);
    const followUpsQuery = this.db
      .collection(COLLECTIONS.followUps)
      .where('patientId', '==', command.patientId);
    const lookupQuery = this.db
      .collection(PATIENT_COLLECTIONS.lookupIndex)
      .where('patientIds', 'array-contains', command.patientId);
    const patientBookingGuardRef = this.db
      .collection(COLLECTIONS.patientBookingGuards)
      .doc(command.patientId);
    const patientFollowUpStateRef = this.db
      .collection(COLLECTIONS.followUpState)
      .doc(command.patientId);

    return this.db.runTransaction(async (transaction) => {
      const existingLog = await transaction.get(logRef);
      const replay = replayResult<PatientPermanentlyDeletedResponse>(
        existingLog,
        hash
      );
      if (replay.found) return replay.result;

      const patientSnapshot = await transaction.get(patientRef);
      if (!patientSnapshot.exists) throw new NotFoundException();
      const patient = patientSnapshot.data() ?? {};
      const appointments = await transaction.get(appointmentsQuery);
      const patientBookingGuard = await transaction.get(patientBookingGuardRef);
      const patientFollowUpState = await transaction.get(
        patientFollowUpStateRef
      );
      const returnSessions = await transaction.get(returnSessionsQuery);
      const followUps = await transaction.get(followUpsQuery);
      const lookupIndexes = await transaction.get(lookupQuery);

      planRetention({
        operation: 'permanent_delete',
        command,
        requestId,
        patient,
        dependenciesReconciled: true
      });
      const layers = {
        patients: 1,
        appointments: appointments.size,
        patient_booking_guards: patientBookingGuard.exists ? 1 : 0,
        patient_follow_up_states: patientFollowUpState.exists ? 1 : 0,
        return_sessions: returnSessions.size,
        follow_ups: followUps.size,
        patient_lookup_index_v2: lookupIndexes.size
      };
      const writeCount =
        1 +
        appointments.size +
        layers.patient_booking_guards +
        layers.patient_follow_up_states +
        returnSessions.size +
        followUps.size +
        lookupIndexes.size +
        1;
      assertWriteLimit(writeCount);

      const response: PatientPermanentlyDeletedResponse = {
        patientId: command.patientId,
        state: 'deleted',
        layers
      };

      transaction.delete(patientRef);
      for (const appointment of appointments.docs) {
        transaction.delete(appointment.ref);
      }
      if (patientBookingGuard.exists) {
        transaction.delete(patientBookingGuardRef);
      }
      if (patientFollowUpState.exists) {
        transaction.delete(patientFollowUpStateRef);
      }
      for (const session of returnSessions.docs) {
        transaction.delete(session.ref);
      }
      for (const followUp of followUps.docs) {
        transaction.delete(followUp.ref);
      }
      for (const lookup of lookupIndexes.docs) {
        const patientIds = Array.isArray(lookup.data()['patientIds'])
          ? (lookup.data()['patientIds'] as unknown[]).filter(
              (id): id is string => typeof id === 'string'
            )
          : [];
        const remaining = patientIds.filter((id) => id !== command.patientId);
        if (remaining.length === 0) transaction.delete(lookup.ref);
        else
          transaction.update(lookup.ref, {
            patientIds: remaining,
            updatedAt: command.now
          });
      }
      writeLog(transaction, logRef, {
        action,
        patientId: command.patientId,
        actorRef: command.actorRef,
        at: command.now,
        requestHash: hash,
        reasonCode: command.reasonCode,
        result: response
      });
      return response;
    });
  }

  public async setLegalHold(
    command: SetPatientLegalHoldCommand
  ): Promise<PatientLegalHoldResponse> {
    const action = 'legal_hold';
    const hash = requestHash([
      action,
      command.patientId,
      command.hold,
      command.reasonCode
    ]);
    const logRef = this.db
      .collection(RETENTION_COLLECTIONS.log)
      .doc(logId(action, command.idempotencyKey));
    const patientRef = this.db
      .collection(PATIENT_COLLECTIONS.patients)
      .doc(command.patientId);

    return this.db.runTransaction(async (transaction) => {
      const existingLog = await transaction.get(logRef);
      const replay = replayResult<PatientLegalHoldResponse>(existingLog, hash);
      if (replay.found) return replay.result;
      const patient = await transaction.get(patientRef);
      if (!patient.exists) throw new NotFoundException();
      const response: PatientLegalHoldResponse = {
        patientId: command.patientId,
        legalHold: command.hold
      };
      transaction.update(patientRef, {
        legalHold: command.hold,
        legalHoldReasonCode: command.reasonCode,
        legalHoldUpdatedAt: command.now,
        legalHoldUpdatedByRef: command.actorRef,
        updatedAt: command.now
      });
      writeLog(transaction, logRef, {
        action,
        patientId: command.patientId,
        actorRef: command.actorRef,
        at: command.now,
        requestHash: hash,
        reasonCode: command.reasonCode,
        result: response
      });
      return response;
    });
  }

  public async pendingDeletion(
    now: string
  ): Promise<PendingPatientDeletionResponse> {
    const snapshot = await this.db
      .collection(PATIENT_COLLECTIONS.patients)
      .where('restorableUntil', '<=', now)
      .get();
    const patients = snapshot.docs.flatMap((document) => {
      const data = document.data();
      const archivedAt = stringField(data, 'archivedAt');
      const restorableUntil = stringField(data, 'restorableUntil');
      if (
        archivedAt === undefined ||
        restorableUntil === undefined ||
        restorableUntil > now
      ) {
        return [];
      }
      return [
        {
          patientId: document.id,
          archivedAt,
          restorableUntil,
          legalHold: data['legalHold'] === true
        }
      ];
    });
    patients.sort(
      (left, right) =>
        left.archivedAt.localeCompare(right.archivedAt) ||
        left.patientId.localeCompare(right.patientId)
    );
    return { patients };
  }
}
