import { createHash, randomUUID } from 'node:crypto';

import type {
  Firestore,
  QueryDocumentSnapshot
} from 'firebase-admin/firestore';

import {
  formatSyntheticAppointmentTitle,
  parseCalendarEntry,
  type CalendarBookingKind,
  type CalendarServiceId,
  type ParsedCalendarEntry
} from '@beauessence/domain';
import { createServiceAccountTokenProvider } from '../google-calendar.js';
import { FirestoreCalendarSyncRepository } from './firestore-calendar-sync.repository.js';
import {
  GoogleCalendarEventReader,
  GoogleCalendarEventWriter,
  GoogleCalendarSyncError
} from './google-sync-client.js';
import { CalendarSyncEngine, type CalendarSyncSummary } from './sync-engine.js';

const READ_SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly';
const WRITE_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const LEASE_MS = 4 * 60_000;

interface SourceSecret {
  readonly calendarId: string;
}

type SourceRegistry = Readonly<Record<string, SourceSecret>>;

interface PilotJob {
  readonly kind:
    | 'calendar_source_preflight'
    | 'calendar_projection_upsert'
    | 'calendar_projection_delete'
    | 'calendar_projection_restore'
    | 'calendar_source_activated';
  readonly status:
    'pending' | 'processing' | 'completed' | 'failed' | 'superseded';
  readonly sourceId?: string;
  readonly previousSourceId?: string;
  readonly localRecordId?: string;
  readonly mirrorId?: string;
  readonly generation?: number;
  readonly leaseOwner?: string;
  readonly leaseExpiresAt?: string;
  readonly attemptCount?: number;
}

interface StoredAppointment {
  readonly patientCode: string;
  readonly bookingKind: CalendarBookingKind;
  readonly serviceId: CalendarServiceId;
  readonly startsAt: string;
  readonly endsAt: string;
}

interface StoredMirror {
  readonly externalEventId: string;
  readonly parsed: Extract<ParsedCalendarEntry, { readonly ok: true }>;
  readonly linkId?: string;
}

export interface CalendarPilotRunSummary {
  readonly acquired: boolean;
  readonly processedJobs: number;
  readonly failedJobs: number;
  readonly sync?: CalendarSyncSummary;
}

function parseSourceRegistry(raw: string | undefined): SourceRegistry {
  if (raw === undefined || raw.trim() === '')
    throw new Error('CALENDAR_PILOT_SOURCE_MAP_JSON is required.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('CALENDAR_PILOT_SOURCE_MAP_JSON is not valid JSON.');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    throw new Error('CALENDAR_PILOT_SOURCE_MAP_JSON must be an object.');
  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length !== 2)
    throw new Error(
      'CAL-PILOT requires exactly two allowlisted Calendar sources.'
    );
  const registry: Record<string, SourceSecret> = {};
  for (const [sourceId, value] of entries) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(sourceId))
      throw new Error('CAL-PILOT source ID is invalid.');
    if (typeof value !== 'object' || value === null || Array.isArray(value))
      throw new Error('CAL-PILOT source entry is invalid.');
    const calendarId = (value as Record<string, unknown>)['calendarId'];
    if (typeof calendarId !== 'string' || calendarId.trim() === '')
      throw new Error('CAL-PILOT source calendar ID is missing.');
    registry[sourceId] = { calendarId: calendarId.trim() };
  }
  return registry;
}

function safeFailureCode(error: unknown): string {
  if (error instanceof Error && error.name === 'CalendarSyncTokenExpiredError')
    return 'sync_token_expired';
  if (error instanceof Error && error.name === 'GoogleCalendarSyncError')
    return 'calendar_api_error';
  return 'worker_error';
}

function storedAppointment(value: unknown): StoredAppointment {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Synthetic appointment record is invalid.');
  const data = value as Record<string, unknown>;
  if (
    typeof data['patientCode'] !== 'string' ||
    !['initial', 'follow_up'].includes(String(data['bookingKind'])) ||
    !['service_snoring', 'service_aesthetic'].includes(
      String(data['serviceId'])
    ) ||
    typeof data['startsAt'] !== 'string' ||
    typeof data['endsAt'] !== 'string'
  )
    throw new Error('Synthetic appointment record is invalid.');
  return data as unknown as StoredAppointment;
}

