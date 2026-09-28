import { createHash } from 'node:crypto';
import {
  DomainError,
  normalisePatientIdentity,
  PATIENT_NATIONALITIES,
  patientPhoneDigits,
  resolveIntakeCandidate,
  resolveReturnCandidate,
  type PatientCandidate
} from '@beauessence/domain';
import type { Firestore } from 'firebase-admin/firestore';

import type { PatientIntake } from '@beauessence/contracts';
import type { AppointmentRecord } from '../appointments/appointment.repository-port.js';

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

export function opaqueLookupIdentity(phone: string, birthDate: string): string {
  return `rlk2_${createHash('sha256')
    .update(`return-v2:${patientPhoneDigits(phone)}|${birthDate}`)
    .digest('hex')
    .slice(0, 32)}`;
}

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

export interface PatientDirectoryPort {
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
  listByPatient(patientId: string, limit: number): Promise<AppointmentRecord[]>;
  listClinic(limit: number): Promise<AppointmentRecord[]>;
}

function isMonthDay(birthDate: string): boolean {
  return /^--\d{2}-\d{2}$/.test(birthDate);
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
    ...(intakeNationality === undefined ? {} : { intakeNationality })
  };
}

export class FirestorePatientDirectory implements PatientDirectoryPort {
  public constructor(private readonly db: Firestore) {}

  public async resolveFromIntake(
    intake: PatientIntake,
    nowUtc: string,
    allocateId: () => string
  ): Promise<string> {
    const identity = normalisePatientIdentity(intake);
    const lookupKey = opaqueLookupIdentity(identity.phone, identity.birthDate);
    const lookupRef = this.db
      .collection(PATIENT_COLLECTIONS.lookupIndex)
      .doc(lookupKey);
    // The index read and write share one transaction, so two concurrent
    // creates for the same key retry and the second sees the first's patient.
    return this.db.runTransaction(async (transaction) => {
      const index = await transaction.get(lookupRef);
      const ids = stringArrayField(index.data(), 'patientIds');
      const snapshots =
        ids.length === 0
          ? []
          : await transaction.getAll(
              ...ids.map((id) =>
                this.db.collection(PATIENT_COLLECTIONS.patients).doc(id)
              )
            );
      const candidates: PatientCandidate[] = snapshots.map((snapshot, i) => ({
        patientId: ids[i] ?? '',
        name: stringField(snapshot.data(), 'name') ?? ''
      }));
      const decision = resolveIntakeCandidate(candidates, identity.name);
      if (decision.kind === 'reuse') return decision.patientId;
      if (decision.kind === 'ambiguous') throw ambiguousIdentity();
      const patientId = allocateId();
      transaction.set(lookupRef, {
        patientIds: [patientId],
        createdAt: nowUtc,
        updatedAt: nowUtc
      });
      transaction.create(
        this.db.collection(PATIENT_COLLECTIONS.patients).doc(patientId),
        {
          patientId,
          name: identity.name,
          createdAt: nowUtc,
          updatedAt: nowUtc
        }
      );
      return patientId;
    });
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
    const lookup = await this.db
      .collection(PATIENT_COLLECTIONS.lookupIndex)
      .doc(opaqueLookupIdentity(digits, birthDate))
      .get();
    const patientId = resolveReturnCandidate(
      stringArrayField(lookup.data(), 'patientIds')
    );
    if (patientId === undefined) return undefined;
    const state = await this.readFollowUpState(patientId);
    if (state?.required !== true) {
      return undefined;
    }
    const sessionId = `rs_${allocateId()}`;
    const expiresAt = new Date(
      Date.parse(nowUtc) + RETURN_SESSION_MS
    ).toISOString();
    await this.db
      .collection(PATIENT_COLLECTIONS.returnSessions)
      .doc(sessionId)
      .create({
        patientId,
        createdAt: nowUtc,
        expiresAt
      });
    const activeId = state?.activeFollowUpAppointmentId;
    if (typeof activeId === 'string') {
      const appointment = await this.db
        .collection('appointments')
        .doc(activeId)
        .get();
      const startsAt = stringField(appointment.data(), 'startsAt');
      if (typeof startsAt === 'string' && isLiveFollowUp(appointment.data())) {
        return {
          sessionId,
          expiresAt,
          outcome: 'existing',
          appointmentId: activeId,
          startsAt,
          endsAt: new Date(Date.parse(startsAt) + 30 * 60_000).toISOString(),
          patientId
        };
      }
    }
    return { sessionId, expiresAt, outcome: 'schedule', patientId };
  }

