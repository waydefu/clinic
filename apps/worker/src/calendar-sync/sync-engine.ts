import { createHmac } from 'node:crypto';

import {
  parseCalendarEntry,
  type CalendarEntryValidationCode,
  type ParsedCalendarEntry
} from '@beauessence/domain';

export interface ExternalCalendarEvent {
  readonly id: string;
  readonly etag: string;
  readonly status: 'confirmed' | 'tentative' | 'cancelled';
  readonly summary?: unknown;
  readonly start?: {
    readonly dateTime?: unknown;
    readonly date?: unknown;
  };
  readonly end?: {
    readonly dateTime?: unknown;
    readonly date?: unknown;
  };
  readonly extendedProperties?: {
    readonly private?: Readonly<Record<string, unknown>>;
  };
}

export interface CalendarEventPage {
  readonly events: readonly ExternalCalendarEvent[];
  readonly nextPageToken?: string;
  readonly nextSyncToken?: string;
}

export interface CalendarListRequest {
  readonly pageToken?: string;
  readonly syncToken?: string;
  readonly timeMin?: string;
  readonly timeMax?: string;
}

export interface CalendarEventReader {
  listEvents(request: CalendarListRequest): Promise<CalendarEventPage>;
}

export class CalendarSyncTokenExpiredError extends Error {
  public readonly name = 'CalendarSyncTokenExpiredError';
}

export interface CalendarSyncConfiguration {
  readonly activeSourceId: string;
  readonly sourceVersion: number;
  readonly expiresAt: string;
  readonly pseudonymKey: string;
  readonly knownPatientCodes: ReadonlySet<string>;
}

export interface CalendarSyncState {
  readonly sourceId: string;
  readonly syncToken?: string;
  readonly lastSuccessfulSyncAt?: string;
  readonly lastFullSyncAt?: string;
}

export type CalendarCandidateKind =
  | 'create_appointment'
  | 'create_block'
  | 'update_appointment'
  | 'update_block'
  | 'cancel_appointment'
  | 'release_block'
  | 'invalid_format'
  | 'conflict';

export interface CalendarMirrorRecord {
  readonly mirrorId: string;
  readonly sourceId: string;
  /** Server-only. Never expose this persistence shape through an API. */
  readonly externalEventId: string;
  readonly etag: string;
  readonly externalStatus: 'confirmed' | 'tentative' | 'cancelled';
  readonly sourceVersion: number;
  readonly parsed: ParsedCalendarEntry;
  readonly linkId?: string;
  readonly localDirty: boolean;
  readonly updatedAt: string;
}

export interface CalendarCandidateDraft {
  readonly candidateId: string;
  readonly mirrorId: string;
  readonly expectedEtag: string;
  readonly kind: CalendarCandidateKind;
  readonly sourceId: string;
  readonly sourceVersion: number;
  readonly expectedVersion: number;
  readonly parsed: ParsedCalendarEntry;
  readonly validationErrors: readonly CalendarEntryValidationCode[];
  readonly createdAt: string;
  readonly previousParsed?: ParsedCalendarEntry;
  readonly localRecordId?: string;
}

export interface CalendarMirrorMutation {
  readonly mirror: CalendarMirrorRecord;
  readonly candidate?: CalendarCandidateDraft;
}

export interface CalendarSyncCommit {
  readonly sourceId: string;
  readonly expectedSourceVersion: number;
  readonly mutations: readonly CalendarMirrorMutation[];
  readonly nextSyncToken?: string;
  readonly completedAt?: string;
  readonly fullSync: boolean;
}

export interface CalendarSyncRepository {
  loadConfiguration(): Promise<CalendarSyncConfiguration>;
  loadSyncState(sourceId: string): Promise<CalendarSyncState>;
  findMirror(
    sourceId: string,
    externalEventId: string
  ): Promise<CalendarMirrorRecord | undefined>;
  matchesManagedProjection(
    linkId: string,
    parsed: ParsedCalendarEntry
  ): Promise<boolean>;
  commitSync(commit: CalendarSyncCommit): Promise<void>;
  clearSyncToken(
    sourceId: string,
    expectedSourceVersion: number
  ): Promise<void>;
}