function storedMirror(value: unknown): StoredMirror {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Calendar mirror record is invalid.');
  const data = value as Record<string, unknown>;
  const parsed = data['parsed'];
  if (
    typeof data['externalEventId'] !== 'string' ||
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed) ||
    (parsed as Record<string, unknown>)['ok'] !== true
  )
    throw new Error('Calendar mirror record is invalid.');
  const parsedRecord = parsed as Record<string, unknown>;
  if (
    !['appointment', 'busy'].includes(String(parsedRecord['kind'])) ||
    typeof parsedRecord['displayLabel'] !== 'string' ||
    typeof parsedRecord['startsAt'] !== 'string' ||
    typeof parsedRecord['endsAt'] !== 'string'
  )
    throw new Error('Calendar mirror record is invalid.');
  return {
    externalEventId: data['externalEventId'],
    parsed: parsed as StoredMirror['parsed'],
    ...(typeof data['linkId'] === 'string' ? { linkId: data['linkId'] } : {})
  };
}

function calendarEventId(localRecordId: string): string {
  return `calpilot${createHash('sha256')
    .update(localRecordId)
    .digest('hex')
    .slice(0, 40)}`;
}

/** Private Cloud Run worker; only its service identity receives Calendar secrets. */
export class CalendarPilotRuntime {
  private readonly repository: FirestoreCalendarSyncRepository;
  private readonly sources: SourceRegistry;
  private readonly readToken: () => Promise<string>;
  private readonly writeToken: () => Promise<string>;

  public constructor(
    private readonly db: Firestore,
    environment: NodeJS.ProcessEnv = process.env
  ) {
    const pseudonymKey = environment['CALENDAR_PILOT_PSEUDONYM_KEY'];
    if (pseudonymKey === undefined)
      throw new Error('CALENDAR_PILOT_PSEUDONYM_KEY is required.');
    this.repository = new FirestoreCalendarSyncRepository(db, pseudonymKey);
    this.sources = parseSourceRegistry(
      environment['CALENDAR_PILOT_SOURCE_MAP_JSON']
    );
    const readerCredentials =
      environment['CALENDAR_PILOT_READER_SERVICE_ACCOUNT_JSON'];
    const writerCredentials =
      environment['CALENDAR_PILOT_WRITER_SERVICE_ACCOUNT_JSON'];
    if (readerCredentials === undefined || writerCredentials === undefined)
      throw new Error('CAL-PILOT reader and writer credentials are required.');
    this.readToken = createServiceAccountTokenProvider(
      readerCredentials,
      fetch,
      Date.now,
      30_000,
      READ_SCOPE
    );
    this.writeToken = createServiceAccountTokenProvider(
      writerCredentials,
      fetch,
      Date.now,
      30_000,
      WRITE_SCOPE
    );
  }

  private source(sourceId: string): SourceSecret {
    const source = this.sources[sourceId];
    if (source === undefined)
      throw new Error('Calendar source is not allowlisted.');
    return source;
  }

  private reader(sourceId: string): GoogleCalendarEventReader {
    return new GoogleCalendarEventReader(
      this.source(sourceId).calendarId,
      this.readToken
    );
  }

  private writer(sourceId: string): GoogleCalendarEventWriter {
    return new GoogleCalendarEventWriter(
      this.source(sourceId).calendarId,
      this.writeToken
    );
  }

  private async acquire(owner: string, now: string): Promise<boolean> {
    const ref = this.db
      .collection('calendar_pilot_configuration')
      .doc('active');
    return this.db.runTransaction(async (transaction) => {
      const document = await transaction.get(ref);
      if (!document.exists)
        throw new Error('CAL-PILOT configuration is missing.');
      const configuration = document.data() as Record<string, unknown>;
      const expiresAt = configuration['expiresAt'];
      if (
        typeof expiresAt !== 'string' ||
        Date.parse(now) >= Date.parse(expiresAt)
      ) {
        transaction.update(ref, {
          health: 'expired',
          inboundEnabled: false,
          outboundEnabled: false
        });
        return false;
      }
      if (
        configuration['inboundEnabled'] !== true ||
        configuration['outboundEnabled'] !== true
      )
        return false;
      const leaseExpiresAt = configuration['workerLeaseExpiresAt'];
      if (
        typeof leaseExpiresAt === 'string' &&
        Date.parse(leaseExpiresAt) > Date.parse(now)
      )
        return false;
      transaction.update(ref, {
        workerLeaseOwner: owner,
        workerLeaseExpiresAt: new Date(
          Date.parse(now) + LEASE_MS
        ).toISOString(),
        health: 'syncing'
      });
      return true;
    });
  }

