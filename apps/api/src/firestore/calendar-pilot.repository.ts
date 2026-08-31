import { createHash, randomUUID } from 'node:crypto';

import type {
  CalendarAvailabilityResponse,
  CalendarChangeCandidate,
  CalendarEventProjection,
  CalendarSourceCommandResponse,
  CalendarSourcePreflightResponse,
  CalendarSourceSummary,
  CalendarSyncStatus,
  CreateSyntheticAppointmentRequest,
  SyntheticAppointment,
  SyntheticAppointmentCommandResponse,
  SyntheticPatientSummary
} from '@beauessence/contracts';
import {
  formatBusyTitle,
  formatSyntheticAppointmentTitle,
  parseCalendarEntry,
  type ParsedCalendarEntry
} from '@beauessence/domain';
import type {
  DocumentData,
  DocumentSnapshot,
  Firestore,
  Transaction
} from 'firebase-admin/firestore';

import type {
  CalendarCandidateReviewCommand,
  CalendarCandidateCorrectionCommand,
  CalendarPilotRepositoryPort,
  CalendarSourceCommand
} from '../calendar/calendar-pilot.repository-port.js';
import {
  ConflictError,
  ServiceUnavailableError
} from '../platform/errors/api-error.js';

const COLLECTIONS = {
  configuration: 'calendar_pilot_configuration',
  sources: 'calendar_pilot_sources',
  preflights: 'calendar_pilot_preflights',
  candidates: 'calendar_pilot_candidates',
  projections: 'calendar_pilot_projections',
  blocks: 'calendar_pilot_availability_blocks',
  appointments: 'calendar_pilot_appointments',
  patientGuards: 'calendar_pilot_patient_guards',
  patients: 'calendar_pilot_patients',
  idempotency: 'calendar_pilot_idempotency',
  audits: 'calendar_pilot_audit_events',
  outbox: 'calendar_pilot_outbox'
} as const;

interface ConfigurationRecord {
  readonly activeSourceId: string;
  readonly previousSourceId?: string;
  readonly version: number;
  readonly expiresAt: string;
  readonly health: CalendarSyncStatus['health'];
  readonly lastSuccessfulSyncAt: string | null;
  readonly nextScheduledSyncAt: string | null;
  readonly inboundEnabled: boolean;
  readonly outboundEnabled: boolean;
}

interface CandidateRecord extends CalendarChangeCandidate {
  readonly mirrorId: string;
  readonly parsed: ParsedCalendarEntry;
  readonly previousParsed?: ParsedCalendarEntry;
  readonly localRecordId?: string;
}

interface IdempotencyRecord<T> {
  readonly fingerprint: string;
  readonly response: T;
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function documentData<T>(document: DocumentSnapshot): T {
  if (!document.exists) throw new ConflictError();
  return document.data() as T;
}

function assertActive(configuration: ConfigurationRecord, now: string): void {
  if (Date.parse(now) >= Date.parse(configuration.expiresAt))
    throw new ServiceUnavailableError();
}

function assertPilotEnabled(configuration: ConfigurationRecord): void {
  if (!configuration.inboundEnabled || !configuration.outboundEnabled)
    throw new ServiceUnavailableError();
}

function addThirtyMinutes(startsAt: string): string {
  return new Date(Date.parse(startsAt) + 30 * 60_000).toISOString();
}

function validateSyntheticAppointment(
  command: Pick<
    CreateSyntheticAppointmentRequest,
    'patientCode' | 'bookingKind' | 'serviceId' | 'startsAt'
  >
): { readonly startsAt: string; readonly endsAt: string } {
  const endsAt = addThirtyMinutes(command.startsAt);
  const parsed = parseCalendarEntry(
    {
      summary: formatSyntheticAppointmentTitle(command),
      start: { dateTime: command.startsAt },
      end: { dateTime: endsAt }
    },
    new Set([command.patientCode])
  );
  if (!parsed.ok || parsed.kind !== 'appointment') throw new ConflictError();
  return { startsAt: parsed.startsAt, endsAt: parsed.endsAt };
}

function sourceSummary(
  document: DocumentSnapshot,
  configuration: ConfigurationRecord
): CalendarSourceSummary {
  const data = document.data() as DocumentData;
  return {
    sourceId: document.id,
    displayName: String(data['displayName']),
    state:
      document.id === configuration.activeSourceId
        ? 'active'
        : data['state'] === 'error'
          ? 'error'
          : 'standby',
    active: document.id === configuration.activeSourceId,
    previous: document.id === configuration.previousSourceId,
    version: configuration.version,
    lastSyncedAt:
      typeof data['lastSyncedAt'] === 'string' ? data['lastSyncedAt'] : null,
    lastErrorCode:
      typeof data['lastErrorCode'] === 'string' ? data['lastErrorCode'] : null
  };
}

/** Server-only Firestore adapter. Browser rules deny all direct access. */
export class FirestoreCalendarPilotRepository implements CalendarPilotRepositoryPort {
  public constructor(private readonly db: Firestore) {}

