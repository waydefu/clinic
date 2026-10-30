import {
  assertUtcTimestamp,
  DomainError,
  isUtcIsoTimestamp,
  normalisePatientIdentity,
  PATIENT_NATIONALITIES,
  patientPhoneDigits,
  isPatientBirthMonthDay,
  resolveIntakeCandidate,
  resolveReturnCandidate,
  type PatientCandidate
} from '@beauessence/domain';
import { opaqueLookupIdentity } from '@beauessence/domain/patient-lookup-identity.node';
import {
  Timestamp,
  type Firestore,
  type Transaction,
  type Query,
  type QueryDocumentSnapshot
} from 'firebase-admin/firestore';

import type { PatientIntake } from '@beauessence/contracts';
import type { AppointmentRecord } from '../appointments/appointment.repository-port.js';
import { ConflictError } from '../platform/errors/api-error.js';

export { opaqueLookupIdentity };

export const PATIENT_COLLECTIONS = {
  patients: 'patients',
  /**
   * v1 keyed phone + full birth date to one patient. Kept untouched and no
   * longer read or written: its hash cannot be reversed into a month-day
   * (BOOKING-MINIMIZATION-2026-09-22), so those rows stay as they are.
   */
  legacyLookupIndex: 'patient_lookup_index',
  /** v2 keys phone digits + `--MM-DD` and lists every candidate patient. */
  lookupIndex: 'patient_lookup_index_v2',
  returnSessions: 'return_sessions',
  followUpState: 'patient_follow_up_states'
} as const;

const RETURN_SESSION_MS = 15 * 60 * 1000;
/** A return session's row stays 24 hours past its expiry (decision register). */
const RETURN_SESSION_RETENTION_MS = 24 * 60 * 60 * 1000;
const RETURN_SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * The typed field a Firestore TTL policy would act on (A05): a Timestamp, which
 * a string cannot be. `expiresAt` stays the ISO string the service checks and
 * alone decides whether a session can be used, so a late or absent TTL deletion
 * never keeps an expired session alive. A missing or malformed expiry throws
 * rather than inventing a purge time.
 */
export function returnSessionPurgeAt(expiresAt: string): Timestamp {
  assertUtcTimestamp(expiresAt, 'expiresAt');
  return Timestamp.fromMillis(
    Date.parse(expiresAt) + RETURN_SESSION_RETENTION_MS
  );
}

function isUnexpiredReturnSession(expiresAt: unknown, nowUtc: string): boolean {
  if (typeof expiresAt !== 'string' || !isUtcIsoTimestamp(expiresAt))
    return false;
  const expirySecond = expiresAt.slice(0, 19);
  const nowSecond = nowUtc.slice(0, 19);
  if (expirySecond !== nowSecond) return expirySecond > nowSecond;
  // Date.parse loses sub-millisecond precision admitted by the UTC validator.
  const expiryFraction = expiresAt.slice(20, -1);
  const nowFraction = nowUtc.slice(20, -1);
  const width = Math.max(expiryFraction.length, nowFraction.length);
  return expiryFraction.padEnd(width, '0') > nowFraction.padEnd(width, '0');
}

/**
 * Upper bound on appointment documents one staff list call may scan while
 * skipping archived rows. Firestore cannot express "`patientArchived` is not
 * true" for documents that lack the field, so the filter runs in memory and
 * the list pages until it has `limit` active rows or runs out of rows.
 */
const LIST_SCAN_LIMIT = 1000;

function ambiguousIdentity(): DomainError {
  return new DomainError(
    'PATIENT_IDENTITY_AMBIGUOUS',
    'The patient could not be identified uniquely.'
  );
}

export interface ReturnLookupResult {
  readonly sessionId: string;
  readonly expiresAt: string;
  readonly outcome: 'existing' | 'schedule';
  readonly appointmentId?: string;
  readonly startsAt?: string;
  readonly endsAt?: string;
  readonly patientId: string;
}

export interface PatientFollowUpState {
  readonly required: boolean;
  readonly sourceAppointmentId?: string;
  readonly sourceFollowUpId?: string;
  readonly activeFollowUpAppointmentId?: string;
}

/**
 * Inclusive UTC bounds on `startsAt` (ISO-8601, as stored). A list that only
 * ever shows a time window asks the directory for that window, so the page
 * holds rows the caller will return instead of the oldest rows on record.
 */
