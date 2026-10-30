import { createHash } from 'node:crypto';

import {
  ACTIVE_BOOKING_LIMIT,
  assertUtcTimestamp,
  DomainError,
  parsePatientBookingGuard,
  planExpiredPatientArchive,
  planRetentionCalendarProjections,
  planRetentionOperation,
  RETENTION_EXPIRY_REASON_CODE,
  RETENTION_EXPIRY_SYSTEM_ACTOR_REF,
  type PlannedRetentionCalendarJob,
  type ApprovedBusinessDeliveryPolicy,
  type RetentionOperation
} from '@beauessence/domain';
import type {
  PatientArchivedResponse,
  PatientIdentityCandidatesResponse,
  PatientIdentityConfirmedResponse,
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
  type QueryDocumentSnapshot,
  type Transaction
} from 'firebase-admin/firestore';

import { ConflictError } from '../platform/errors/api-error.js';
import { COLLECTIONS } from './booking.repository.js';
import {
  opaqueLookupIdentity,
  PATIENT_COLLECTIONS
} from '../patients/patient-directory.js';

/** Rows per page of the pending-deletion list: the default and the most. */
export const PENDING_DELETION_PAGE_SIZE = 100;

/** Where a page stopped: the last record returned, by (restorableUntil, ID). */
export interface PendingDeletionPosition {
  readonly restorableUntil: string;
  readonly patientId: string;
}

export interface PendingDeletionPage extends PendingPatientDeletionResponse {
  /** Present only when more records follow this page. */
  readonly next?: PendingDeletionPosition;
}

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
/** Internal synthetic capability only; callers cannot choose the audit actor. */
export type ArchiveExpiredPatientCommand = Omit<
  RetentionCommand,
  'actorRef' | 'scope'
> & {
  readonly scope: 'internal_synthetic';
};
export type RestorePatientCommand = RetentionCommand;
/**
 * `patientId` is the archived candidate to restore; `provisionalPatientId` is
 * the flagged active record whose bookings move to it. Human actors only.
 */
export interface ConfirmArchivedIdentityCommand extends RetentionCommand {
  readonly provisionalPatientId: string;
  readonly reasonCode: Exclude<RetentionReasonCode, 'retention_expired'>;
}
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

function calendarInputs(
  appointments: { readonly docs: readonly DocumentSnapshot[] },
  followUps: { readonly docs: readonly DocumentSnapshot[] }
) {
  return {
    appointments: appointments.docs.map((appointment) => ({
      id: appointment.id,
      status: stringField(appointment.data(), 'status') ?? 'unknown',
      startsAt: stringField(appointment.data(), 'startsAt')
    })),
    followUps: followUps.docs.map((followUp) => {
      const data: Record<string, unknown> = followUp.data() ?? {};
      return {
        appointmentId: followUp.id,
        decision: data['decision'],
        dueAt: data['dueAt']
      };
    })
  };
}