  private configurationRef() {
    return this.db.collection(COLLECTIONS.configuration).doc('active');
  }

  private async configuration(): Promise<ConfigurationRecord> {
    return documentData<ConfigurationRecord>(
      await this.configurationRef().get()
    );
  }

  public async getStatus(now: string): Promise<CalendarSyncStatus> {
    const configuration = await this.configuration();
    const [sourceDocument, pending, conflicts] = await Promise.all([
      this.db
        .collection(COLLECTIONS.sources)
        .doc(configuration.activeSourceId)
        .get(),
      this.db
        .collection(COLLECTIONS.candidates)
        .where('status', '==', 'pending')
        .count()
        .get(),
      this.db
        .collection(COLLECTIONS.candidates)
        .where('status', '==', 'conflict')
        .count()
        .get()
    ]);
    const expired = Date.parse(now) >= Date.parse(configuration.expiresAt);
    return {
      health: expired ? 'expired' : configuration.health,
      activeSource: sourceDocument.exists
        ? sourceSummary(sourceDocument, configuration)
        : null,
      lastSuccessfulSyncAt: configuration.lastSuccessfulSyncAt,
      nextScheduledSyncAt: expired ? null : configuration.nextScheduledSyncAt,
      pendingCandidateCount: pending.data().count,
      conflictCount: conflicts.data().count,
      expiresAt: configuration.expiresAt
    };
  }

  public async listSources(): Promise<readonly CalendarSourceSummary[]> {
    const [configuration, sources] = await Promise.all([
      this.configuration(),
      this.db.collection(COLLECTIONS.sources).where('enabled', '==', true).get()
    ]);
    return sources.docs.map((document) =>
      sourceSummary(document, configuration)
    );
  }

  public async listCandidates(): Promise<readonly CalendarChangeCandidate[]> {
    const documents = await this.db
      .collection(COLLECTIONS.candidates)
      .where('status', 'in', ['pending', 'conflict'])
      .orderBy('createdAt', 'asc')
      .limit(100)
      .get();
    return documents.docs.map((document) => {
      const {
        mirrorId: _mirrorId,
        parsed: _parsed,
        previousParsed: _previousParsed,
        localRecordId: _local,
        sourceId: _sourceId,
        ...publicRecord
      } = document.data() as CandidateRecord & { readonly sourceId?: string };
      return publicRecord;
    });
  }

  public async getAvailability(
    now: string
  ): Promise<CalendarAvailabilityResponse> {
    const configuration = await this.configuration();
    assertActive(configuration, now);
    const blocks = await this.db
      .collection(COLLECTIONS.blocks)
      .where('endsAt', '>', now)
      .orderBy('endsAt', 'asc')
      .limit(500)
      .get();
    return {
      generatedAt: now,
      sourceVersion: configuration.version,
      blocks: blocks.docs.map((document) => {
        const data = document.data() as {
          readonly kind: CalendarEventProjection['kind'];
          readonly bookingKind?: CalendarEventProjection['bookingKind'];
          readonly startsAt: string;
          readonly endsAt: string;
          readonly displayLabel: string;
        };
        return {
          blockId: document.id,
          kind: data.kind,
          bookingKind:
            data.kind === 'appointment' ? (data.bookingKind ?? null) : null,
          startsAt: data.startsAt,
          endsAt: data.endsAt,
          displayLabel: data.displayLabel
        };
      })
    };
  }

  public async listSyntheticAppointments(): Promise<
    readonly SyntheticAppointment[]
  > {
    const documents = await this.db
      .collection(COLLECTIONS.appointments)
      .orderBy('startsAt', 'asc')
      .limit(200)
      .get();
    return documents.docs.map(
      (document) => document.data() as SyntheticAppointment
    );
  }

  public async listSyntheticPatients(): Promise<
    readonly SyntheticPatientSummary[]
  > {
    const documents = await this.db
      .collection(COLLECTIONS.patients)
      .where('enabled', '==', true)
      .orderBy('__name__', 'asc')
      .get();
    return documents.docs.map((document) => ({ patientCode: document.id }));
  }

  public async getSourcePreflight(
    preflightId: string
  ): Promise<CalendarSourcePreflightResponse> {
    return documentData<CalendarSourcePreflightResponse>(
      await this.db.collection(COLLECTIONS.preflights).doc(preflightId).get()
    );
  }