  public async readReturnSession(
    sessionId: string,
    nowUtc: string
  ): Promise<string | undefined> {
    const snapshot = await this.db
      .collection(PATIENT_COLLECTIONS.returnSessions)
      .doc(sessionId)
      .get();
    if (!snapshot.exists) return undefined;
    const data = snapshot.data() ?? {};
    if (typeof data['expiresAt'] !== 'string' || data['expiresAt'] <= nowUtc) {
      return undefined;
    }
    return typeof data['patientId'] === 'string'
      ? data['patientId']
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

  public async listByPatient(
    patientId: string,
    limit: number
  ): Promise<AppointmentRecord[]> {
    const snapshot = await this.db
      .collection('appointments')
      .where('patientId', '==', patientId)
      .orderBy('startsAt', 'asc')
      .limit(limit)
      .get();
    return snapshot.docs.map((doc) =>
      toListRecord(doc.id, doc.data() as Record<string, unknown>)
    );
  }

  public async listClinic(limit: number): Promise<AppointmentRecord[]> {
    const snapshot = await this.db
      .collection('appointments')
      .orderBy('startsAt', 'asc')
      .limit(limit)
      .get();
    return snapshot.docs.map((doc) =>
      toListRecord(doc.id, doc.data() as Record<string, unknown>)
    );
  }
}

/**
 * Process-local directory for unit tests. It is not a security boundary.
 */
export class InMemoryPatientDirectory implements PatientDirectoryPort {
  public readonly lookup = new Map<string, string[]>();
  public readonly patients = new Map<string, { name: string }>();
  public readonly sessions = new Map<
    string,
    { patientId: string; expiresAt: string }
  >();
  public readonly followUp = new Map<string, PatientFollowUpState>();
  public appointments: AppointmentRecord[] = [];
  public createdPatientCount = 0;

  public async resolveFromIntake(
    intake: PatientIntake,
    nowUtc: string,
    allocateId: () => string
  ): Promise<string> {
    await Promise.resolve();
    const identity = normalisePatientIdentity(intake);
    const lookupKey = opaqueLookupIdentity(identity.phone, identity.birthDate);
    const candidates = (this.lookup.get(lookupKey) ?? []).map((patientId) => ({
      patientId,
      name: this.patients.get(patientId)?.name ?? ''
    }));
    const decision = resolveIntakeCandidate(candidates, identity.name);
    if (decision.kind === 'reuse') return decision.patientId;
    if (decision.kind === 'ambiguous') throw ambiguousIdentity();
    const patientId = allocateId();
    this.lookup.set(lookupKey, [patientId]);
    this.patients.set(patientId, { name: identity.name });
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
    const patientId = resolveReturnCandidate(
      this.lookup.get(opaqueLookupIdentity(digits, birthDate)) ?? []
    );
    if (patientId === undefined) return undefined;
    const state = this.followUp.get(patientId);
    if (state?.required !== true) {
      return undefined;
    }
    const sessionId = `rs_${allocateId()}`;
    const expiresAt = new Date(
      Date.parse(nowUtc) + RETURN_SESSION_MS
    ).toISOString();
    this.sessions.set(sessionId, { patientId, expiresAt });
    const activeId = state?.activeFollowUpAppointmentId;
    if (typeof activeId === 'string') {
      const appointment = this.appointments.find(
        (item) => item.appointmentId === activeId
      );
      if (appointment?.startsAt !== undefined && isLiveFollowUp(appointment)) {
        return {
          sessionId,
          expiresAt,
          outcome: 'existing',
          appointmentId: activeId,
          startsAt: appointment.startsAt,
          endsAt: new Date(
            Date.parse(appointment.startsAt) + 30 * 60_000
          ).toISOString(),
          patientId
        };
      }
    }
    return { sessionId, expiresAt, outcome: 'schedule', patientId };
  }

  public async readReturnSession(
    sessionId: string,
    nowUtc: string
  ): Promise<string | undefined> {
    await Promise.resolve();
    const session = this.sessions.get(sessionId);
    if (session === undefined || session.expiresAt <= nowUtc) return undefined;
    return session.patientId;
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
    limit: number
  ): Promise<AppointmentRecord[]> {
    await Promise.resolve();
    return this.appointments
      .filter((item) => item.patientId === patientId)
      .slice()
      .sort((left, right) =>
        (left.startsAt ?? '').localeCompare(right.startsAt ?? '')
      )
      .slice(0, limit);
  }

  public async listClinic(limit: number): Promise<AppointmentRecord[]> {
    await Promise.resolve();
    return this.appointments
      .slice()
      .sort((left, right) =>
        (left.startsAt ?? '').localeCompare(right.startsAt ?? '')
      )
      .slice(0, limit);
  }
}