function writeCalendarJobs(
  transaction: Transaction,
  db: Firestore,
  jobs: readonly PlannedRetentionCalendarJob[]
): void {
  for (const job of jobs) {
    transaction.set(db.collection(COLLECTIONS.outboxJobs).doc(job.id), job);
  }
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

function stringArrayField(
  data: Record<string, unknown> | undefined,
  key: string
): string[] {
  const value = data?.[key];
  return Array.isArray(value)
    ? value.filter(
        (item): item is string => typeof item === 'string' && item !== ''
      )
    : [];
}

/** Unfinished-appointment ids of a guard document; unreadable fails closed. */
function guardAppointmentIds(snapshot: DocumentSnapshot): string[] {
  if (!snapshot.exists) return [];
  try {
    return [...parsePatientBookingGuard(snapshot.data()).activeAppointmentIds];
  } catch (error) {
    if (error instanceof DomainError) throw new ConflictError();
    throw error;
  }
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
    return this.archivePatient(command, false);
  }

  /** No route, role grant, scheduler or human re-authentication is created. */
  public async archiveExpiredPatient(
    command: ArchiveExpiredPatientCommand
  ): Promise<PatientArchivedResponse> {
    if (
      command.scope !== 'internal_synthetic' ||
      !command.policy.applicableScopes.includes(command.scope)
    ) {
      throw new ConflictError();
    }
    return this.archivePatient(
      { ...command, actorRef: RETENTION_EXPIRY_SYSTEM_ACTOR_REF },
      true
    );
  }

  private async archivePatient(
    command: ArchivePatientCommand,
    automatic: boolean
  ): Promise<PatientArchivedResponse> {
    const action = 'archive';
    // Automatic requests cannot replay a manually authorized operation's log.
    const identity = automatic
      ? `retention_expiry:${command.idempotencyKey}`
      : command.idempotencyKey;
    const hash = requestHash(
      automatic
        ? [
            action,
            command.patientId,
            RETENTION_EXPIRY_SYSTEM_ACTOR_REF,
            RETENTION_EXPIRY_REASON_CODE
          ]
        : [action, command.patientId]
    );
    const requestId = `${OPAQUE_REQUEST_PREFIX}${sha256(`${action}:${identity}`).slice(0, 40)}`;
    const logRef = this.db
      .collection(RETENTION_COLLECTIONS.log)
      .doc(logId(action, identity));
    const patientRef = this.db
      .collection(PATIENT_COLLECTIONS.patients)
      .doc(command.patientId);
    const appointmentsQuery = this.db
      .collection(COLLECTIONS.appointments)
      .where('patientId', '==', command.patientId);
    const followUpsQuery = this.db
      .collection(COLLECTIONS.followUps)
      .where('patientId', '==', command.patientId);

    return this.db.runTransaction(async (transaction) => {
      const existingLog = await transaction.get(logRef);
      const replay = replayResult<PatientArchivedResponse>(existingLog, hash);
      if (replay.found) return replay.result;

      const patientSnapshot = await transaction.get(patientRef);
      if (!patientSnapshot.exists) throw new NotFoundException();
      const patient = patientSnapshot.data() ?? {};
      const wasArchived = hasArchivedAt(patient);
      if (wasArchived && !automatic) throw new ConflictError();
      const appointments = await transaction.get(appointmentsQuery);
      if (
        !wasArchived &&
        appointments.docs.some((appointment) => {
          const data = appointment.data();
          if (data['status'] !== 'confirmed' && data['status'] !== 'arrived')
            return false;
          const startsAt = stringField(data, 'startsAt') ?? '';
          assertUtcTimestamp(startsAt, 'startsAt');
          assertUtcTimestamp(command.now, 'now');
          return Date.parse(startsAt) > Date.parse(command.now);
        })
      ) {
        throw new ConflictError();
      }

      let plan: ReturnType<typeof planRetentionOperation>;
      try {
        plan = automatic
          ? planExpiredPatientArchive({
              scopeId: command.scope,
              resourceId: command.patientId,
              requestId,
              state: wasArchived ? 'archived' : 'active',
              archivedAt: stringField(patient, 'archivedAt') ?? null,
              recoverableUntil: stringField(patient, 'restorableUntil') ?? null,
              nowAt: command.now,
              appointmentStartsAt: appointments.docs.map((appointment) => {
                const data: Record<string, unknown> = appointment.data();
                return data['startsAt'];
              }),
              legalHold: (patient['legalHold'] === undefined
                ? false
                : patient['legalHold']) as boolean,
              policy: command.policy.retention
            })
          : planRetention({
              operation: 'archive',
              command,
              requestId,
              patient
            });
      } catch (error) {
        if (error instanceof DomainError) throw new ConflictError();
        throw error;
      }
      const response: PatientArchivedResponse = {
        patientId: command.patientId,
        state: 'archived',
        restorableUntil: plan.recoverableUntil!
      };
      if (wasArchived) return response;
      const followUps = await transaction.get(followUpsQuery);
      // An archived patient is no longer used: the worker removes every
      // appointment and reminder event, but only while this archive episode
      // (`archivedAt`) is still the current one.
      if (plan.archivedAt === null) throw new ConflictError();
      const calendarJobs = planRetentionCalendarProjections({
        operation: 'archive',
        requestId,
        at: command.now,
        archivedAt: plan.archivedAt,
        ...calendarInputs(appointments, followUps)
      });
      assertWriteLimit(appointments.size + calendarJobs.length + 2);

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
      writeCalendarJobs(transaction, this.db, calendarJobs);
      writeLog(transaction, logRef, {
        action,
        patientId: command.patientId,
        actorRef: command.actorRef,
        ...(automatic ? { reasonCode: RETENTION_EXPIRY_REASON_CODE } : {}),
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
    const followUpsQuery = this.db
      .collection(COLLECTIONS.followUps)
      .where('patientId', '==', command.patientId);

    return this.db.runTransaction(async (transaction) => {
      const existingLog = await transaction.get(logRef);
      const replay = replayResult<PatientRestoredResponse>(existingLog, hash);
      if (replay.found) return replay.result;

      const patientSnapshot = await transaction.get(patientRef);
      if (!patientSnapshot.exists) throw new NotFoundException();
      const patient = patientSnapshot.data() ?? {};
      // A record retired by an identity confirmation points at its survivor
      // and can never be restored as a second active identity.
      if (patient['retiredIntoPatientId'] !== undefined) {
        throw new ConflictError();
      }
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
      const followUps = await transaction.get(followUpsQuery);
      const response: PatientRestoredResponse = {
        patientId: command.patientId,
        state: 'active'
      };
      // Re-add only the events this return still needs, not the old history.
      const calendarJobs = planRetentionCalendarProjections({
        operation: 'restore',
        requestId,
        at: command.now,
        ...calendarInputs(appointments, followUps)
      });
      assertWriteLimit(appointments.size + calendarJobs.length + 2);

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
      writeCalendarJobs(transaction, this.db, calendarJobs);
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

  /**
   * Manager-only candidate list for one flagged provisional record: opaque
   * ids and archive dates, no names or contact values. Stale refs (deleted,
   * restored or retired records) are dropped here and again at confirm time.
   */
  public async identityCandidates(
    provisionalPatientId: string
  ): Promise<PatientIdentityCandidatesResponse> {
    const patients = this.db.collection(PATIENT_COLLECTIONS.patients);
    const provisional = await patients.doc(provisionalPatientId).get();
    const data = provisional.data();
    if (
      !provisional.exists ||
      hasArchivedAt(data) ||
      data?.['identityReviewRequired'] !== true
    ) {
      throw new NotFoundException();
    }
    const ids = [
      ...new Set(stringArrayField(data, 'pendingArchivedPatientIds'))
    ];
    const snapshots =
      ids.length === 0
        ? []
        : await this.db.getAll(...ids.map((id) => patients.doc(id)));
    return {
      patientId: provisionalPatientId,
      candidates: snapshots.flatMap((snapshot) => {
        const candidate = snapshot.data();
        const archivedAt = stringField(candidate, 'archivedAt');
        if (
          !snapshot.exists ||
          archivedAt === undefined ||
          candidate?.['retiredIntoPatientId'] !== undefined
        ) {
          return [];
        }
        return [
          {
            patientId: snapshot.id,
            archivedAt,
            legalHold: candidate?.['legalHold'] === true
          }
        ];
      })
    };
  }

  /**
   * CP-05 stage 2b. One transaction re-reads everything, then restores the
   * chosen archived record, moves the provisional record's appointments,
   * follow-ups, booking guard and follow-up state to it, and retires the
   * provisional record (archived, never deleted). Nothing here is reachable by
   * the system actor, and the existing restore still refuses another active
   * identity; this is the single explicit exception for the flagged record.
   */
  public async confirmArchivedIdentity(
    command: ConfirmArchivedIdentityCommand
  ): Promise<PatientIdentityConfirmedResponse> {
    const action = 'confirm_identity';
    const hash = requestHash([
      action,
      command.provisionalPatientId,
      command.patientId,
      command.reasonCode
    ]);
    const requestId = `${OPAQUE_REQUEST_PREFIX}${sha256(`${action}:${command.idempotencyKey}`).slice(0, 40)}`;
    const logRef = this.db
      .collection(RETENTION_COLLECTIONS.log)
      .doc(logId(action, command.idempotencyKey));
    if (command.provisionalPatientId === command.patientId) {
      throw new ConflictError();
    }
    const patients = this.db.collection(PATIENT_COLLECTIONS.patients);
    const provisionalId = command.provisionalPatientId;
    const archivedId = command.patientId;
    const provisionalRef = patients.doc(provisionalId);
    const archivedRef = patients.doc(archivedId);
    const guards = this.db.collection(COLLECTIONS.patientBookingGuards);
    const states = this.db.collection(COLLECTIONS.followUpState);
    const ownedBy = (collection: string, id: string) =>
      this.db.collection(collection).where('patientId', '==', id);

    return this.db.runTransaction(async (transaction) => {
      const existingLog = await transaction.get(logRef);
      const replay = replayResult<PatientIdentityConfirmedResponse>(
        existingLog,
        hash
      );
      if (replay.found) return replay.result;

      const provisionalSnapshot = await transaction.get(provisionalRef);
      if (!provisionalSnapshot.exists) throw new NotFoundException();
      const archivedSnapshot = await transaction.get(archivedRef);
      const provisional = provisionalSnapshot.data() ?? {};
      const archived = archivedSnapshot.data() ?? {};
      // The candidate must still be a listed, archived, un-held, un-retired
      // record, and the provisional record must still be the flagged active one.
      if (
        !archivedSnapshot.exists ||
        hasArchivedAt(provisional) ||
        provisional['identityReviewRequired'] !== true ||
        provisional['legalHold'] === true ||
        !stringArrayField(provisional, 'pendingArchivedPatientIds').includes(
          archivedId
        ) ||
        archived['legalHold'] === true ||
        archived['retiredIntoPatientId'] !== undefined
      ) {
        throw new ConflictError();
      }
      // Throws (409) unless the candidate is still archived and unrestored.
      planRetention({
        operation: 'restore',
        command,
        requestId,
        patient: archived
      });

      // The candidate must still match the lookup key, and no other active
      // identity may hold it (the existing restore rejection stays intact).
      const key = validStoredIdentity(provisional);
      const archivedKey = validStoredIdentity(archived);
      if (
        key === undefined ||
        (archivedKey !== undefined &&
          (archivedKey.phoneDigits !== key.phoneDigits ||
            archivedKey.birthMonthDay !== key.birthMonthDay))
      ) {
        throw new ConflictError();
      }
      const lookupRef = this.db
        .collection(PATIENT_COLLECTIONS.lookupIndex)
        .doc(opaqueLookupIdentity(key.phoneDigits, key.birthMonthDay));
      const lookup = await transaction.get(lookupRef);
      const indexedIds = [
        ...new Set(stringArrayField(lookup.data(), 'patientIds'))
      ];
      if (
        !indexedIds.includes(provisionalId) ||
        !indexedIds.includes(archivedId)
      ) {
        throw new ConflictError();
      }
      const otherIds = indexedIds.filter(
        (id) => id !== provisionalId && id !== archivedId
      );
      const others =
        otherIds.length === 0
          ? []
          : await transaction.getAll(...otherIds.map((id) => patients.doc(id)));
      if (
        others.some((other) => other.exists && isActiveIdentity(other.data()))
      ) {
        throw new ConflictError();
      }

      const provisionalAppointments = await transaction.get(
        ownedBy(COLLECTIONS.appointments, provisionalId)
      );
      const provisionalFollowUps = await transaction.get(
        ownedBy(COLLECTIONS.followUps, provisionalId)
      );
      const archivedAppointments = await transaction.get(
        ownedBy(COLLECTIONS.appointments, archivedId)
      );
      const archivedFollowUps = await transaction.get(
        ownedBy(COLLECTIONS.followUps, archivedId)
      );
      const provisionalGuard = await transaction.get(guards.doc(provisionalId));
      const archivedGuard = await transaction.get(guards.doc(archivedId));
      const provisionalState = await transaction.get(states.doc(provisionalId));
      const archivedState = await transaction.get(states.doc(archivedId));

      // The merged guard must still respect the per-patient booking limit, and
      // two follow-up states are never merged by guesswork: fail closed.
      const activeIds = [
        ...new Set([
          ...guardAppointmentIds(archivedGuard),
          ...guardAppointmentIds(provisionalGuard)
        ])
      ];
      if (
        activeIds.length > ACTIVE_BOOKING_LIMIT ||
        (provisionalState.exists && archivedState.exists)
      ) {
        throw new ConflictError();
      }

      // Same restore projections as the plain restore. The moved bookings are
      // this return visit, so they are re-added too (their event ids differ
      // from the old record's, so the two sets never collide).
      const archivedInputs = calendarInputs(
        archivedAppointments,
        archivedFollowUps
      );
      const movedInputs = calendarInputs(
        provisionalAppointments,
        provisionalFollowUps
      );
      const calendarJobs = planRetentionCalendarProjections({
        operation: 'restore',
        requestId,
        at: command.now,
        appointments: [
          ...archivedInputs.appointments,
          ...movedInputs.appointments
        ],
        followUps: [...archivedInputs.followUps, ...movedInputs.followUps]
      });
      assertWriteLimit(
        provisionalAppointments.size +
          provisionalFollowUps.size +
          archivedAppointments.size +
          calendarJobs.length +
          9
      );

      const response: PatientIdentityConfirmedResponse = {
        patientId: archivedId,
        provisionalPatientId: provisionalId,
        state: 'active'
      };

      transaction.update(archivedRef, {
        archivedAt: FieldValue.delete(),
        archivedByRef: FieldValue.delete(),
        restorableUntil: FieldValue.delete(),
        updatedAt: command.now
      });
      for (const appointment of archivedAppointments.docs) {
        transaction.update(appointment.ref, {
          patientArchived: FieldValue.delete()
        });
      }
      for (const appointment of provisionalAppointments.docs) {
        transaction.update(appointment.ref, {
          patientId: archivedId,
          identityReviewRequired: FieldValue.delete()
        });
      }
      for (const followUp of provisionalFollowUps.docs) {
        transaction.update(followUp.ref, { patientId: archivedId });
      }
      if (provisionalGuard.exists) {
        transaction.set(archivedGuard.ref, {
          activeAppointmentIds: activeIds,
          updatedAt: command.now
        });
        transaction.delete(provisionalGuard.ref);
      }
      if (provisionalState.exists) {
        transaction.set(archivedState.ref, {
          ...provisionalState.data(),
          updatedAt: command.now
        });
        transaction.delete(provisionalState.ref);
      }
      // The provisional record is retired, never deleted: it stays archived so
      // normal reads, lookups and return sessions ignore it, it points at its
      // survivor, and it cannot be restored. Its recovery boundary matches the
      // archive window so a later manual deletion review can still apply.
      transaction.update(provisionalRef, {
        archivedAt: command.now,
        archivedByRef: command.actorRef,
        restorableUntil: new Date(
          Date.parse(command.now) +
            command.policy.retention.recoverableDays * 24 * 60 * 60 * 1000
        ).toISOString(),
        retiredIntoPatientId: archivedId,
        identityReviewRequired: FieldValue.delete(),
        pendingArchivedPatientIds: FieldValue.delete(),
        updatedAt: command.now
      });
      transaction.update(lookupRef, {
        patientIds: indexedIds.filter((id) => id !== provisionalId),
        updatedAt: command.now
      });
      writeCalendarJobs(transaction, this.db, calendarJobs);
      writeLog(transaction, logRef, {
        action,
        patientId: archivedId,
        actorRef: command.actorRef,
        at: command.now,
        requestHash: hash,
        reasonCode: command.reasonCode,
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

      // The calendar jobs below are the projection reconciliation: every
      // appointment event and dated reminder is deleted by the worker.
      planRetention({
        operation: 'permanent_delete',
        command,
        requestId,
        patient,
        dependenciesReconciled: true
      });
      const calendarJobs = planRetentionCalendarProjections({
        operation: 'permanent_delete',
        requestId,
        at: command.now,
        ...calendarInputs(appointments, followUps)
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
        calendarJobs.length +
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
      writeCalendarJobs(transaction, this.db, calendarJobs);
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

  /**
   * One page of the manual-review list, ordered by `restorableUntil` and, for
   * records that share it, by patient ID (the order every Firestore index ends
   * with), and read with `limit + 1` so "exactly one full page" is not
   * reported as cut. The query stays on the one field `restorableUntil`, which
   * the automatic single-field index serves, so no index is added: a position
   * restarts the range at its time and skips the records of that time already
   * returned. Nothing here deletes or reads a patient's name.
   */
  public async pendingDeletion(
    now: string,
    page: {
      readonly limit?: number;
      readonly after?: PendingDeletionPosition;
    } = {}
  ): Promise<PendingDeletionPage> {
    const limit = page.limit ?? PENDING_DELETION_PAGE_SIZE;
    const after = page.after;
    let expired = this.db
      .collection(PATIENT_COLLECTIONS.patients)
      .where('restorableUntil', '<=', now);
    if (after !== undefined)
      expired = expired.where('restorableUntil', '>=', after.restorableUntil);
    const ordered = expired.orderBy('restorableUntil', 'asc');
    const found: QueryDocumentSnapshot[] = [];
    let cursor: QueryDocumentSnapshot | undefined;
    let exhausted = false;
    while (found.length <= limit && !exhausted) {
      const snapshot = await (
        cursor === undefined ? ordered : ordered.startAfter(cursor)
      )
        .limit(limit + 1)
        .get();
      for (const document of snapshot.docs) {
        cursor = document;
        // Already returned on an earlier page: same time, ID not after it.
        if (
          after !== undefined &&
          stringField(document.data(), 'restorableUntil') ===
            after.restorableUntil &&
          document.id <= after.patientId
        )
          continue;
        found.push(document);
        if (found.length > limit) break;
      }
      exhausted = snapshot.size < limit + 1;
    }
    const pageDocs = found.slice(0, limit);
    const patients = pageDocs.flatMap((document) => {
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
    const last = pageDocs.at(-1);
    const lastRestorableUntil = stringField(last?.data(), 'restorableUntil');
    return found.length > limit &&
      last !== undefined &&
      lastRestorableUntil !== undefined
      ? {
          patients,
          next: { restorableUntil: lastRestorableUntil, patientId: last.id }
        }
      : { patients };
  }
}