  public requestSourcePreflight(
    command: CalendarSourceCommand
  ): Promise<CalendarSourcePreflightResponse> {
    return this.db.runTransaction(async (transaction) => {
      const configuration = documentData<ConfigurationRecord>(
        await transaction.get(this.configurationRef())
      );
      assertActive(configuration, command.occurredAt);
      assertPilotEnabled(configuration);
      const idempotencyRef = this.db
        .collection(COLLECTIONS.idempotency)
        .doc(hash(`${command.actorId}:${command.idempotencyKey}`).slice(0, 40));
      const replay = await transaction.get(idempotencyRef);
      const fingerprint = hash(
        JSON.stringify({
          action: 'source_preflight',
          sourceId: command.sourceId,
          expectedVersion: command.expectedVersion
        })
      );
      if (replay.exists) {
        const record =
          replay.data() as IdempotencyRecord<CalendarSourcePreflightResponse>;
        if (record.fingerprint !== fingerprint) throw new ConflictError();
        return record.response;
      }
      if (configuration.version !== command.expectedVersion)
        throw new ConflictError();
      const sourceRef = this.db
        .collection(COLLECTIONS.sources)
        .doc(command.sourceId);
      const source = await transaction.get(sourceRef);
      if (!source.exists || source.data()?.['enabled'] !== true)
        throw new ConflictError();
      const preflightId = hash(
        `${command.actorId}:${command.idempotencyKey}:preflight`
      ).slice(0, 32);
      const completedAt = command.occurredAt;
      const response: CalendarSourcePreflightResponse = {
        preflightId,
        sourceId: command.sourceId,
        expectedVersion: command.expectedVersion,
        status: 'queued',
        readable: false,
        writable: false,
        scannedEvents: 0,
        validEvents: 0,
        invalidEvents: 0,
        completedAt,
        expiresAt: new Date(Date.parse(completedAt) + 15 * 60_000).toISOString()
      };
      transaction.set(
        this.db.collection(COLLECTIONS.preflights).doc(preflightId),
        response
      );
      transaction.set(this.db.collection(COLLECTIONS.outbox).doc(preflightId), {
        kind: 'calendar_source_preflight',
        sourceId: command.sourceId,
        status: 'pending',
        createdAt: command.occurredAt,
        attemptCount: 0
      });
      transaction.create(
        this.db.collection(COLLECTIONS.audits).doc(randomUUID()),
        {
          action: 'calendar_source_preflight_requested',
          actorId: command.actorId,
          sourceId: command.sourceId,
          occurredAt: command.occurredAt
        }
      );
      transaction.create(idempotencyRef, { fingerprint, response });
      return response;
    });
  }

  public activateSource(
    command: CalendarSourceCommand & { readonly preflightId: string }
  ): Promise<CalendarSourceCommandResponse> {
    return this.switchSource(command, command.sourceId);
  }

  public rollbackSource(
    command: Omit<CalendarSourceCommand, 'sourceId'> & {
      readonly preflightId: string;
    }
  ): Promise<CalendarSourceCommandResponse> {
    return this.switchSource(command, undefined);
  }

  private switchSource(
    command: Omit<CalendarSourceCommand, 'sourceId'> & {
      readonly sourceId?: string;
      readonly preflightId: string;
    },
    requestedSourceId: string | undefined
  ): Promise<CalendarSourceCommandResponse> {
    return this.db.runTransaction(async (transaction) => {
      const configuration = documentData<ConfigurationRecord>(
        await transaction.get(this.configurationRef())
      );
      assertActive(configuration, command.occurredAt);
      assertPilotEnabled(configuration);
      const idempotencyRef = this.db
        .collection(COLLECTIONS.idempotency)
        .doc(hash(`${command.actorId}:${command.idempotencyKey}`).slice(0, 40));
      const replay = await transaction.get(idempotencyRef);
      const fingerprint = hash(
        JSON.stringify({
          action:
            requestedSourceId === undefined
              ? 'source_rollback'
              : 'source_activate',
          requestedSourceId: requestedSourceId ?? null,
          expectedVersion: command.expectedVersion,
          preflightId: command.preflightId
        })
      );
      if (replay.exists) {
        const record =
          replay.data() as IdempotencyRecord<CalendarSourceCommandResponse>;
        if (record.fingerprint !== fingerprint) throw new ConflictError();
        return record.response;
      }
      if (configuration.version !== command.expectedVersion)
        throw new ConflictError();
      const sourceId = requestedSourceId ?? configuration.previousSourceId;
      if (sourceId === undefined) throw new ConflictError();
      const [source, preflight] = await Promise.all([
        transaction.get(this.db.collection(COLLECTIONS.sources).doc(sourceId)),
        transaction.get(
          this.db.collection(COLLECTIONS.preflights).doc(command.preflightId)
        )
      ]);
      const preflightData =
        documentData<CalendarSourcePreflightResponse>(preflight);
      if (
        !source.exists ||
        source.data()?.['enabled'] !== true ||
        preflightData.sourceId !== sourceId ||
        preflightData.expectedVersion !== command.expectedVersion ||
        preflightData.status !== 'passed' ||
        !preflightData.readable ||
        !preflightData.writable ||
        Date.parse(command.occurredAt) >= Date.parse(preflightData.expiresAt)
      )
        throw new ConflictError();
      const next: ConfigurationRecord = {
        ...configuration,
        activeSourceId: sourceId,
        previousSourceId: configuration.activeSourceId,
        version: configuration.version + 1,
        health: 'syncing',
        lastSuccessfulSyncAt: null
      };
      const previousSource = await transaction.get(
        this.db
          .collection(COLLECTIONS.sources)
          .doc(configuration.activeSourceId)
      );
      transaction.set(this.configurationRef(), next);
      const outboxId = hash(
        `${command.actorId}:${command.idempotencyKey}:activate`
      ).slice(0, 32);
      transaction.set(this.db.collection(COLLECTIONS.outbox).doc(outboxId), {
        kind: 'calendar_source_activated',
        sourceId,
        previousSourceId: configuration.activeSourceId,
        generation: next.version,
        status: 'pending',
        createdAt: command.occurredAt,
        attemptCount: 0
      });
      transaction.create(
        this.db.collection(COLLECTIONS.audits).doc(randomUUID()),
        {
          action: 'calendar_source_activated',
          actorId: command.actorId,
          sourceId,
          previousSourceId: configuration.activeSourceId,
          generation: next.version,
          occurredAt: command.occurredAt
        }
      );
      const response = {
        activeSource: sourceSummary(source, next),
        previousSource: previousSource.exists
          ? sourceSummary(previousSource, next)
          : null,
        version: next.version
      };
      transaction.create(idempotencyRef, { fingerprint, response });
      return response;
    });
  }

