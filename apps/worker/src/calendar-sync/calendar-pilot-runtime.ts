import { createHash, randomUUID } from 'node:crypto';

import type {
  CollectionReference,
  DocumentSnapshot,
  Firestore,
  Transaction
} from 'firebase-admin/firestore';

import {
  CalendarPilotJobLeaseRecordSchema,
  CalendarPilotJobSelectionRecordSchema,
  CalendarPilotLeaseConfigurationRecordSchema,
  CalendarPilotMirrorReviewRecordSchema,
  CalendarPilotRuntimeAppointmentRecordSchema,
  CalendarPilotRuntimeConfigurationRecordSchema,
  CalendarPilotRuntimeJobRecordSchema,
  parseCalendarPilotRecord,
  type CalendarPilotRuntimeJobRecord
} from '@beauessence/contracts';
import {
  formatBusyTitle,
  formatSyntheticAppointmentTitle,
  isUtcIsoTimestamp,
  parseCalendarEntry,
  type CalendarBookingKind,
  type CalendarServiceId,
  type ParsedCalendarEntry
} from '@beauessence/domain';
import {
  createCloudAdcTokenProvider,
  createServiceAccountTokenProvider
} from '../google-calendar.js';
import { FirestoreCalendarSyncRepository } from './firestore-calendar-sync.repository.js';
import {
  GoogleCalendarEventReader,
  GoogleCalendarEventWriter,
  GoogleCalendarSyncError,
  type CalendarWriteEvent
} from './google-sync-client.js';
import { CalendarSyncEngine, type CalendarSyncSummary } from './sync-engine.js';
import {
  ACTIVATION_COPY_PAGES,
  activationCopyPageId,
  assertSameCalendarActivationProgress,
  parseCalendarActivationProgress,
  runCalendarActivationStep
} from './calendar-pilot-activation.js';
import {
  assertCalendarPilotWorkerLease,
  CalendarPilotLeaseLostError,
  type CalendarPilotWorkerLease
} from './calendar-pilot-worker-lease.js';

const READ_SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly';
const WRITE_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
export const C1_SYNTHETIC_CALENDAR_SOURCE_ID = 'c1_synthetic_calendar';
export const C1_SYNTHETIC_ADC_MODE = 'C1_SYNTHETIC_ADC';
export const C1_SYNTHETIC_PROJECT_ID = 'beauessence-clinic-stg-c1a01';
const LEASE_MS = 4 * 60_000;
const JOB_BATCH_SIZE = 20;

interface SourceSecret {
  readonly calendarId: string;
}

type SourceRegistry = Readonly<Record<string, SourceSecret>>;

type PilotJob = CalendarPilotRuntimeJobRecord;

function leaseExpired(
  job: Pick<PilotJob, 'leaseExpiresAt'>,
  now: string
): boolean {
  return (
    typeof job.leaseExpiresAt !== 'string' ||
    Date.parse(job.leaseExpiresAt) <= Date.parse(now)
  );
}

/**
 * A pending job is due when its backoff has elapsed. Same convention as
 * `isDue` in packages/domain/src/outbox.ts: a missing `nextAttemptAt` (every
 * job the API enqueues, and any job never retried) is due immediately, so this
 * cannot be a `nextAttemptAt <= now` range query — Firestore would drop those
 * documents. A present but unreadable value fails closed (never due).
 */
function backoffElapsed(
  job: Pick<PilotJob, 'nextAttemptAt'>,
  now: string
): boolean {
  const nextAttemptAt = job.nextAttemptAt;
  if (nextAttemptAt === undefined || nextAttemptAt === null) return true;
  return (
    typeof nextAttemptAt === 'string' &&
    isUtcIsoTimestamp(nextAttemptAt) &&
    Date.parse(nextAttemptAt) <= Date.parse(now)
  );
}

/**
 * Oldest-first pending jobs whose backoff has elapsed. Backed-off jobs are
 * skipped while paging, so a full page of them cannot hide due work behind it.
 */