export interface AppointmentListWindow {
  readonly from: string;
  readonly to: string;
}

/**
 * Where a list page stopped: the last row returned, by the order the lists
 * use (`startsAt`, then document ID). The next page starts strictly after it,
 * so rows that share a start time are neither skipped nor repeated.
 */
export interface AppointmentListPosition {
  readonly startsAt: string;
  readonly appointmentId: string;
}

export interface PreparedPatientIntake {
  readonly patientId: string;
  readonly intake: PatientIntake;
}

/** Transaction-local metadata; preparation must not make it authoritative. */
interface PatientIntakePlan {
  readonly patientId: string;
  readonly identityReviewRequired?: true;
  apply(): void;
}

export interface PatientDirectoryPort {
  prepareIntake(
    intake: PatientIntake,
    nowUtc: string,
    allocateId: () => string
  ): Promise<PreparedPatientIntake>;
  /** Explicit trusted association only; absence MUST deny token identity. */
  readVerifiedPatientId?(actorId: string): Promise<string | undefined>;
  resolveFromIntake(
    intake: PatientIntake,
    nowUtc: string,
    allocateId: () => string
  ): Promise<string>;
  lookupReturn(
    phone: string,
    birthDate: string,
    nowUtc: string,
    allocateId: () => string
  ): Promise<ReturnLookupResult | undefined>;
  readReturnSession(
    sessionId: string,
    nowUtc: string
  ): Promise<string | undefined>;
  readFollowUpState(
    patientId: string
  ): Promise<PatientFollowUpState | undefined>;
  listByPatient(
    patientId: string,
    limit: number,
    window?: AppointmentListWindow,
    after?: AppointmentListPosition
  ): Promise<AppointmentRecord[]>;
  listClinic(
    limit: number,
    window?: AppointmentListWindow,
    after?: AppointmentListPosition
  ): Promise<AppointmentRecord[]>;
}

function isMonthDay(birthDate: string): boolean {
  return isPatientBirthMonthDay(birthDate);
}

/**
 * A follow-up that was cancelled, marked no-show, or removed no longer holds
 * the patient's entitlement, even if a stale pointer still names it.
 */
export function isLiveFollowUp(appointment: unknown): boolean {
  if (typeof appointment !== 'object' || appointment === null) return false;
  const status = (appointment as Record<string, unknown>)['status'];
  return (
    typeof status === 'string' && status !== 'cancelled' && status !== 'no_show'
  );
}

export function assertFollowUpBookable(
  state: PatientFollowUpState | undefined,
  bookingKind: string
): void {
  if (bookingKind !== 'follow_up') return;
  if (state?.activeFollowUpAppointmentId !== undefined) {
    throw new DomainError(
      'FOLLOW_UP_ALREADY_SCHEDULED',
      'An active follow-up appointment already exists.'
    );
  }
  if (state?.required !== true) {
    throw new DomainError(
      'FOLLOW_UP_NOT_ENTITLED',
      'No follow-up entitlement exists.'
    );
  }
}

/**
 * Contact values stored on the server-side patient record
 * (`EXPORT-CONTACT-STORAGE-2026-09-29`, ADR-0007 2026-09-29 addendum) for the
 * approved export and front-desk contact. They never enter logs, audit events,
 * usage events or the lookup key; the key stays a one-way hash.
 */
export interface PatientContact {
  readonly phoneDigits: string;
  /** `--MM-DD`, never a year. */
  readonly birthMonthDay: string;
}

export function patientContactOf(identity: {
  readonly phone: string;
  readonly birthDate: string;
}): PatientContact {
  return {
    phoneDigits: patientPhoneDigits(identity.phone),
    birthMonthDay: identity.birthDate
  };
}