  public reviewCandidate(command: CalendarCandidateReviewCommand): Promise<{
    readonly candidate: CalendarChangeCandidate;
    readonly projection: CalendarEventProjection | null;
  }> {
    return this.db.runTransaction(async (transaction) => {
      const configuration = documentData<ConfigurationRecord>(
        await transaction.get(this.configurationRef())
      );
      assertActive(configuration, command.occurredAt);
      assertPilotEnabled(configuration);
      const candidateRef = this.db
        .collection(COLLECTIONS.candidates)
        .doc(command.candidateId);
      const candidateDocument = await transaction.get(candidateRef);
      const candidate = documentData<CandidateRecord>(candidateDocument);
      if (
        candidate.expectedVersion !== command.expectedVersion ||
        candidate.sourceVersion !== configuration.version ||
        !['pending', 'conflict'].includes(candidate.status)
      )
        throw new ConflictError();

      const idempotencyRef = this.db
        .collection(COLLECTIONS.idempotency)
        .doc(hash(`${command.actorId}:${command.idempotencyKey}`).slice(0, 40));
      const replay = await transaction.get(idempotencyRef);
      const fingerprint = hash(
        JSON.stringify({
          candidateId: command.candidateId,
          action: command.action
        })
      );
      if (replay.exists) {
        const record = replay.data() as IdempotencyRecord<{
          candidate: CalendarChangeCandidate;
          projection: CalendarEventProjection | null;
        }>;
        if (record.fingerprint !== fingerprint) throw new ConflictError();
        return record.response;
      }

      let projection: CalendarEventProjection | null = null;
      if (command.action === 'accept' || command.action === 'resolve_google') {
        if (!candidate.parsed.ok || candidate.kind === 'invalid_format')
          throw new ConflictError();
        projection = await this.applyCandidate(
          transaction,
          candidate,
          configuration,
          command.occurredAt
        );
      } else if (
        command.action === 'resolve_system' &&
        candidate.kind === 'conflict'
      ) {
        const outboxId = hash(`${candidate.candidateId}:restore`).slice(0, 32);
        transaction.set(this.db.collection(COLLECTIONS.outbox).doc(outboxId), {
          kind: 'calendar_projection_restore',
          mirrorId: candidate.mirrorId,
          generation: configuration.version,
          status: 'pending',
          createdAt: command.occurredAt,
          attemptCount: 0
        });
      } else if (
        command.action === 'reject' &&
        candidate.kind === 'cancel_appointment'
      ) {
        const outboxId = hash(`${candidate.candidateId}:recreate`).slice(0, 32);
        transaction.set(this.db.collection(COLLECTIONS.outbox).doc(outboxId), {
          kind: 'calendar_projection_restore',
          mirrorId: candidate.mirrorId,
          generation: configuration.version,
          status: 'pending',
          createdAt: command.occurredAt,
          attemptCount: 0
        });
      }

      const publicCandidate: CalendarChangeCandidate = {
        candidateId: candidate.candidateId,
        kind: candidate.kind,
        status: command.action === 'reject' ? 'rejected' : 'accepted',
        displayLabel: candidate.displayLabel,
        startsAt: candidate.startsAt,
        endsAt: candidate.endsAt,
        sourceVersion: candidate.sourceVersion,
        expectedVersion: candidate.expectedVersion + 1,
        validationErrors: candidate.validationErrors,
        createdAt: candidate.createdAt,
        before: candidate.before
      };
      transaction.update(candidateRef, {
        status: publicCandidate.status,
        expectedVersion: publicCandidate.expectedVersion,
        reviewedBy: command.actorId,
        reviewedAt: command.occurredAt
      });
      transaction.create(
        this.db.collection(COLLECTIONS.audits).doc(randomUUID()),
        {
          action: `calendar_candidate_${command.action}`,
          actorId: command.actorId,
          actorRole: command.actorRole,
          candidateId: candidate.candidateId,
          occurredAt: command.occurredAt
        }
      );
      const response = { candidate: publicCandidate, projection };
      transaction.create(idempotencyRef, { fingerprint, response });
      return response;
    });
  }