export interface CalendarSyncSummary {
  readonly mode: 'full' | 'incremental';
  readonly pages: number;
  readonly seen: number;
  readonly candidates: number;
  readonly skipped: number;
  readonly rebuiltAfterExpiredToken: boolean;
  readonly completedAt: string;
}

const PAST_WINDOW_DAYS = 30;
const FUTURE_WINDOW_DAYS = 60;
const LINK_PROPERTY = 'beauessenceLinkId';

function opaqueId(key: string, namespace: string, value: string): string {
  return createHmac('sha256', key)
    .update(`${namespace}\u0000${value}`)
    .digest('hex')
    .slice(0, 32);
}

function parseLinkId(event: ExternalCalendarEvent): string | undefined {
  const value = event.extendedProperties?.private?.[LINK_PROPERTY];
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value)
    ? value
    : undefined;
}

function invalidCancelledEntry(): ParsedCalendarEntry {
  // A cancelled event often omits title and time. Preserve no raw payload and
  // use a closed error solely as an internal placeholder; the candidate kind
  // is derived from the existing mirror.
  return { ok: false, errors: ['title_missing'] };
}

function candidateKind(
  existing: CalendarMirrorRecord | undefined,
  status: ExternalCalendarEvent['status'],
  parsed: ParsedCalendarEntry
): CalendarCandidateKind | undefined {
  if (status === 'cancelled') {
    if (existing?.parsed.ok !== true) return undefined;
    return existing.parsed.kind === 'appointment'
      ? 'cancel_appointment'
      : 'release_block';
  }
  if (!parsed.ok) return 'invalid_format';
  if (existing?.localDirty === true) return 'conflict';
  if (existing === undefined || existing.externalStatus === 'cancelled')
    return parsed.kind === 'appointment'
      ? 'create_appointment'
      : 'create_block';
  return parsed.kind === 'appointment' ? 'update_appointment' : 'update_block';
}

export class CalendarSyncEngine {
  public constructor(
    private readonly reader: CalendarEventReader,
    private readonly repository: CalendarSyncRepository
  ) {}