async function duePendingJobs(
  collection: CollectionReference,
  now: string,
  limit: number
): Promise<DocumentSnapshot[]> {
  const due: DocumentSnapshot[] = [];
  let cursor: DocumentSnapshot | undefined;
  while (due.length < limit) {
    const base = collection
      .where('status', '==', 'pending')
      .orderBy('createdAt', 'asc')
      .limit(JOB_BATCH_SIZE);
    const page = await (
      cursor === undefined ? base : base.startAfter(cursor)
    ).get();
    for (const document of page.docs) {
      if (
        due.length < limit &&
        backoffElapsed(
          parseCalendarPilotRecord(
            CalendarPilotJobSelectionRecordSchema,
            document.data()
          ),
          now
        )
      )
        due.push(document);
    }
    if (page.docs.length < JOB_BATCH_SIZE) break;
    cursor = page.docs[page.docs.length - 1];
  }
  return due;
}

/**
 * Claims due pending work and reclaims processing work whose worker lease
 * expired. Each candidate is re-read in a transaction so two Worker instances
 * cannot take the same external effect concurrently, and the backoff is
 * re-checked there against the authoritative document.
 */
export async function claimCalendarPilotJobs(
  db: Firestore,
  owner: string,
  now: string,
  limit = JOB_BATCH_SIZE
): Promise<readonly DocumentSnapshot[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > JOB_BATCH_SIZE)
    throw new Error('Calendar pilot job claim limit is invalid.');
  const collection = db.collection('calendar_pilot_outbox');
  const [expiredProcessing, pending] = await Promise.all([
    collection
      .where('status', '==', 'processing')
      .where('leaseExpiresAt', '<=', now)
      .orderBy('leaseExpiresAt', 'asc')
      .limit(limit)
      .get(),
    duePendingJobs(collection, now, limit)
  ]);
  const candidates = [...expiredProcessing.docs, ...pending].slice(0, limit);
  const claimed: DocumentSnapshot[] = [];
  for (const candidate of candidates) {
    const document = await db.runTransaction(async (transaction) => {
      const current = await transaction.get(candidate.ref);
      if (!current.exists) return undefined;
      const job = parseCalendarPilotRecord(
        CalendarPilotRuntimeJobRecordSchema,
        current.data()
      );
      if (
        !(job.status === 'pending' && backoffElapsed(job, now)) &&
        !(job.status === 'processing' && leaseExpired(job, now))
      )
        return undefined;
      transaction.update(current.ref, {
        status: 'processing',
        leaseOwner: owner,
        leaseExpiresAt: new Date(Date.parse(now) + LEASE_MS).toISOString()
      });
      return current;
    });
    if (document !== undefined) claimed.push(document);
  }
  return claimed;
}

interface PilotLeaseContext extends CalendarPilotWorkerLease {
  readonly document?: DocumentSnapshot;
}

interface StoredAppointment {
  readonly patientCode: string;
  readonly bookingKind: CalendarBookingKind;
  readonly serviceId: CalendarServiceId;
  readonly startsAt: string;
  readonly endsAt: string;
}