  public correctCandidate(
    command: CalendarCandidateCorrectionCommand
  ): Promise<{
    readonly candidate: CalendarChangeCandidate;
    readonly projection: CalendarEventProjection | null;
  }> {
    return this.db.runTransaction(async (transaction) => {
      const configuration = documentData<ConfigurationRecord>(
        await transaction.get(this.configurationRef())
      );
      assertActive(configuration, command.occurredAt);
      assertPilotEnabled(configuration);
      const candidateRef = this.db
        .collection(COLLECTIONS.candidates)
        .doc(command.candidateId);
      const candidate = documentData<CandidateRecord>(
        await transaction.get(candidateRef)
      );
      const idempotencyRef = this.db
        .collection(COLLECTIONS.idempotency)
        .doc(hash(`${command.actorId}:${command.idempotencyKey}`).slice(0, 40));
      const replay = await transaction.get(idempotencyRef);
      const fingerprint = hash(
        JSON.stringify({
          action: 'correct',
          candidateId: command.candidateId,
          expectedVersion: command.expectedVersion,
          correction:
            command.kind === 'appointment'
              ? {
                  kind: command.kind,
                  patientCode: command.patientCode,
                  bookingKind: command.bookingKind,
                  serviceId: command.serviceId,
                  startsAt: command.startsAt
                }
              : {
                  kind: command.kind,
                  busyReason: command.busyReason,
                  timeRange: command.timeRange
                }
        })
      );
      if (replay.exists) {
        const record = replay.data() as IdempotencyRecord<{
          candidate: CalendarChangeCandidate;
          projection: CalendarEventProjection | null;
        }>;
        if (record.fingerprint !== fingerprint) throw new ConflictError();
        return record.response;
      }
      if (
        candidate.kind !== 'invalid_format' ||
        candidate.status !== 'pending' ||
        candidate.expectedVersion !== command.expectedVersion ||
        candidate.sourceVersion !== configuration.version
      )
        throw new ConflictError();

      let parsed: ParsedCalendarEntry;
      if (command.kind === 'appointment') {
        const patient = await transaction.get(
          this.db.collection(COLLECTIONS.patients).doc(command.patientCode)
        );
        if (!patient.exists || patient.data()?.['enabled'] !== true)
          throw new ConflictError();
        const endsAt = addThirtyMinutes(command.startsAt);
        parsed = parseCalendarEntry(
          {
            summary: formatSyntheticAppointmentTitle(command),
            start: { dateTime: command.startsAt },
            end: { dateTime: endsAt }
          },
          new Set([command.patientCode])
        );
      } else {
        parsed = parseCalendarEntry(
          {
            summary: formatBusyTitle(command.busyReason),
            start:
              command.timeRange.kind === 'all_day'
                ? { date: command.timeRange.startDate }
                : { dateTime: command.timeRange.startsAt },
            end:
              command.timeRange.kind === 'all_day'
                ? { date: command.timeRange.endDate }
                : { dateTime: command.timeRange.endsAt }
          },
          new Set()
        );
      }
      if (!parsed.ok || parsed.kind !== command.kind) throw new ConflictError();

      const correctedKind =
        parsed.kind === 'appointment'
          ? candidate.localRecordId === undefined
            ? 'create_appointment'
            : 'update_appointment'
          : candidate.localRecordId === undefined
            ? 'create_block'
            : 'update_block';
      const corrected: CandidateRecord = {
        ...candidate,
        kind: correctedKind,
        displayLabel: parsed.displayLabel,
        startsAt: parsed.startsAt,
        endsAt: parsed.endsAt,
        validationErrors: [],
        parsed
      };
      const projection = await this.applyCandidate(
        transaction,
        corrected,
        configuration,
        command.occurredAt
      );
      const publicCandidate: CalendarChangeCandidate = {
        candidateId: candidate.candidateId,
        kind: correctedKind,
        status: 'accepted',
        displayLabel: parsed.displayLabel,
        startsAt: parsed.startsAt,
        endsAt: parsed.endsAt,
        sourceVersion: candidate.sourceVersion,
        expectedVersion: candidate.expectedVersion + 1,
        validationErrors: [],
        createdAt: candidate.createdAt,
        before: candidate.before
      };
      transaction.update(candidateRef, {
        kind: correctedKind,
        status: 'accepted',
        displayLabel: parsed.displayLabel,
        startsAt: parsed.startsAt,
        endsAt: parsed.endsAt,
        validationErrors: [],
        parsed,
        expectedVersion: publicCandidate.expectedVersion,
        reviewedBy: command.actorId,
        reviewedAt: command.occurredAt
      });
      transaction.set(
        this.db
          .collection(COLLECTIONS.outbox)
          .doc(
            hash(
              `${candidate.candidateId}:correct:${candidate.expectedVersion}`
            ).slice(0, 32)
          ),
        {
          kind: 'calendar_projection_restore',
          writeMode: 'update_existing',
          mirrorId: candidate.mirrorId,
          generation: configuration.version,
          status: 'pending',
          createdAt: command.occurredAt,
          attemptCount: 0
        }
      );
      transaction.create(
        this.db.collection(COLLECTIONS.audits).doc(randomUUID()),
        {
          action: 'calendar_candidate_corrected',
          actorId: command.actorId,
          actorRole: command.actorRole,
          candidateId: candidate.candidateId,
          correctedKind,
          occurredAt: command.occurredAt
        }
      );
      const response = { candidate: publicCandidate, projection };
      transaction.create(idempotencyRef, { fingerprint, response });
      return response;
    });
  }