  private async runOnce(
    now: string,
    forceFull: boolean,
    rebuiltAfterExpiredToken: boolean
  ): Promise<CalendarSyncSummary> {
    const configuration = await this.repository.loadConfiguration();
    if (Date.parse(now) >= Date.parse(configuration.expiresAt))
      throw new Error('CAL-PILOT sync has expired.');

    const state = await this.repository.loadSyncState(
      configuration.activeSourceId
    );
    const syncToken = forceFull ? undefined : state.syncToken;
    const fullSync = syncToken === undefined;
    const nowMs = Date.parse(now);
    const baseRequest: CalendarListRequest = fullSync
      ? {
          timeMin: new Date(
            nowMs - PAST_WINDOW_DAYS * 24 * 60 * 60 * 1000
          ).toISOString(),
          timeMax: new Date(
            nowMs + FUTURE_WINDOW_DAYS * 24 * 60 * 60 * 1000
          ).toISOString()
        }
      : { syncToken };

    let pageToken: string | undefined;
    let pages = 0;
    let seen = 0;
    let candidates = 0;
    let skipped = 0;
    let finalSyncToken: string | undefined;

    do {
      let page: CalendarEventPage;
      try {
        page = await this.reader.listEvents({
          ...baseRequest,
          ...(pageToken === undefined ? {} : { pageToken })
        });
      } catch (error) {
        if (
          error instanceof CalendarSyncTokenExpiredError &&
          !fullSync &&
          !rebuiltAfterExpiredToken
        ) {
          await this.repository.clearSyncToken(
            configuration.activeSourceId,
            configuration.sourceVersion
          );
          return this.runOnce(now, true, true);
        }
        throw error;
      }

      pages += 1;
      const mutations: CalendarMirrorMutation[] = [];
      for (const event of page.events) {
        seen += 1;
        if (event.id.trim() === '' || event.etag.trim() === '') {
          skipped += 1;
          continue;
        }
        const existing = await this.repository.findMirror(
          configuration.activeSourceId,
          event.id
        );
        if (
          existing?.etag === event.etag &&
          existing.externalStatus === event.status
        ) {
          skipped += 1;
          continue;
        }

        const parsed =
          event.status === 'cancelled'
            ? (existing?.parsed ?? invalidCancelledEntry())
            : parseCalendarEntry(event, configuration.knownPatientCodes);
        const kind = candidateKind(existing, event.status, parsed);
        const mirrorId = opaqueId(
          configuration.pseudonymKey,
          'mirror',
          `${configuration.activeSourceId}:${event.id}`
        );
        const linkId = parseLinkId(event);
        const managedLink = linkId ?? existing?.linkId;
        const managedProjectionMatch =
          managedLink !== undefined &&
          (await this.repository.matchesManagedProjection(managedLink, parsed));
        const mirror: CalendarMirrorRecord = {
          mirrorId,
          sourceId: configuration.activeSourceId,
          externalEventId: event.id,
          etag: event.etag,
          externalStatus: event.status,
          sourceVersion: configuration.sourceVersion,
          parsed,
          ...(managedLink === undefined ? {} : { linkId: managedLink }),
          localDirty: managedProjectionMatch
            ? false
            : (existing?.localDirty ?? false),
          updatedAt: now
        };
        if (kind === undefined || managedProjectionMatch) {
          mutations.push({ mirror });
          skipped += 1;
          continue;
        }

        const candidateId = opaqueId(
          configuration.pseudonymKey,
          'candidate',
          `${mirrorId}:${event.etag}:${event.status}`
        );
        const candidate: CalendarCandidateDraft = {
          candidateId,
          mirrorId,
          expectedEtag: event.etag,
          kind,
          sourceId: configuration.activeSourceId,
          sourceVersion: configuration.sourceVersion,
          expectedVersion: existing === undefined ? 0 : 1,
          parsed,
          validationErrors: parsed.ok ? [] : parsed.errors,
          createdAt: now,
          ...(existing?.parsed === undefined
            ? {}
            : { previousParsed: existing.parsed }),
          ...(managedLink === undefined ? {} : { localRecordId: managedLink })
        };
        mutations.push({ mirror, candidate });
        candidates += 1;
      }

      finalSyncToken = page.nextSyncToken ?? finalSyncToken;
      await this.repository.commitSync({
        sourceId: configuration.activeSourceId,
        expectedSourceVersion: configuration.sourceVersion,
        mutations,
        fullSync,
        ...(page.nextSyncToken === undefined
          ? {}
          : { nextSyncToken: page.nextSyncToken }),
        ...(page.nextPageToken === undefined ? { completedAt: now } : {})
      });
      pageToken = page.nextPageToken;
    } while (pageToken !== undefined);

    if (finalSyncToken === undefined)
      throw new Error('Calendar sync completed without a nextSyncToken.');

    return {
      mode: fullSync ? 'full' : 'incremental',
      pages,
      seen,
      candidates,
      skipped,
      rebuiltAfterExpiredToken,
      completedAt: now
    };
  }

  public run(now = new Date().toISOString()): Promise<CalendarSyncSummary> {
    return this.repository
      .loadConfiguration()
      .then((configuration) =>
        this.repository.loadSyncState(configuration.activeSourceId)
      )
      .then((state) => {
        const nightlyFull =
          state.syncToken !== undefined &&
          (state.lastFullSyncAt === undefined ||
            Date.parse(now) - Date.parse(state.lastFullSyncAt) >=
              24 * 60 * 60 * 1000);
        return this.runOnce(now, nightlyFull, false);
      });
  }
}