function stringField(
  data: Record<string, unknown> | undefined,
  key: string
): string | undefined {
  const value = data?.[key];
  return typeof value === 'string' ? value : undefined;
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

function withinWindow(query: Query, window: AppointmentListWindow | undefined) {
  return window === undefined
    ? query
    : query
        .where('startsAt', '>=', window.from)
        .where('startsAt', '<=', window.to);
}

/** Mirrors the Firestore window for the process-local directory. */
function isInsideWindow(
  startsAt: string | undefined,
  window: AppointmentListWindow | undefined
): boolean {
  if (window === undefined) return true;
  return (
    startsAt !== undefined && startsAt >= window.from && startsAt <= window.to
  );
}

interface ListOrderKey {
  readonly startsAt?: string | undefined;
  readonly appointmentId: string;
}

/** The order both lists use: start time, then document ID (code-unit order). */
function compareListOrder(left: ListOrderKey, right: ListOrderKey): number {
  const leftStart = left.startsAt ?? '';
  const rightStart = right.startsAt ?? '';
  if (leftStart !== rightStart) return leftStart < rightStart ? -1 : 1;
  if (left.appointmentId === right.appointmentId) return 0;
  return left.appointmentId < right.appointmentId ? -1 : 1;
}

/** Mirrors Firestore's `startAfter(startsAt, id)` for the process-local directory. */
function isAfterPosition(
  item: AppointmentRecord,
  after: AppointmentListPosition | undefined
): boolean {
  if (after === undefined) return true;
  return compareListOrder(item, after) > 0;
}

function isArchivedPatient(data: Record<string, unknown> | undefined): boolean {
  return data?.['archivedAt'] !== undefined && data['archivedAt'] !== null;
}

/**
 * Booking-create guard (ADR-0010 item 7, AUD-07). The patient is resolved in
 * one transaction and the appointment is created in another, so the booking
 * transaction must itself read `patients/{id}` and refuse when the patient was
 * archived in between. Archive flags only the appointments that exist when it
 * commits; a booking that slipped past would carry no `patientArchived` and
 * would appear in staff lists and exports. A missing patient record is not
 * refused here: this guard closes the archive race, nothing more.
 */
export function assertPatientNotArchived(
  patient: Record<string, unknown> | undefined
): void {
  if (isArchivedPatient(patient)) throw new ConflictError();
}

/** Maps a stored appointment row to the list record. Exported for tests. */
export function toListRecord(
  id: string,
  data: Record<string, unknown> | undefined
): AppointmentRecord {
  // Only the two approved values pass; anything else stored is dropped rather
  // than echoed to the Workbench.
  const intakeNationality = PATIENT_NATIONALITIES.find(
    (value) => value === data?.['intakeNationality']
  );
  return {
    appointmentId: id,
    patientId: stringField(data, 'patientId') ?? '',
    slotId: stringField(data, 'slotId') ?? '',
    bookingKind:
      data?.['bookingKind'] === 'follow_up' ? 'follow_up' : 'initial',
    status: (data?.['status'] ?? 'confirmed') as AppointmentRecord['status'],
    ...(typeof data?.['startsAt'] === 'string'
      ? { startsAt: data['startsAt'] }
      : {}),
    ...(intakeNationality === undefined ? {} : { intakeNationality }),
    ...(data?.['identityReviewRequired'] === true
      ? { identityReviewRequired: true as const }
      : {}),
    ...(typeof data?.['patientNote'] === 'string' &&
    data['patientNote'] !== '' &&
    data['patientNote'].length <= 120
      ? { patientNote: data['patientNote'] }
      : {})
  };
}

export class FirestorePatientDirectory implements PatientDirectoryPort {
  public constructor(private readonly db: Firestore) {}

  public async resolveFromIntake(
    intake: PatientIntake,
    nowUtc: string,
    allocateId: () => string
  ): Promise<string> {
    return this.db.runTransaction(async (transaction) => {
      const plan = await this.planIntakeWithin(
        transaction,
        intake,
        nowUtc,
        allocateId
      );
      plan.apply();
      return plan.patientId;
    });
  }

  public async prepareIntake(
    intake: PatientIntake,
    nowUtc: string,
    allocateId: () => string
  ): Promise<PreparedPatientIntake> {
    return this.db.runTransaction(async (transaction) => {
      const plan = await this.planIntakeWithin(
        transaction,
        intake,
        nowUtc,
        allocateId
      );
      return { patientId: plan.patientId, intake };
    });
  }

  public async planIntakeWithin(
    transaction: Transaction,
    intake: PatientIntake,
    nowUtc: string,
    allocateId: () => string
  ): Promise<PatientIntakePlan> {
    const identity = normalisePatientIdentity(intake);
    const lookupKey = opaqueLookupIdentity(identity.phone, identity.birthDate);
    const lookupRef = this.db
      .collection(PATIENT_COLLECTIONS.lookupIndex)
      .doc(lookupKey);
    // The index read and write share one transaction, so two concurrent
    // creates for the same key retry and the second sees the first's patient.

    const index = await transaction.get(lookupRef);
    const ids = [...new Set(stringArrayField(index.data(), 'patientIds'))];
    const snapshots =
      ids.length === 0
        ? []
        : await transaction.getAll(
            ...ids.map((id) =>
              this.db.collection(PATIENT_COLLECTIONS.patients).doc(id)
            )
          );
    // Archive candidates stay private. A new intake may raise staff attention,
    // but must not revive an archive or disclose its identity/history.
    const pendingArchivedPatientIds = snapshots
      .filter(
        (snapshot) => snapshot.exists && isArchivedPatient(snapshot.data())
      )
      .map((snapshot) => snapshot.id);
    const pendingReview =
      pendingArchivedPatientIds.length > 0
        ? { identityReviewRequired: true as const }
        : {};
    const candidates: PatientCandidate[] = snapshots.flatMap((snapshot, i) => {
      const data = snapshot.data();
      if (!snapshot.exists || isArchivedPatient(data)) return [];
      return [
        {
          patientId: ids[i] ?? '',
          name: stringField(data, 'name') ?? ''
        }
      ];
    });
    const decision = resolveIntakeCandidate(candidates, identity.name);
    const contact = patientContactOf(identity);
    if (decision.kind === 'reuse') {
      // Only this freshly matched active record is updated. Archived records
      // are never revived or copied; old and newly found private refs remain
      // pending until an explicit identity-confirmation operation.
      const reused = snapshots[ids.indexOf(decision.patientId)];
      const pendingIds = [
        ...new Set([
          ...stringArrayField(reused?.data(), 'pendingArchivedPatientIds'),
          ...pendingArchivedPatientIds
        ])
      ].filter((id) => id !== decision.patientId);
      const needsReview =
        reused?.data()?.['identityReviewRequired'] === true ||
        pendingIds.length > 0;
      const review = needsReview
        ? { identityReviewRequired: true as const }
        : {};
      const missingContact =
        stringField(reused?.data(), 'phoneDigits') === undefined;
      return {
        patientId: decision.patientId,
        ...review,
        apply: () => {
          if (reused?.exists === true && (missingContact || needsReview)) {
            transaction.update(reused.ref, {
              ...(missingContact ? contact : {}),
              ...review,
              ...(pendingIds.length > 0
                ? { pendingArchivedPatientIds: pendingIds }
                : {}),
              updatedAt: nowUtc
            });
          }
        }
      };
    }
    if (decision.kind === 'ambiguous') throw ambiguousIdentity();
    const patientId = allocateId();
    return {
      patientId,
      ...pendingReview,
      apply: () => {
        transaction.set(lookupRef, {
          ...(index.data() ?? {}),
          patientIds: [...new Set([...ids, patientId])],
          createdAt: stringField(index.data(), 'createdAt') ?? nowUtc,
          updatedAt: nowUtc
        });
        transaction.create(
          this.db.collection(PATIENT_COLLECTIONS.patients).doc(patientId),
          {
            patientId,
            name: identity.name,
            ...contact,
            ...pendingReview,
            ...(pendingArchivedPatientIds.length > 0
              ? { pendingArchivedPatientIds }
              : {}),
            createdAt: nowUtc,
            updatedAt: nowUtc
          }
        );
      }
    };
  }

  public async lookupReturn(
    phone: string,
    birthDate: string,
    nowUtc: string,
    allocateId: () => string
  ): Promise<ReturnLookupResult | undefined> {
    const digits = patientPhoneDigits(phone);
    if (digits.length < 8 || digits.length > 20) return undefined;
    if (!isMonthDay(birthDate)) return undefined;
    assertUtcTimestamp(nowUtc, 'nowUtc');
    const lookup = await this.db
      .collection(PATIENT_COLLECTIONS.lookupIndex)
      .doc(opaqueLookupIdentity(digits, birthDate))
      .get();
    const candidateIds = stringArrayField(lookup.data(), 'patientIds');
    const candidates =
      candidateIds.length === 0
        ? []
        : await Promise.all(
            candidateIds.map((id) =>
              this.db.collection(PATIENT_COLLECTIONS.patients).doc(id).get()
            )
          );
    const patientId = resolveReturnCandidate(
      candidateIds.filter((_, index) => {
        const candidate = candidates[index];
        return (
          candidate?.exists === true && !isArchivedPatient(candidate.data())
        );
      })
    );
    if (patientId === undefined) return undefined;
    const state = await this.readFollowUpState(patientId);
    if (state?.required !== true) {
      return undefined;
    }
    let existing:
      | Pick<ReturnLookupResult, 'appointmentId' | 'startsAt' | 'endsAt'>
      | undefined;
    const activeId = state?.activeFollowUpAppointmentId;
    if (typeof activeId === 'string') {
      const appointment = await this.db
        .collection('appointments')
        .doc(activeId)
        .get();
      const startsAt = stringField(appointment.data(), 'startsAt');
      if (typeof startsAt === 'string' && isLiveFollowUp(appointment.data())) {
        assertUtcTimestamp(startsAt, 'appointment.startsAt');
        existing = {
          appointmentId: activeId,
          startsAt,
          endsAt: new Date(Date.parse(startsAt) + 30 * 60_000).toISOString()
        };
      }
    }
    const expiresAt = new Date(
      Date.parse(nowUtc) + RETURN_SESSION_MS
    ).toISOString();
    const sessionId = `rs_${allocateId()}`;
    await this.db
      .collection(PATIENT_COLLECTIONS.returnSessions)
      .doc(sessionId)
      .create({
        patientId,
        createdAt: nowUtc,
        expiresAt,
        purgeAt: returnSessionPurgeAt(expiresAt)
      });
    if (existing !== undefined)
      return {
        sessionId,
        expiresAt,
        outcome: 'existing',
        ...existing,
        patientId
      };
    return { sessionId, expiresAt, outcome: 'schedule', patientId };
  }

  public async readReturnSession(
    sessionId: string,
    nowUtc: string
  ): Promise<string | undefined> {
    assertUtcTimestamp(nowUtc, 'nowUtc');
    // Defence in depth (NEW-05): the authenticator already bounds the header;
    // never let other text become a document path.
    if (!RETURN_SESSION_ID.test(sessionId)) return undefined;
    const snapshot = await this.db
      .collection(PATIENT_COLLECTIONS.returnSessions)
      .doc(sessionId)
      .get();
    if (!snapshot.exists) return undefined;
    const data = snapshot.data() ?? {};
    if (!isUnexpiredReturnSession(data['expiresAt'], nowUtc)) {
      return undefined;
    }
    const patientId = stringField(data, 'patientId');
    if (patientId === undefined) return undefined;
    const patient = await this.db
      .collection(PATIENT_COLLECTIONS.patients)
      .doc(patientId)
      .get();
    return patient.exists && !isArchivedPatient(patient.data())
      ? patientId
      : undefined;
  }

  public async readFollowUpState(
    patientId: string
  ): Promise<PatientFollowUpState | undefined> {
    const snapshot = await this.db
      .collection(PATIENT_COLLECTIONS.followUpState)
      .doc(patientId)
      .get();
    if (!snapshot.exists) return undefined;
    const data = snapshot.data() ?? {};
    const activeId: unknown = data['activeFollowUpAppointmentId'];
    const activeHolds =
      typeof activeId === 'string' &&
      isLiveFollowUp(
        (await this.db.collection('appointments').doc(activeId).get()).data()
      );
    return {
      required: data['required'] === true,
      ...(typeof data['sourceAppointmentId'] === 'string'
        ? { sourceAppointmentId: data['sourceAppointmentId'] }
        : {}),
      ...(typeof data['sourceFollowUpId'] === 'string'
        ? { sourceFollowUpId: data['sourceFollowUpId'] }
        : {}),
      ...(activeHolds && typeof activeId === 'string'
        ? { activeFollowUpAppointmentId: activeId }
        : {})
    };
  }

  /**
   * With a window the query carries `startsAt >= from` and `startsAt <= to`
   * on the field it already orders by, so the existing (patientId, startsAt)
   * composite index serves it and no index is added. The trailing
   * `__name__` order is the tail every Firestore index already has.
   */
  public async listByPatient(
    patientId: string,
    limit: number,
    window?: AppointmentListWindow,
    after?: AppointmentListPosition
  ): Promise<AppointmentRecord[]> {
    return this.listActiveAppointments(
      withinWindow(
        this.db.collection('appointments').where('patientId', '==', patientId),
        window
      )
        .orderBy('startsAt', 'asc')
        .orderBy('__name__', 'asc'),
      limit,
      after
    );
  }

  /**
   * With a window the query carries `startsAt >= from` and `startsAt <= to`
   * on the one field it orders by, which the automatic single-field index
   * serves, so no index is added. Without one the oldest rows come first,
   * however old.
   */
  public async listClinic(
    limit: number,
    window?: AppointmentListWindow,
    after?: AppointmentListPosition
  ): Promise<AppointmentRecord[]> {
    return this.listActiveAppointments(
      withinWindow(this.db.collection('appointments'), window)
        .orderBy('startsAt', 'asc')
        .orderBy('__name__', 'asc'),
      limit,
      after
    );
  }

  /**
   * Archived rows must not consume the page. The query is paged with a cursor
   * (same ordering, so no new index) and archived rows are skipped until
   * `limit` active rows are collected, the rows run out, or the scan bound is
   * reached. Past the bound a call returns the active rows it found; archived
   * rows are never returned either way.
   *
   * shortcut: more than LIST_SCAN_LIMIT archived rows in a row end the page with
   * no continuation (the caller sees fewer than `limit` rows), upgrade by
   * returning the last scanned position when runs that long can occur.
   */
  private async listActiveAppointments(
    ordered: Query,
    limit: number,
    after?: AppointmentListPosition
  ): Promise<AppointmentRecord[]> {
    const records: AppointmentRecord[] = [];
    let scanned = 0;
    let cursor: QueryDocumentSnapshot | undefined;
    // The order is (`startsAt`, document ID), so a position is the pair.
    const first =
      after === undefined
        ? ordered
        : ordered.startAfter(after.startsAt, after.appointmentId);
    while (records.length < limit && scanned < LIST_SCAN_LIMIT) {
      const page = await (
        cursor === undefined ? first : ordered.startAfter(cursor)
      )
        .limit(limit)
        .get();
      for (const doc of page.docs) {
        const data = doc.data() as Record<string, unknown>;
        if (data['patientArchived'] === true) continue;
        records.push(toListRecord(doc.id, data));
        if (records.length === limit) break;
      }
      scanned += page.size;
      if (page.size < limit) break;
      cursor = page.docs[page.docs.length - 1];
    }
    return records;
  }
}

/**
 * Process-local directory for unit tests. It is not a security boundary.
 */
export class InMemoryPatientDirectory implements PatientDirectoryPort {
  public readonly lookup = new Map<string, string[]>();
  public readonly patients = new Map<
    string,
    {
      name: string;
      phoneDigits?: string;
      birthMonthDay?: string;
      archivedAt?: string;
    }
  >();
  public readonly sessions = new Map<
    string,
    { patientId: string; expiresAt: string }
  >();
  public readonly followUp = new Map<string, PatientFollowUpState>();
  public appointments: AppointmentRecord[] = [];
  public createdPatientCount = 0;

  public async prepareIntake(
    intake: PatientIntake,
    _nowUtc: string,
    allocateId: () => string
  ): Promise<PreparedPatientIntake> {
    const identity = normalisePatientIdentity(intake);
    const candidates = (
      this.lookup.get(
        opaqueLookupIdentity(identity.phone, identity.birthDate)
      ) ?? []
    )
      .filter(
        (id) =>
          this.patients.get(id)?.archivedAt === undefined &&
          this.patients.has(id)
      )
      .map((id) => ({
        patientId: id,
        name: this.patients.get(id)?.name ?? ''
      }));
    const decision = resolveIntakeCandidate(candidates, identity.name);
    if (decision.kind === 'ambiguous')
      return Promise.reject(ambiguousIdentity());
    return Promise.resolve({
      patientId: decision.kind === 'reuse' ? decision.patientId : allocateId(),
      intake
    });
  }

  public async resolveFromIntake(
    intake: PatientIntake,
    nowUtc: string,
    allocateId: () => string
  ): Promise<string> {
    await Promise.resolve();
    const identity = normalisePatientIdentity(intake);
    const lookupKey = opaqueLookupIdentity(identity.phone, identity.birthDate);
    const ids = this.lookup.get(lookupKey) ?? [];
    const candidates = ids.flatMap((patientId) => {
      const patient = this.patients.get(patientId);
      return patient === undefined || patient.archivedAt !== undefined
        ? []
        : [{ patientId, name: patient.name }];
    });
    const decision = resolveIntakeCandidate(candidates, identity.name);
    const contact = patientContactOf(identity);
    if (decision.kind === 'reuse') {
      const reused = this.patients.get(decision.patientId);
      if (reused !== undefined && reused.phoneDigits === undefined)
        this.patients.set(decision.patientId, { ...reused, ...contact });
      return decision.patientId;
    }
    if (decision.kind === 'ambiguous') throw ambiguousIdentity();
    const patientId = allocateId();
    this.lookup.set(lookupKey, [...new Set([...ids, patientId])]);
    this.patients.set(patientId, { name: identity.name, ...contact });
    this.createdPatientCount += 1;
    return patientId;
  }

  public async lookupReturn(
    phone: string,
    birthDate: string,
    nowUtc: string,
    allocateId: () => string
  ): Promise<ReturnLookupResult | undefined> {
    await Promise.resolve();
    const digits = patientPhoneDigits(phone);
    if (digits.length < 8 || digits.length > 20) return undefined;
    if (!isMonthDay(birthDate)) return undefined;
    assertUtcTimestamp(nowUtc, 'nowUtc');
    const patientId = resolveReturnCandidate(
      (this.lookup.get(opaqueLookupIdentity(digits, birthDate)) ?? []).filter(
        (id) =>
          this.patients.has(id) &&
          this.patients.get(id)?.archivedAt === undefined
      )
    );
    if (patientId === undefined) return undefined;
    const state = this.followUp.get(patientId);
    if (state?.required !== true) {
      return undefined;
    }
    let existing:
      | Pick<ReturnLookupResult, 'appointmentId' | 'startsAt' | 'endsAt'>
      | undefined;
    const activeId = state?.activeFollowUpAppointmentId;
    if (typeof activeId === 'string') {
      const appointment = this.appointments.find(
        (item) => item.appointmentId === activeId
      );
      if (appointment?.startsAt !== undefined && isLiveFollowUp(appointment)) {
        assertUtcTimestamp(appointment.startsAt, 'appointment.startsAt');
        existing = {
          appointmentId: activeId,
          startsAt: appointment.startsAt,
          endsAt: new Date(
            Date.parse(appointment.startsAt) + 30 * 60_000
          ).toISOString()
        };
      }
    }
    const expiresAt = new Date(
      Date.parse(nowUtc) + RETURN_SESSION_MS
    ).toISOString();
    const sessionId = `rs_${allocateId()}`;
    this.sessions.set(sessionId, { patientId, expiresAt });
    if (existing !== undefined)
      return {
        sessionId,
        expiresAt,
        outcome: 'existing',
        ...existing,
        patientId
      };
    return { sessionId, expiresAt, outcome: 'schedule', patientId };
  }

  public async readReturnSession(
    sessionId: string,
    nowUtc: string
  ): Promise<string | undefined> {
    assertUtcTimestamp(nowUtc, 'nowUtc');
    await Promise.resolve();
    if (!RETURN_SESSION_ID.test(sessionId)) return undefined;
    const session = this.sessions.get(sessionId);
    if (
      session === undefined ||
      !isUnexpiredReturnSession(session.expiresAt, nowUtc)
    )
      return undefined;
    return this.patients.has(session.patientId) &&
      this.patients.get(session.patientId)?.archivedAt === undefined
      ? session.patientId
      : undefined;
  }

  public async readFollowUpState(
    patientId: string
  ): Promise<PatientFollowUpState | undefined> {
    await Promise.resolve();
    const state = this.followUp.get(patientId);
    const activeId = state?.activeFollowUpAppointmentId;
    if (state === undefined || activeId === undefined) return state;
    const active = this.appointments.find(
      (item) => item.appointmentId === activeId
    );
    if (isLiveFollowUp(active)) return state;
    const { activeFollowUpAppointmentId: _stale, ...rest } = state;
    return rest;
  }

  public async listByPatient(
    patientId: string,
    limit: number,
    window?: AppointmentListWindow,
    after?: AppointmentListPosition
  ): Promise<AppointmentRecord[]> {
    await Promise.resolve();
    return this.appointments
      .filter(
        (item) =>
          item.patientId === patientId &&
          isInsideWindow(item.startsAt, window) &&
          isAfterPosition(item, after)
      )
      .sort(compareListOrder)
      .slice(0, limit);
  }

  public async listClinic(
    limit: number,
    window?: AppointmentListWindow,
    after?: AppointmentListPosition
  ): Promise<AppointmentRecord[]> {
    await Promise.resolve();
    return this.appointments
      .filter(
        (item) =>
          isInsideWindow(item.startsAt, window) && isAfterPosition(item, after)
      )
      .sort(compareListOrder)
      .slice(0, limit);
  }
}