  private async applyCandidate(
    transaction: Transaction,
    candidate: CandidateRecord,
    configuration: ConfigurationRecord,
    occurredAt: string
  ): Promise<CalendarEventProjection | null> {
    if (
      candidate.kind === 'cancel_appointment' ||
      candidate.kind === 'release_block'
    ) {
      if (candidate.localRecordId === undefined) throw new ConflictError();
      const appointment =
        candidate.kind === 'cancel_appointment'
          ? await transaction.get(
              this.db
                .collection(COLLECTIONS.appointments)
                .doc(candidate.localRecordId)
            )
          : undefined;
      const appointmentData = appointment?.data() as
        | { readonly patientCode?: unknown; readonly version?: unknown }
        | undefined;
      const patientCode = appointmentData?.patientCode;
      const guard =
        typeof patientCode === 'string'
          ? await transaction.get(
              this.db.collection(COLLECTIONS.patientGuards).doc(patientCode)
            )
          : undefined;
      transaction.delete(
        this.db.collection(COLLECTIONS.blocks).doc(candidate.localRecordId)
      );
      transaction.delete(
        this.db.collection(COLLECTIONS.projections).doc(candidate.localRecordId)
      );
      if (candidate.kind === 'cancel_appointment') {
        if (
          appointment === undefined ||
          !appointment.exists ||
          typeof appointmentData?.version !== 'number'
        )
          throw new ConflictError();
        transaction.update(
          this.db
            .collection(COLLECTIONS.appointments)
            .doc(candidate.localRecordId),
          {
            status: 'cancelled',
            version: appointmentData.version + 1,
            updatedAt: occurredAt
          }
        );
        if (
          guard?.exists &&
          guard.data()?.['recordId'] === candidate.localRecordId
        )
          transaction.delete(guard.ref);
      }
      return null;
    }
    const parsed = candidate.parsed;
    if (!parsed.ok) throw new ConflictError();
    if (
      parsed.kind === 'appointment' &&
      Date.parse(parsed.startsAt) >= Date.parse(configuration.expiresAt)
    )
      throw new ConflictError();
    const incomingBookingKind =
      parsed.kind === 'appointment' ? parsed.bookingKind : null;
    const overlapping = await transaction.get(
      this.db
        .collection(COLLECTIONS.blocks)
        .where('startsAt', '<', parsed.endsAt)
    );
    if (
      overlapping.docs.some(
        (document) =>
          document.id !== candidate.localRecordId &&
          Date.parse(String(document.data()['endsAt'])) >
            Date.parse(parsed.startsAt) &&
          (parsed.kind === 'busy' ||
            document.data()['kind'] === 'busy' ||
            document.data()['bookingKind'] === incomingBookingKind)
      )
    )
      throw new ConflictError();
    const projectionId = candidate.localRecordId ?? randomUUID();
    const appointmentRef = this.db
      .collection(COLLECTIONS.appointments)
      .doc(projectionId);
    const existingAppointment = await transaction.get(appointmentRef);
    const existingAppointmentData = existingAppointment.data() as
      (SyntheticAppointment & { readonly updatedAt?: string }) | undefined;
    const newGuard =
      parsed.kind === 'appointment'
        ? await transaction.get(
            this.db
              .collection(COLLECTIONS.patientGuards)
              .doc(parsed.patientCode)
          )
        : undefined;
    if (newGuard?.exists && newGuard.data()?.['recordId'] !== projectionId)
      throw new ConflictError();
    const oldPatientCode = existingAppointmentData?.patientCode;
    const oldGuard =
      oldPatientCode !== undefined &&
      (parsed.kind !== 'appointment' || oldPatientCode !== parsed.patientCode)
        ? await transaction.get(
            this.db.collection(COLLECTIONS.patientGuards).doc(oldPatientCode)
          )
        : undefined;
    const projection: CalendarEventProjection = {
      projectionId,
      kind: parsed.kind,
      displayLabel: parsed.displayLabel,
      startsAt: parsed.startsAt,
      endsAt: parsed.endsAt,
      sourceVersion: configuration.version,
      bookingKind: parsed.kind === 'appointment' ? parsed.bookingKind : null,
      serviceId: parsed.kind === 'appointment' ? parsed.serviceId : null,
      busyReason: parsed.kind === 'busy' ? parsed.busyReason : null
    };
    transaction.set(
      this.db.collection(COLLECTIONS.projections).doc(projectionId),
      projection
    );
    transaction.update(
      this.db.collection('calendar_pilot_mirrors').doc(candidate.mirrorId),
      {
        linkId: projectionId,
        localDirty: false,
        parsed
      }
    );
    transaction.set(this.db.collection(COLLECTIONS.blocks).doc(projectionId), {
      kind: projection.kind,
      bookingKind: projection.bookingKind,
      startsAt: projection.startsAt,
      endsAt: projection.endsAt,
      displayLabel: projection.displayLabel,
      sourceVersion: projection.sourceVersion
    });
    if (parsed.kind === 'appointment') {
      transaction.set(appointmentRef, {
        appointmentId: projectionId,
        patientCode: parsed.patientCode,
        bookingKind: parsed.bookingKind,
        serviceId: parsed.serviceId,
        startsAt: parsed.startsAt,
        endsAt: parsed.endsAt,
        status: 'confirmed',
        version: (existingAppointmentData?.version ?? 0) + 1,
        updatedAt: occurredAt
      });
      transaction.set(
        this.db.collection(COLLECTIONS.patientGuards).doc(parsed.patientCode),
        {
          recordId: projectionId
        }
      );
    } else if (existingAppointment.exists) {
      transaction.set(
        appointmentRef,
        {
          ...existingAppointmentData,
          status: 'cancelled',
          version: (existingAppointmentData?.version ?? 0) + 1,
          updatedAt: occurredAt
        },
        { merge: true }
      );
    }
    if (oldGuard?.exists && oldGuard.data()?.['recordId'] === projectionId)
      transaction.delete(oldGuard.ref);
    return projection;
  }

