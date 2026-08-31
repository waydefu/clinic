import type { Firestore } from 'firebase-admin/firestore';
import type { ParsedCalendarEntry } from '@beauessence/domain';

import type {
  CalendarCandidateDraft,
  CalendarMirrorRecord,
  CalendarSyncCommit,
  CalendarSyncConfiguration,
  CalendarSyncRepository,
  CalendarSyncState
} from './sync-engine.js';
import type {
  CalendarSourceConfiguration,
  CalendarSourcePreflightResult,
  CalendarSourceRecord,
  CalendarSourceSwitchRepository,
  CalendarSourceSwitchResult
} from './source-switch.js';

const CONFIGURATION = 'calendar_pilot_configuration';
const SOURCES = 'calendar_pilot_sources';
const PATIENTS = 'calendar_pilot_patients';
const MIRRORS = 'calendar_pilot_mirrors';
const CANDIDATES = 'calendar_pilot_candidates';
const PREFLIGHTS = 'calendar_pilot_preflights';
const APPOINTMENTS = 'calendar_pilot_appointments';
const LEGACY_RESYNC_REASON = 'legacy_candidate_requires_resync';

interface StoredConfiguration extends CalendarSourceConfiguration {
  readonly lastSuccessfulSyncAt?: string;
  readonly nextScheduledSyncAt?: string;
  readonly health?: string;
}

function publicCandidate(candidate: CalendarCandidateDraft) {
  const parsed = candidate.parsed;
  const previous = candidate.previousParsed;
  return {
    ...candidate,
    status: candidate.kind === 'conflict' ? 'conflict' : 'pending',
    displayLabel: parsed.ok ? parsed.displayLabel : '格式需修正',
    startsAt: parsed.ok ? parsed.startsAt : null,
    endsAt: parsed.ok ? parsed.endsAt : null,
    before:
      previous?.ok === true
        ? {
            kind: previous.kind,
            displayLabel: previous.displayLabel,
            startsAt: previous.startsAt,
            endsAt: previous.endsAt
          }
        : null
  };
}