  private async release(owner: string): Promise<void> {
    const ref = this.db
      .collection('calendar_pilot_configuration')
      .doc('active');
    await this.db.runTransaction(async (transaction) => {
      const document = await transaction.get(ref);
      if (document.data()?.['workerLeaseOwner'] !== owner) return;
      transaction.update(ref, {
        workerLeaseOwner: null,
        workerLeaseExpiresAt: null
      });
    });
  }

  private async claimJobs(owner: string, now: string) {
    const query = this.db
      .collection('calendar_pilot_outbox')
      .where('status', '==', 'pending')
      .orderBy('createdAt', 'asc')
      .limit(20);
    return this.db.runTransaction(async (transaction) => {
      const documents = await transaction.get(query);
      for (const document of documents.docs)
        transaction.update(document.ref, {
          status: 'processing',
          leaseOwner: owner,
          leaseExpiresAt: new Date(Date.parse(now) + LEASE_MS).toISOString()
        });
      return documents.docs;
    });
  }

  private async completeJob(
    document: QueryDocumentSnapshot,
    owner: string,
    status: 'completed' | 'failed' | 'superseded',
    now: string,
    errorCode?: string
  ): Promise<void> {
    await this.db.runTransaction(async (transaction) => {
      const current = await transaction.get(document.ref);
      if (current.data()?.['leaseOwner'] !== owner) return;
      transaction.update(document.ref, {
        status,
        completedAt: now,
        leaseOwner: null,
        leaseExpiresAt: null,
        ...(errorCode === undefined ? {} : { lastErrorCode: errorCode })
      });
    });
  }

  private async retryJob(
    document: QueryDocumentSnapshot,
    owner: string,
    now: string,
    attemptCount: number,
    errorCode: string
  ): Promise<void> {
    await this.db.runTransaction(async (transaction) => {
      const current = await transaction.get(document.ref);
      if (current.data()?.['leaseOwner'] !== owner) return;
      transaction.update(document.ref, {
        status: 'pending',
        attemptCount,
        nextAttemptAt: new Date(
          Date.parse(now) + Math.min(5 * 60_000, 10_000 * 2 ** attemptCount)
        ).toISOString(),
        leaseOwner: null,
        leaseExpiresAt: null,
        lastErrorCode: errorCode
      });
    });
  }

  private async preflight(
    job: PilotJob,
    document: QueryDocumentSnapshot,
    now: string
  ) {
    if (job.sourceId === undefined)
      throw new Error('Preflight source is missing.');
    const configuration = await this.repository.loadConfiguration();
    const reader = this.reader(job.sourceId);
    const baseRequest = {
      timeMin: new Date(Date.parse(now) - 30 * 86_400_000).toISOString(),
      timeMax: new Date(Date.parse(now) + 60 * 86_400_000).toISOString()
    };
    let validEvents = 0;
    let invalidEvents = 0;
    let scannedEvents = 0;
    let pageToken;
    do {
      const page = await reader.listEvents({
        ...baseRequest,
        ...(pageToken === undefined ? {} : { pageToken })
      });
      scannedEvents += page.events.length;
      for (const event of page.events) {
        const parsed = parseCalendarEntry(
          event,
          configuration.knownPatientCodes
        );
        if (parsed.ok) validEvents += 1;
        else invalidEvents += 1;
      }
      pageToken = page.nextPageToken;
    } while (pageToken !== undefined);
    await this.writer(job.sourceId).verifyWriteAccess(document.id);
    await this.db.collection('calendar_pilot_preflights').doc(document.id).set(
      {
        status: 'passed',
        readable: true,
        writable: true,
        scannedEvents,
        validEvents,
        invalidEvents,
        completedAt: now
      },
      { merge: true }
    );
  }