  public createSyntheticAppointment(
    command: CreateSyntheticAppointmentRequest & {
      readonly actorId: string;
      readonly occurredAt: string;
    }
  ): Promise<SyntheticAppointmentCommandResponse> {
    const range = validateSyntheticAppointment(command);
    const appointmentId = hash(
      `${command.actorId}:${command.idempotencyKey}:appointment`
    ).slice(0, 32);
    const appointment: SyntheticAppointment = {
      appointmentId,
      patientCode: command.patientCode,
      bookingKind: command.bookingKind,
      serviceId: command.serviceId,
      ...range,
      status: 'confirmed',
      version: 1
    };
    return this.writeSyntheticAppointment(
      command,
      appointment,
      'create',
      hash(
        JSON.stringify({
          action: 'create',
          expectedVersion: command.expectedVersion,
          patientCode: command.patientCode,
          bookingKind: command.bookingKind,
          serviceId: command.serviceId,
          startsAt: command.startsAt
        })
      )
    );
  }

  public async rescheduleSyntheticAppointment(
    appointmentId: string,
    command: {
      readonly startsAt: string;
      readonly idempotencyKey: string;
      readonly expectedVersion: number;
      readonly actorId: string;
      readonly occurredAt: string;
    }
  ): Promise<SyntheticAppointmentCommandResponse> {
    const existing = documentData<SyntheticAppointment>(
      await this.db
        .collection(COLLECTIONS.appointments)
        .doc(appointmentId)
        .get()
    );
    const range = validateSyntheticAppointment({
      ...existing,
      startsAt: command.startsAt
    });
    return this.writeSyntheticAppointment(
      command,
      { ...existing, ...range, version: existing.version + 1 },
      'reschedule',
      hash(
        JSON.stringify({
          action: 'reschedule',
          appointmentId,
          expectedVersion: command.expectedVersion,
          startsAt: command.startsAt
        })
      )
    );
  }

  public async cancelSyntheticAppointment(
    appointmentId: string,
    command: {
      readonly idempotencyKey: string;
      readonly expectedVersion: number;
      readonly actorId: string;
      readonly occurredAt: string;
    }
  ): Promise<SyntheticAppointmentCommandResponse> {
    const existing = documentData<SyntheticAppointment>(
      await this.db
        .collection(COLLECTIONS.appointments)
        .doc(appointmentId)
        .get()
    );
    return this.writeSyntheticAppointment(
      command,
      { ...existing, status: 'cancelled', version: existing.version + 1 },
      'cancel',
      hash(
        JSON.stringify({
          action: 'cancel',
          appointmentId,
          expectedVersion: command.expectedVersion
        })
      )
    );
  }