export interface StoredMirror {
  readonly externalEventId: string;
  readonly etag: string;
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

export type CalendarPilotRuntimeConfiguration =
  | {
      readonly auth: 'cloud_adc';
      readonly pseudonymKey: string;
      readonly sources: SourceRegistry;
    }
  | {
      readonly auth: 'service_account_json';
      readonly pseudonymKey: string;
      readonly sources: SourceRegistry;
      readonly readerCredentials: string;
      readonly writerCredentials: string;
    };

/**
 * Resolves the isolated C1 keyless runtime separately from the retained
 * legacy two-source CAL-PILOT mode. C1 accepts one allowlisted synthetic
 * Calendar and refuses every user-managed credential path.
 */
export function resolveCalendarPilotRuntimeConfiguration(
  environment: NodeJS.ProcessEnv
): CalendarPilotRuntimeConfiguration {
  const pseudonymKey = environment['CALENDAR_PILOT_PSEUDONYM_KEY'];
  if (pseudonymKey === undefined || pseudonymKey.length < 32)
    throw new Error(
      'CALENDAR_PILOT_PSEUDONYM_KEY must be at least 32 characters.'
    );

  if (environment['CALENDAR_PILOT_RUNTIME_MODE'] === C1_SYNTHETIC_ADC_MODE) {
    if (environment['GOOGLE_CLOUD_PROJECT'] !== C1_SYNTHETIC_PROJECT_ID)
      throw new Error('C1 Calendar sync requires the isolated C1 project.');
    if (environment['GOOGLE_CALENDAR_AUTH'] !== 'CLOUD_ADC')
      throw new Error(
        'C1 Calendar sync requires GOOGLE_CALENDAR_AUTH=CLOUD_ADC.'
      );
    if (
      environment['GOOGLE_APPLICATION_CREDENTIALS'] !== undefined ||
      environment['GOOGLE_SERVICE_ACCOUNT_JSON'] !== undefined ||
      environment['CALENDAR_PILOT_READER_SERVICE_ACCOUNT_JSON'] !== undefined ||
      environment['CALENDAR_PILOT_WRITER_SERVICE_ACCOUNT_JSON'] !== undefined
    )
      throw new Error(
        'C1 Calendar sync forbids user-managed service-account credentials.'
      );
    const calendarId = environment['GOOGLE_CALENDAR_ID'];
    if (calendarId === undefined || calendarId.trim() === '')
      throw new Error('C1 Calendar sync requires GOOGLE_CALENDAR_ID.');
    return {
      auth: 'cloud_adc',
      pseudonymKey,
      sources: {
        [C1_SYNTHETIC_CALENDAR_SOURCE_ID]: {
          calendarId: calendarId.trim()
        }
      }
    };
  }

  if (environment['CALENDAR_PILOT_RUNTIME_MODE'] !== undefined)
    throw new Error('Unknown Calendar pilot runtime mode.');

  const readerCredentials =
    environment['CALENDAR_PILOT_READER_SERVICE_ACCOUNT_JSON'];
  const writerCredentials =
    environment['CALENDAR_PILOT_WRITER_SERVICE_ACCOUNT_JSON'];
  if (readerCredentials === undefined || writerCredentials === undefined)
    throw new Error('CAL-PILOT reader and writer credentials are required.');
  return {
    auth: 'service_account_json',
    pseudonymKey,
    sources: parseSourceRegistry(environment['CALENDAR_PILOT_SOURCE_MAP_JSON']),
    readerCredentials,
    writerCredentials
  };
}

function safeFailureCode(error: unknown): string {
  if (error instanceof Error && error.name === 'CalendarSyncTokenExpiredError')
    return 'sync_token_expired';
  if (error instanceof Error && error.name === 'GoogleCalendarSyncError')
    return 'calendar_api_error';
  return 'worker_error';
}

function storedAppointment(value: unknown): StoredAppointment {
  return parseCalendarPilotRecord(
    CalendarPilotRuntimeAppointmentRecordSchema,
    value
  );
}

function storedMirror(value: unknown): StoredMirror {
  const data = parseCalendarPilotRecord(
    CalendarPilotMirrorReviewRecordSchema,
    value
  );
  if (!data.parsed.ok) throw new Error('Calendar mirror record is invalid.');
  return {
    externalEventId: data.externalEventId,
    etag: data.etag,
    parsed: data.parsed,
    ...(data.linkId === undefined ? {} : { linkId: data.linkId })
  };
}

export function calendarWriteEventForMirror(
  mirror: StoredMirror,
  fallbackLinkId: string
): CalendarWriteEvent {
  const parsed = mirror.parsed;
  const common = {
    eventId: mirror.externalEventId,
    title:
      parsed.kind === 'appointment'
        ? formatSyntheticAppointmentTitle(parsed)
        : formatBusyTitle(parsed.busyReason),
    linkId: mirror.linkId ?? fallbackLinkId
  };
  return parsed.kind === 'busy' && parsed.allDay === true
    ? {
        ...common,
        allDay: true,
        startDate: parsed.startDate as string,
        endDate: parsed.endDate as string
      }
    : {
        ...common,
        startsAt: parsed.startsAt,
        endsAt: parsed.endsAt
      };
}

export function calendarWriteEventForConfirmedAppointment(
  mirror: StoredMirror,
  appointmentValue: unknown,
  localRecordId: string
): CalendarWriteEvent {
  if (
    localRecordId.trim() === '' ||
    mirror.linkId !== localRecordId ||
    mirror.parsed.kind !== 'appointment' ||
    typeof appointmentValue !== 'object' ||
    appointmentValue === null ||
    Array.isArray(appointmentValue)
  )
    throw new Error('Calendar restore link is invalid.');
  const appointmentRecord = appointmentValue as Record<string, unknown>;
  if (
    appointmentRecord['appointmentId'] !== localRecordId ||
    appointmentRecord['status'] !== 'confirmed'
  )
    throw new Error('Confirmed synthetic appointment is missing or changed.');
  const appointment = storedAppointment(appointmentRecord);
  return {
    eventId: mirror.externalEventId,
    title: formatSyntheticAppointmentTitle({
      patientCode: appointment.patientCode,
      bookingKind: appointment.bookingKind,
      serviceId: appointment.serviceId
    }),
    startsAt: appointment.startsAt,
    endsAt: appointment.endsAt,
    linkId: localRecordId
  };
}

export function assertExpectedMirrorEtag(
  mirror: StoredMirror,
  expectedEtag: string | undefined
): asserts expectedEtag is string {
  if (
    typeof expectedEtag !== 'string' ||
    expectedEtag.trim() === '' ||
    mirror.etag !== expectedEtag
  )
    throw new Error('Calendar event version is stale.');
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
  private readonly pseudonymKey: string;
  private readonly sources: SourceRegistry;
  private readonly readToken: () => Promise<string>;
  private readonly writeToken: () => Promise<string>;

  public constructor(
    private readonly db: Firestore,
    environment: NodeJS.ProcessEnv = process.env,
    private readonly clock: () => string = () => new Date().toISOString()
  ) {
    const configuration = resolveCalendarPilotRuntimeConfiguration(environment);
    this.pseudonymKey = configuration.pseudonymKey;
    this.repository = new FirestoreCalendarSyncRepository(
      db,
      configuration.pseudonymKey
    );
    this.sources = configuration.sources;
    if (configuration.auth === 'cloud_adc') {
      this.readToken = createCloudAdcTokenProvider(
        fetch,
        Date.now,
        30_000,
        READ_SCOPE
      );
      this.writeToken = createCloudAdcTokenProvider(
        fetch,
        Date.now,
        30_000,
        WRITE_SCOPE
      );
    } else {
      this.readToken = createServiceAccountTokenProvider(
        configuration.readerCredentials,
        fetch,
        Date.now,
        30_000,
        READ_SCOPE
      );
      this.writeToken = createServiceAccountTokenProvider(
        configuration.writerCredentials,
        fetch,
        Date.now,
        30_000,
        WRITE_SCOPE
      );
    }
  }

  private withLease(
    lease: PilotLeaseContext,
    write?: (
      transaction: Transaction,
      now: string,
      currentJob?: Record<string, unknown>
    ) => void
  ): Promise<() => void> {
    return this.db.runTransaction(async (transaction) => {
      const configuration = await transaction.get(
        this.db.collection('calendar_pilot_configuration').doc('active')
      );
      const job =
        lease.document === undefined
          ? undefined
          : await transaction.get(lease.document.ref);
      if (!configuration.exists || (job !== undefined && !job.exists))
        throw new CalendarPilotLeaseLostError();
      const configurationData = parseCalendarPilotRecord(
        CalendarPilotLeaseConfigurationRecordSchema,
        configuration.data()
      );
      const jobData =
        job === undefined
          ? undefined
          : parseCalendarPilotRecord(
              CalendarPilotJobLeaseRecordSchema,
              job.data()
            );
      const now = assertCalendarPilotWorkerLease(
        configurationData,
        lease,
        jobData
      );
      write?.(transaction, now, jobData);
      return () => {
        assertCalendarPilotWorkerLease(configurationData, lease, jobData);
      };
    });
  }

  private guardedFetch(lease: PilotLeaseContext): typeof fetch {
    return async (input, init) => {
      // Tokens may be slow: check here, after the client obtains its token.
      const beforeDispatch = await this.withLease(lease);
      // Even the transaction reply may arrive after the checked deadline.
      beforeDispatch();
      const response = await fetch(input, init);
      const afterResponse = await this.withLease(lease);
      afterResponse();
      return response;
    };
  }

  private source(sourceId: string): SourceSecret {
    const source = this.sources[sourceId];
    if (source === undefined)
      throw new Error('Calendar source is not allowlisted.');
    return source;
  }

  private reader(
    sourceId: string,
    lease: PilotLeaseContext
  ): GoogleCalendarEventReader {
    return new GoogleCalendarEventReader(
      this.source(sourceId).calendarId,
      this.readToken,
      this.guardedFetch(lease)
    );
  }

  private writer(
    sourceId: string,
    lease: PilotLeaseContext
  ): GoogleCalendarEventWriter {
    return new GoogleCalendarEventWriter(
      this.source(sourceId).calendarId,
      this.writeToken,
      this.guardedFetch(lease)
    );
  }

  private async acquire(
    owner: string,
    now: string
  ): Promise<number | undefined> {
    if (!Number.isFinite(Date.parse(now)))
      throw new CalendarPilotLeaseLostError();
    const ref = this.db
      .collection('calendar_pilot_configuration')
      .doc('active');
    return this.db.runTransaction(async (transaction) => {
      const document = await transaction.get(ref);
      if (!document.exists)
        throw new Error('CAL-PILOT configuration is missing.');
      const configuration = parseCalendarPilotRecord(
        CalendarPilotRuntimeConfigurationRecordSchema,
        document.data()
      );
      const expiresAt = configuration['expiresAt'];
      if (
        typeof expiresAt !== 'string' ||
        !isUtcIsoTimestamp(expiresAt) ||
        Date.parse(now) >= Date.parse(expiresAt)
      ) {
        transaction.update(ref, {
          health: 'expired',
          inboundEnabled: false,
          outboundEnabled: false
        });
        return undefined;
      }
      if (
        configuration['inboundEnabled'] !== true ||
        configuration['outboundEnabled'] !== true
      )
        return undefined;
      const leaseExpiresAt = configuration['workerLeaseExpiresAt'];
      if (
        leaseExpiresAt !== undefined &&
        leaseExpiresAt !== null &&
        (typeof leaseExpiresAt !== 'string' ||
          !isUtcIsoTimestamp(leaseExpiresAt) ||
          Date.parse(leaseExpiresAt) > Date.parse(now))
      )
        return undefined;
      const version = configuration['version'];
      if (
        typeof version !== 'number' ||
        !Number.isSafeInteger(version) ||
        version < 0
      )
        throw new CalendarPilotLeaseLostError();
      transaction.update(ref, {
        workerLeaseOwner: owner,
        workerLeaseExpiresAt: new Date(
          Date.parse(now) + LEASE_MS
        ).toISOString(),
        health: 'syncing'
      });
      return version;
    });
  }

  private async release(owner: string): Promise<void> {
    const ref = this.db
      .collection('calendar_pilot_configuration')
      .doc('active');
    await this.db.runTransaction(async (transaction) => {
      const document = await transaction.get(ref);
      if (!document.exists) return;
      const configuration = parseCalendarPilotRecord(
        CalendarPilotRuntimeConfigurationRecordSchema,
        document.data()
      );
      if (configuration.workerLeaseOwner !== owner) return;
      transaction.update(ref, {
        workerLeaseOwner: null,
        workerLeaseExpiresAt: null
      });
    });
  }

  private async completeJob(
    document: DocumentSnapshot,
    lease: PilotLeaseContext,
    status: 'completed' | 'failed' | 'superseded',
    errorCode?: string
  ): Promise<void> {
    await this.withLease({ ...lease, document }, (transaction, now) => {
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
    document: DocumentSnapshot,
    lease: PilotLeaseContext,
    attemptCount: number,
    errorCode: string
  ): Promise<void> {
    await this.withLease({ ...lease, document }, (transaction, now) => {
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
    document: DocumentSnapshot,
    lease: PilotLeaseContext
  ) {
    const now = lease.now();
    if (job.sourceId === undefined)
      throw new Error('Preflight source is missing.');
    const configuration = await this.repository.loadConfiguration();
    const reader = this.reader(job.sourceId, lease);
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
    await this.writer(job.sourceId, lease).verifyWriteAccess(document.id);
    await this.withLease(lease, (transaction, completedAt) =>
      transaction.set(
        this.db.collection('calendar_pilot_preflights').doc(document.id),
        {
          status: 'passed',
          readable: true,
          writable: true,
          scannedEvents,
          validEvents,
          invalidEvents,
          completedAt
        },
        { merge: true }
      )
    );
  }

  private async outbound(
    job: PilotJob,
    lease: PilotLeaseContext
  ): Promise<'completed' | 'superseded' | 'in_progress'> {
    const configuration = await this.repository.loadSourceConfiguration();
    if (job.generation !== configuration.version) return 'superseded';
    const writer = this.writer(configuration.activeSourceId, lease);
    if (job.kind === 'calendar_source_activated') {
      if (job.previousSourceId === undefined || lease.document === undefined)
        throw new Error('Activation source or job is missing.');
      // Two logical source IDs may name the same physical Calendar. Never
      // remove the target Calendar's own projections as an old-source cleanup.
      if (
        this.source(job.previousSourceId).calendarId ===
        this.source(configuration.activeSourceId).calendarId
      )
        return 'superseded';
      const document = lease.document;
      const oldWriter = this.writer(job.previousSourceId, lease);
      return runCalendarActivationStep({
        db: this.db,
        document,
        sourceId: configuration.activeSourceId,
        previousSourceId: job.previousSourceId,
        generation: configuration.version,
        // Persist only opaque bindings, never Calendar IDs from the registry.
        sourceBinding: createHash('sha256')
          .update(this.source(configuration.activeSourceId).calendarId)
          .digest('hex'),
        previousSourceBinding: createHash('sha256')
          .update(this.source(job.previousSourceId).calendarId)
          .digest('hex'),
        now: lease.now,
        progress: job.activationProgress,
        copy: async (localRecordId, data) => {
          const appointment = storedAppointment(data);
          await writer.upsert({
            eventId: calendarEventId(localRecordId),
            title: formatSyntheticAppointmentTitle({
              patientCode: appointment.patientCode,
              bookingKind: appointment.bookingKind,
              serviceId: appointment.serviceId
            }),
            startsAt: appointment.startsAt,
            endsAt: appointment.endsAt,
            linkId: localRecordId
          });
        },
        removeOld: (localRecordId) =>
          oldWriter.remove(calendarEventId(localRecordId)),
        checkpoint: async (change) => {
          await this.withLease(lease, (transaction, _now, currentJob) => {
            assertSameCalendarActivationProgress(
              change.expected,
              currentJob?.['activationProgress']
            );
            const next = parseCalendarActivationProgress(change.next);
            if (next === undefined)
              throw new Error('Activation progress is missing.');
            if (change.receipt !== undefined) {
              const index =
                change.receipt.kind === 'create'
                  ? change.receipt.value.pageIndex
                  : change.receipt.pageIndex;
              const ref = document.ref
                .collection(ACTIVATION_COPY_PAGES)
                .doc(activationCopyPageId(index));
              if (change.receipt.kind === 'create')
                transaction.create(ref, change.receipt.value);
              else transaction.delete(ref);
            }
            transaction.update(document.ref, {
              activationProgress: next,
              ...(change.release
                ? {
                    status: 'pending',
                    leaseOwner: null,
                    leaseExpiresAt: null,
                    nextAttemptAt: null
                  }
                : {})
            });
          });
        }
      });
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
      if (
        job.restoreSource !== undefined &&
        job.restoreSource !== 'confirmed_appointment'
      )
        throw new Error('Calendar restore source is unsupported.');
      let event: CalendarWriteEvent;
      if (job.restoreSource === 'confirmed_appointment') {
        if (
          job.writeMode !== 'update_existing' ||
          job.localRecordId === undefined
        )
          throw new Error('Confirmed appointment restore link is missing.');
        const appointment = await this.db
          .collection('calendar_pilot_appointments')
          .doc(job.localRecordId)
          .get();
        if (!appointment.exists)
          throw new Error('Synthetic appointment is missing.');
        event = calendarWriteEventForConfirmedAppointment(
          data,
          appointment.data(),
          job.localRecordId
        );
      } else {
        event = calendarWriteEventForMirror(data, job.mirrorId);
      }
      if (job.writeMode === 'update_existing') {
        assertExpectedMirrorEtag(data, job.expectedEtag);
        await writer.update(event, job.expectedEtag);
      } else await writer.upsert(event);
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

  private async hasUnfinishedActivation(generation: number): Promise<boolean> {
    // API source activation enqueues one job per generation. Inspect at most
    // two metadata records: duplicates/unknown states fail closed, without
    // scanning history or depending on a pending job being claimable now.
    const jobs = await this.db
      .collection('calendar_pilot_outbox')
      .where('kind', '==', 'calendar_source_activated')
      .where('generation', '==', generation)
      .limit(2)
      .get();
    if (jobs.size > 1) return true;
    return jobs.docs.some((document) => {
      const record = CalendarPilotJobSelectionRecordSchema.safeParse(
        document.data()
      );
      // Preserve the existing admission denial for unreadable activation
      // metadata; never turn an unknown record into a terminal activation.
      if (!record.success) return true;
      const status = record.data.status;
      return status !== 'completed' && status !== 'superseded';
    });
  }

  public async run(now = this.clock()): Promise<CalendarPilotRunSummary> {
    const owner = randomUUID();
    const generation = await this.acquire(owner, now);
    if (generation === undefined)
      return { acquired: false, processedJobs: 0, failedJobs: 0 };
    const lease: PilotLeaseContext = { owner, generation, now: this.clock };
    let processedJobs = 0;
    let failedJobs = 0;
    let activationInProgress = false;
    try {
      await this.withLease(lease);
      const jobs = await claimCalendarPilotJobs(this.db, owner, this.clock());
      for (const document of jobs) {
        const job = parseCalendarPilotRecord(
          CalendarPilotRuntimeJobRecordSchema,
          document.data()
        );
        const jobLease = { ...lease, document };
        try {
          await this.withLease(jobLease);
          if (job.kind === 'calendar_source_preflight')
            await this.preflight(job, document, jobLease);
          const status =
            job.kind === 'calendar_source_preflight'
              ? 'completed'
              : await this.outbound(job, jobLease);
          if (status === 'in_progress') {
            activationInProgress = true;
            continue;
          }
          await this.completeJob(document, lease, status);
          processedJobs += 1;
        } catch (error) {
          if (error instanceof CalendarPilotLeaseLostError) throw error;
          const nextAttempt = (job.attemptCount ?? 0) + 1;
          if (
            error instanceof GoogleCalendarSyncError &&
            error.retryable &&
            nextAttempt < 5
          )
            await this.retryJob(
              document,
              lease,
              nextAttempt,
              safeFailureCode(error)
            );
          else {
            await this.completeJob(
              document,
              lease,
              'failed',
              safeFailureCode(error)
            );
            failedJobs += 1;
          }
        }
      }
      // Do not run inbound sync or advertise its healthy checkpoint while the
      // current source switch is still copying/cleaning acknowledged pages.
      if (
        activationInProgress ||
        (await this.hasUnfinishedActivation(generation))
      )
        return { acquired: true, processedJobs, failedJobs };
      await this.withLease(lease);
      const configuration = await this.repository.loadConfiguration();
      let sync;
      try {
        sync = await new CalendarSyncEngine(
          this.reader(configuration.activeSourceId, lease),
          new FirestoreCalendarSyncRepository(this.db, this.pseudonymKey, lease)
        ).run(this.clock());
      } catch (error) {
        if (!(error instanceof CalendarPilotLeaseLostError))
          await this.withLease(lease, (transaction) => {
            transaction.update(
              this.db.collection('calendar_pilot_configuration').doc('active'),
              { health: 'degraded', lastErrorCode: safeFailureCode(error) }
            );
          });
        throw error;
      }
      return { acquired: true, processedJobs, failedJobs, sync };
    } finally {
      await this.release(owner);
    }
  }
}
