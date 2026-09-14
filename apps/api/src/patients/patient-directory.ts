import { createHash } from 'node:crypto';
import { DomainError, normalisePatientIdentity } from '@beauessence/domain';
import type { Firestore } from 'firebase-admin/firestore';

import type { PatientIntake } from '@beauessence/contracts';
import type { AppointmentRecord } from '../appointments/appointment.repository-port.js';

export const PATIENT_COLLECTIONS = {
  patients: 'patients',
  lookupIndex: 'patient_lookup_index',
  returnSessions: 'return_sessions',
  followUpState: 'patient_follow_up_states'
} as const;

const RETURN_SESSION_MS = 15 * 60 * 1000;

export function opaqueLookupIdentity(phone: string, birthDate: string): string {
  const digits = phone.replace(/\D/g, '');
  return `rlk_${createHash('sha256')
    .update(`return:${digits}|${birthDate}`)
    .digest('hex')
    .slice(0, 32)}`;
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

function parseBirthDate(birthDate: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(birthDate) || /^--\d{2}-\d{2}$/.test(birthDate)
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

function toListRecord(
  id: string,
  data: Record<string, unknown> | undefined
): AppointmentRecord {
  return {
    appointmentId: id,
    patientId: stringField(data, 'patientId') ?? '',
    slotId: stringField(data, 'slotId') ?? '',
    bookingKind:
      data?.['bookingKind'] === 'follow_up' ? 'follow_up' : 'initial',
    status: (data?.['status'] ?? 'confirmed') as AppointmentRecord['status'],
    ...(typeof data?.['startsAt'] === 'string'
      ? { startsAt: data['startsAt'] }
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
    const identity = normalisePatientIdentity(
      {
        name: intake.name,
        phone: intake.phone,
        birthDate: intake.birthDate,
        nationalId: intake.nationalId,
        passportNumber: intake.passportNumber,
        hasNhiCard: intake.hasNhiCard === true
      },
      Date.parse(nowUtc)
    );
    const lookupKey = opaqueLookupIdentity(identity.phone, identity.birthDate);
    const lookupRef = this.db
      .collection(PATIENT_COLLECTIONS.lookupIndex)
      .doc(lookupKey);
    return this.db.runTransaction(async (transaction) => {
      const existing = await transaction.get(lookupRef);
      if (existing.exists) {
        const patientId = stringField(existing.data(), 'patientId');
        if (typeof patientId === 'string' && patientId !== '') return patientId;
      }
      const patientId = allocateId();
      transaction.create(lookupRef, {
        patientId,
        createdAt: nowUtc
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
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 20) return undefined;
    if (!parseBirthDate(birthDate)) return undefined;
    const lookupKey = opaqueLookupIdentity(digits, birthDate);
    const lookup = await this.db
      .collection(PATIENT_COLLECTIONS.lookupIndex)
      .doc(lookupKey)
      .get();
    const patientId = stringField(lookup.data(), 'patientId');
    if (typeof patientId !== 'string' || patientId === '') return undefined;
    const state = await this.readFollowUpState(patientId);
    if (
      state?.required !== true &&
      state?.activeFollowUpAppointmentId === undefined
    ) {
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
      if (typeof startsAt === 'string') {
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
    return {
      required: data['required'] === true,
      ...(typeof data['sourceAppointmentId'] === 'string'
        ? { sourceAppointmentId: data['sourceAppointmentId'] }
        : {}),
      ...(typeof data['sourceFollowUpId'] === 'string'
        ? { sourceFollowUpId: data['sourceFollowUpId'] }
        : {}),
      ...(typeof data['activeFollowUpAppointmentId'] === 'string'
        ? { activeFollowUpAppointmentId: data['activeFollowUpAppointmentId'] }
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
      .limit(limit)
      .get();
    return snapshot.docs.map((doc) =>
      toListRecord(doc.id, doc.data() as Record<string, unknown>)
    );
  }

  public async listClinic(limit: number): Promise<AppointmentRecord[]> {
    const snapshot = await this.db
      .collection('appointments')
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
  public readonly lookup = new Map<string, string>();
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
    const identity = normalisePatientIdentity(
      {
        name: intake.name,
        phone: intake.phone,
        birthDate: intake.birthDate,
        nationalId: intake.nationalId,
        passportNumber: intake.passportNumber,
        hasNhiCard: intake.hasNhiCard === true
      },
      Date.parse(nowUtc)
    );
    const lookupKey = opaqueLookupIdentity(identity.phone, identity.birthDate);
    const existing = this.lookup.get(lookupKey);
    if (existing !== undefined) return existing;
    const patientId = allocateId();
    this.lookup.set(lookupKey, patientId);
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
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 20) return undefined;
    if (!parseBirthDate(birthDate)) return undefined;
    const patientId = this.lookup.get(opaqueLookupIdentity(digits, birthDate));
    if (patientId === undefined) return undefined;
    const state = this.followUp.get(patientId);
    if (
      state?.required !== true &&
      state?.activeFollowUpAppointmentId === undefined
    ) {
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
      if (appointment?.startsAt !== undefined) {
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
    return this.followUp.get(patientId);
  }

  public async listByPatient(
    patientId: string,
    limit: number
  ): Promise<AppointmentRecord[]> {
    await Promise.resolve();
    return this.appointments
      .filter((item) => item.patientId === patientId)
      .slice(0, limit);
  }

  public async listClinic(limit: number): Promise<AppointmentRecord[]> {
    await Promise.resolve();
    return this.appointments.slice(0, limit);
  }
}