  private writeSyntheticAppointment(
    command: {
      readonly idempotencyKey: string;
      readonly expectedVersion: number;
      readonly actorId: string;
      readonly occurredAt: string;
    },
    appointment: SyntheticAppointment,
    action: 'create' | 'reschedule' | 'cancel',
    fingerprint: string
  ): Promise<SyntheticAppointmentCommandResponse> {
    return this.db.runTransaction(async (transaction) => {
      const configuration = documentData<ConfigurationRecord>(
        await transaction.get(this.configurationRef())
      );
      assertActive(configuration, command.occurredAt);
      assertPilotEnabled(configuration);
      if (
        action !== 'cancel' &&
        Date.parse(appointment.startsAt) >= Date.parse(configuration.expiresAt)
      )
        throw new ConflictError();
      const appointmentRef = this.db
        .collection(COLLECTIONS.appointments)
        .doc(appointment.appointmentId);
      const current = await transaction.get(appointmentRef);
      const idempotencyRef = this.db
        .collection(COLLECTIONS.idempotency)
        .doc(hash(`${command.actorId}:${command.idempotencyKey}`).slice(0, 40));
      const replay = await transaction.get(idempotencyRef);
      if (replay.exists) {
        const record =
          replay.data() as IdempotencyRecord<SyntheticAppointmentCommandResponse>;
        if (record.fingerprint !== fingerprint) throw new ConflictError();
        return { ...record.response, replayed: true };
      }
      if (action === 'create' ? current.exists : !current.exists)
        throw new ConflictError();
      if (
        action !== 'create' &&
        current.data()?.['version'] !== command.expectedVersion
      )
        throw new ConflictError();
      const guard = await transaction.get(
        this.db
          .collection(COLLECTIONS.patientGuards)
          .doc(appointment.patientCode)
      );
      const linkedMirrors = await transaction.get(
        this.db
          .collection('calendar_pilot_mirrors')
          .where('linkId', '==', appointment.appointmentId)
          .limit(1)
      );
      if (action !== 'cancel') {
        const overlapping = await transaction.get(
          this.db
            .collection(COLLECTIONS.blocks)
            .where('startsAt', '<', appointment.endsAt)
        );
        if (
          overlapping.docs.some(
            (document) =>
              document.id !== appointment.appointmentId &&
              Date.parse(String(document.data()['endsAt'])) >
                Date.parse(appointment.startsAt) &&
              (document.data()['kind'] === 'busy' ||
                document.data()['bookingKind'] === appointment.bookingKind)
          )
        )
          throw new ConflictError();
        if (
          guard.exists &&
          guard.data()?.['recordId'] !== appointment.appointmentId
        )
          throw new ConflictError();
      }
      transaction.set(appointmentRef, appointment);
      for (const mirror of linkedMirrors.docs)
        transaction.update(mirror.ref, { localDirty: true });
      const blockRef = this.db
        .collection(COLLECTIONS.blocks)
        .doc(appointment.appointmentId);
      if (action === 'cancel') {
        transaction.delete(blockRef);
        if (
          guard.exists &&
          guard.data()?.['recordId'] === appointment.appointmentId
        )
          transaction.delete(guard.ref);
      } else {
        transaction.set(blockRef, {
          kind: 'appointment',
          bookingKind: appointment.bookingKind,
          startsAt: appointment.startsAt,
          endsAt: appointment.endsAt,
          displayLabel: `${appointment.patientCode}，合成預約`,
          sourceVersion: configuration.version
        });
        transaction.set(
          this.db
            .collection(COLLECTIONS.patientGuards)
            .doc(appointment.patientCode),
          {
            recordId: appointment.appointmentId
          }
        );
      }
      const outboxId = hash(
        `${command.actorId}:${command.idempotencyKey}:calendar`
      ).slice(0, 32);
      transaction.set(this.db.collection(COLLECTIONS.outbox).doc(outboxId), {
        kind:
          action === 'cancel'
            ? 'calendar_projection_delete'
            : 'calendar_projection_upsert',
        localRecordId: appointment.appointmentId,
        generation: configuration.version,
        status: 'pending',
        createdAt: command.occurredAt,
        attemptCount: 0
      });
      transaction.create(
        this.db.collection(COLLECTIONS.audits).doc(randomUUID()),
        {
          action: `synthetic_appointment_${action}`,
          actorId: command.actorId,
          appointmentId: appointment.appointmentId,
          occurredAt: command.occurredAt
        }
      );
      const response = { appointment, replayed: false };
      transaction.create(idempotencyRef, { fingerprint, response });
      return response;
    });
  }
}