  private async outbound(
    job: PilotJob,
    now: string
  ): Promise<'completed' | 'superseded'> {
    const configuration = await this.repository.loadConfiguration();
    if (job.generation !== configuration.version) return 'superseded';
    const writer = this.writer(configuration.activeSourceId);
    if (job.kind === 'calendar_source_activated') {
      if (job.previousSourceId === undefined)
        throw new Error('Previous source is missing.');
      const appointments = await this.db
        .collection('calendar_pilot_appointments')
        .where('status', '==', 'confirmed')
        .where('startsAt', '>=', now)
        .get();
      for (const document of appointments.docs) {
        const appointment = storedAppointment(document.data());
        await writer.upsert({
          eventId: calendarEventId(document.id),
          title: formatSyntheticAppointmentTitle({
            patientCode: appointment.patientCode,
            bookingKind: appointment.bookingKind,
            serviceId: appointment.serviceId
          }),
          startsAt: appointment.startsAt,
          endsAt: appointment.endsAt,
          linkId: document.id
        });
      }
      const oldWriter = this.writer(job.previousSourceId);
      for (const document of appointments.docs)
        await oldWriter.remove(calendarEventId(document.id));
      return 'completed';
    }
    if (job.kind === 'calendar_projection_restore') {
      if (job.mirrorId === undefined)
        throw new Error('Mirror link is missing.');
      const mirror = await this.db
        .collection('calendar_pilot_mirrors')
        .doc(job.mirrorId)
        .get();
      if (!mirror.exists) throw new Error('Mirror is missing.');
      const data = storedMirror(mirror.data());
      const parsed = data.parsed;
      await writer.upsert({
        eventId: data.externalEventId,
        title:
          parsed.kind === 'appointment'
            ? formatSyntheticAppointmentTitle(parsed)
            : `[忙碌] ${parsed.displayLabel.replace(/^忙碌：/, '')}`,
        startsAt: parsed.startsAt,
        endsAt: parsed.endsAt,
        linkId: data.linkId ?? job.mirrorId
      });
      return 'completed';
    }
    if (job.localRecordId === undefined)
      throw new Error('Local record is missing.');
    if (job.kind === 'calendar_projection_delete') {
      await writer.remove(calendarEventId(job.localRecordId));
      return 'completed';
    }
    const appointment = await this.db
      .collection('calendar_pilot_appointments')
      .doc(job.localRecordId)
      .get();
    if (!appointment.exists)
      throw new Error('Synthetic appointment is missing.');
    const data = storedAppointment(appointment.data());
    await writer.upsert({
      eventId: calendarEventId(job.localRecordId),
      title: formatSyntheticAppointmentTitle({
        patientCode: data.patientCode,
        bookingKind: data.bookingKind,
        serviceId: data.serviceId
      }),
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      linkId: job.localRecordId
    });
    return 'completed';
  }

  public async run(
    now = new Date().toISOString()
  ): Promise<CalendarPilotRunSummary> {
    const owner = randomUUID();
    if (!(await this.acquire(owner, now)))
      return { acquired: false, processedJobs: 0, failedJobs: 0 };
    let processedJobs = 0;
    let failedJobs = 0;
    try {
      const jobs = await this.claimJobs(owner, now);
      for (const document of jobs) {
        const job = document.data() as PilotJob;
        try {
          if (job.kind === 'calendar_source_preflight')
            await this.preflight(job, document, now);
          const status =
            job.kind === 'calendar_source_preflight'
              ? 'completed'
              : await this.outbound(job, now);
          await this.completeJob(document, owner, status, now);
          processedJobs += 1;
        } catch (error) {
          const nextAttempt = (job.attemptCount ?? 0) + 1;
          if (
            error instanceof GoogleCalendarSyncError &&
            error.retryable &&
            nextAttempt < 5
          )
            await this.retryJob(
              document,
              owner,
              now,
              nextAttempt,
              safeFailureCode(error)
            );
          else {
            await this.completeJob(
              document,
              owner,
              'failed',
              now,
              safeFailureCode(error)
            );
            failedJobs += 1;
          }
        }
      }
      const configuration = await this.repository.loadConfiguration();
      let sync;
      try {
        sync = await new CalendarSyncEngine(
          this.reader(configuration.activeSourceId),
          this.repository
        ).run(now);
      } catch (error) {
        await this.db
          .collection('calendar_pilot_configuration')
          .doc('active')
          .update({
            health: 'degraded',
            lastErrorCode: safeFailureCode(error)
          });
        throw error;
      }
      return { acquired: true, processedJobs, failedJobs, sync };
    } finally {
      await this.release(owner);
    }
  }
}