/** Transactional persistence for incremental sync and source generation fencing. */
export class FirestoreCalendarSyncRepository
  implements CalendarSyncRepository, CalendarSourceSwitchRepository
{
  public constructor(
    private readonly db: Firestore,
    private readonly pseudonymKey: string
  ) {
    if (pseudonymKey.length < 32)
      throw new Error(
        'CAL-PILOT pseudonym key must be at least 32 characters.'
      );
  }

  private configRef() {
    return this.db.collection(CONFIGURATION).doc('active');
  }

  private async configuration(): Promise<StoredConfiguration> {
    const document = await this.configRef().get();
    if (!document.exists)
      throw new Error('CAL-PILOT configuration is missing.');
    return document.data() as StoredConfiguration;
  }

  public async loadConfiguration(): Promise<
    CalendarSyncConfiguration & CalendarSourceConfiguration
  > {
    const [configuration, patients] = await Promise.all([
      this.configuration(),
      this.db.collection(PATIENTS).where('enabled', '==', true).get()
    ]);
    return {
      activeSourceId: configuration.activeSourceId,
      ...(configuration.previousSourceId === undefined
        ? {}
        : { previousSourceId: configuration.previousSourceId }),
      sourceVersion: configuration.version,
      version: configuration.version,
      expiresAt: configuration.expiresAt,
      pseudonymKey: this.pseudonymKey,
      knownPatientCodes: new Set(patients.docs.map((document) => document.id))
    };
  }

  public async loadSyncState(sourceId: string): Promise<CalendarSyncState> {
    const document = await this.db.collection(SOURCES).doc(sourceId).get();
    if (!document.exists) throw new Error('CAL-PILOT source is missing.');
    const data = document.data()!;
    return {
      sourceId,
      ...(typeof data['syncToken'] === 'string'
        ? { syncToken: data['syncToken'] }
        : {}),
      ...(typeof data['lastSyncedAt'] === 'string'
        ? { lastSuccessfulSyncAt: data['lastSyncedAt'] }
        : {}),
      ...(typeof data['lastFullSyncAt'] === 'string'
        ? { lastFullSyncAt: data['lastFullSyncAt'] }
        : {})
    };
  }

  public async findMirror(
    sourceId: string,
    externalEventId: string
  ): Promise<CalendarMirrorRecord | undefined> {
    const query = await this.db
      .collection(MIRRORS)
      .where('sourceId', '==', sourceId)
      .where('externalEventId', '==', externalEventId)
      .limit(1)
      .get();
    return query.empty
      ? undefined
      : (query.docs[0]!.data() as CalendarMirrorRecord);
  }

  public async matchesManagedProjection(
    linkId: string,
    parsed: ParsedCalendarEntry
  ): Promise<boolean> {
    const appointment = await this.db
      .collection(APPOINTMENTS)
      .doc(linkId)
      .get();
    if (!appointment.exists) return false;
    const data = appointment.data()!;
    if (!parsed.ok) return data['status'] === 'cancelled';
    if (parsed.kind !== 'appointment') return false;
    return (
      data['status'] === 'confirmed' &&
      data['patientCode'] === parsed.patientCode &&
      data['bookingKind'] === parsed.bookingKind &&
      data['serviceId'] === parsed.serviceId &&
      data['startsAt'] === parsed.startsAt &&
      data['endsAt'] === parsed.endsAt
    );
  }

  public commitSync(commit: CalendarSyncCommit): Promise<void> {
    return this.db.runTransaction(async (transaction) => {
      const configurationDocument = await transaction.get(this.configRef());
      if (!configurationDocument.exists)
        throw new Error('CAL-PILOT configuration is missing.');
      const configuration = configurationDocument.data() as StoredConfiguration;
      if (
        configuration.activeSourceId !== commit.sourceId ||
        configuration.version !== commit.expectedSourceVersion
      )
        throw new Error('CAL-PILOT source generation changed.');

      const candidateDocuments = await Promise.all(
        commit.mutations
          .filter((mutation) => mutation.candidate !== undefined)
          .map((mutation) =>
            transaction.get(
              this.db
                .collection(CANDIDATES)
                .doc(mutation.candidate!.candidateId)
            )
          )
      );
      const existingCandidates = new Map(
        candidateDocuments
          .filter((document) => document.exists)
          .map((document) => [document.id, document.data()] as const)
      );

      for (const mutation of commit.mutations) {
        transaction.set(
          this.db.collection(MIRRORS).doc(mutation.mirror.mirrorId),
          mutation.mirror
        );
        if (mutation.candidate !== undefined) {
          const candidateRef = this.db
            .collection(CANDIDATES)
            .doc(mutation.candidate.candidateId);
          const existingCandidate = existingCandidates.get(
            mutation.candidate.candidateId
          );
          if (existingCandidate === undefined)
            transaction.create(
              candidateRef,
              publicCandidate(mutation.candidate)
            );
          else if (
            existingCandidate['status'] === 'superseded' &&
            existingCandidate['supersededReason'] === LEGACY_RESYNC_REASON &&
            (typeof existingCandidate['expectedEtag'] !== 'string' ||
              existingCandidate['expectedEtag'].trim() === '')
          )
            transaction.set(candidateRef, publicCandidate(mutation.candidate));
        }
      }

      const sourceUpdate = {
        ...(commit.nextSyncToken === undefined
          ? {}
          : { syncToken: commit.nextSyncToken }),
        ...(commit.completedAt === undefined
          ? {}
          : {
              lastSyncedAt: commit.completedAt,
              lastErrorCode: null,
              ...(commit.fullSync ? { lastFullSyncAt: commit.completedAt } : {})
            })
      };
      if (Object.keys(sourceUpdate).length > 0)
        transaction.update(
          this.db.collection(SOURCES).doc(commit.sourceId),
          sourceUpdate
        );
      if (commit.completedAt !== undefined)
        transaction.update(this.configRef(), {
          health: 'healthy',
          lastSuccessfulSyncAt: commit.completedAt,
          nextScheduledSyncAt: new Date(
            Date.parse(commit.completedAt) + 5 * 60_000
          ).toISOString()
        });
    });
  }

  public clearSyncToken(
    sourceId: string,
    expectedSourceVersion: number
  ): Promise<void> {
    return this.db.runTransaction(async (transaction) => {
      const configuration = await transaction.get(this.configRef());
      if (
        !configuration.exists ||
        configuration.data()?.['activeSourceId'] !== sourceId ||
        configuration.data()?.['version'] !== expectedSourceVersion
      )
        throw new Error('CAL-PILOT source generation changed.');
      transaction.update(this.db.collection(SOURCES).doc(sourceId), {
        syncToken: null,
        lastErrorCode: 'sync_token_expired'
      });
    });
  }

  public async findSource(
    sourceId: string
  ): Promise<CalendarSourceRecord | undefined> {
    const document = await this.db.collection(SOURCES).doc(sourceId).get();
    if (!document.exists) return undefined;
    const data = document.data()!;
    return {
      sourceId,
      displayName: String(data['displayName']),
      enabled: data['enabled'] === true
    };
  }

  public async savePreflight(
    result: CalendarSourcePreflightResult
  ): Promise<void> {
    await this.db
      .collection(PREFLIGHTS)
      .doc(result.preflightId)
      .set({
        ...result,
        status: result.readable && result.writable ? 'passed' : 'failed'
      });
  }

  public async findPreflight(
    preflightId: string
  ): Promise<CalendarSourcePreflightResult | undefined> {
    const document = await this.db
      .collection(PREFLIGHTS)
      .doc(preflightId)
      .get();
    return document.exists
      ? (document.data() as CalendarSourcePreflightResult)
      : undefined;
  }

  public activate(input: {
    readonly sourceId: string;
    readonly expectedVersion: number;
    readonly preflightId: string;
    readonly activatedAt: string;
  }): Promise<CalendarSourceSwitchResult> {
    return this.db.runTransaction(async (transaction) => {
      const document = await transaction.get(this.configRef());
      if (!document.exists)
        throw new Error('CAL-PILOT configuration is missing.');
      const configuration = document.data() as StoredConfiguration;
      if (configuration.version !== input.expectedVersion)
        throw new Error('CAL-PILOT source generation changed.');
      transaction.update(this.configRef(), {
        activeSourceId: input.sourceId,
        previousSourceId: configuration.activeSourceId,
        version: configuration.version + 1,
        health: 'syncing',
        lastSuccessfulSyncAt: null
      });
      return {
        activeSourceId: input.sourceId,
        previousSourceId: configuration.activeSourceId,
        version: configuration.version + 1
      };
    });
  }
}
