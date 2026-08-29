import { describe, expect, it } from 'vitest';

import {
  CalendarSyncEngine,
  CalendarSyncTokenExpiredError,
  type CalendarEventPage,
  type CalendarEventReader,
  type CalendarListRequest,
  type CalendarMirrorRecord,
  type CalendarSyncCommit,
  type CalendarSyncConfiguration,
  type CalendarSyncRepository,
  type CalendarSyncState
} from './sync-engine.js';

const NOW = '2026-08-28T08:00:00.000Z';

class FakeReader implements CalendarEventReader {
  public readonly requests: CalendarListRequest[] = [];
  public constructor(
    private readonly pages: Array<CalendarEventPage | Error>
  ) {}

  public listEvents(request: CalendarListRequest): Promise<CalendarEventPage> {
    this.requests.push(request);
    const next = this.pages.shift();
    if (next instanceof Error) return Promise.reject(next);
    if (next === undefined) throw new Error('No fake page configured.');
    return Promise.resolve(next);
  }
}

class MemoryRepository implements CalendarSyncRepository {
  public configuration: CalendarSyncConfiguration = {
    activeSourceId: 'source_a',
    sourceVersion: 3,
    expiresAt: '2026-09-27T08:00:00.000Z',
    pseudonymKey: 'synthetic-pseudonym-key',
    knownPatientCodes: new Set(['A17'])
  };
  public state: CalendarSyncState = { sourceId: 'source_a' };
  public readonly mirrors = new Map<string, CalendarMirrorRecord>();
  public readonly managedLinks = new Set<string>();
  public readonly commits: CalendarSyncCommit[] = [];
  public cleared = 0;

  public loadConfiguration(): Promise<CalendarSyncConfiguration> {
    return Promise.resolve(this.configuration);
  }
  public loadSyncState(): Promise<CalendarSyncState> {
    return Promise.resolve(this.state);
  }
  public findMirror(
    _sourceId: string,
    externalEventId: string
  ): Promise<CalendarMirrorRecord | undefined> {
    return Promise.resolve(this.mirrors.get(externalEventId));
  }
  public matchesManagedProjection(
    linkId: string,
    _parsed: import('@beauessence/domain').ParsedCalendarEntry
  ): Promise<boolean> {
    return Promise.resolve(this.managedLinks.has(linkId));
  }
  public commitSync(commit: CalendarSyncCommit): Promise<void> {
    if (commit.expectedSourceVersion !== this.configuration.sourceVersion)
      return Promise.reject(new Error('stale source generation'));
    this.commits.push(commit);
    for (const mutation of commit.mutations)
      this.mirrors.set(mutation.mirror.externalEventId, mutation.mirror);
    if (commit.nextSyncToken !== undefined)
      this.state = {
        sourceId: commit.sourceId,
        syncToken: commit.nextSyncToken,
        ...(commit.fullSync && commit.completedAt !== undefined
          ? { lastFullSyncAt: commit.completedAt }
          : this.state.lastFullSyncAt === undefined
            ? {}
            : { lastFullSyncAt: this.state.lastFullSyncAt }),
        ...(commit.completedAt === undefined
          ? {}
          : { lastSuccessfulSyncAt: commit.completedAt })
      };
    return Promise.resolve();
  }
  public clearSyncToken(): Promise<void> {
    this.cleared += 1;
    this.state = { sourceId: this.state.sourceId };
    return Promise.resolve();
  }
}

function appointment(id: string, etag: string) {
  return {
    id,
    etag,
    status: 'confirmed' as const,
    summary: '[預約] A17｜初診｜止鼾',
    start: { dateTime: '2026-09-02T14:00:00+08:00' },
    end: { dateTime: '2026-09-02T14:30:00+08:00' }
  };
}

describe('CalendarSyncEngine', () => {
  it('mirrors an initial system-linked write without creating a duplicate candidate', async () => {
    const repository = new MemoryRepository();
    repository.managedLinks.add('appointment_001');
    const linked = {
      ...appointment('event-managed', 'etag-managed'),
      extendedProperties: {
        private: { beauessenceLinkId: 'appointment_001' }
      }
    };
    const reader = new FakeReader([
      { events: [linked], nextSyncToken: 'sync-managed' }
    ]);
    const summary = await new CalendarSyncEngine(reader, repository).run(NOW);
    expect(summary.candidates).toBe(0);
    expect(repository.commits[0]?.mutations[0]?.candidate).toBeUndefined();
  });

  it('rebuilds the rolling window at least once per night', async () => {
    const repository = new MemoryRepository();
    repository.state = {
      sourceId: 'source_a',
      syncToken: 'incremental-token',
      lastFullSyncAt: '2026-08-27T07:59:59.000Z'
    };
    const reader = new FakeReader([
      { events: [], nextSyncToken: 'nightly-token' }
    ]);
    const summary = await new CalendarSyncEngine(reader, repository).run(NOW);
    expect(summary.mode).toBe('full');
    expect(reader.requests[0]).toMatchObject({
      timeMin: '2026-07-29T08:00:00.000Z',
      timeMax: '2026-10-27T08:00:00.000Z'
    });
    expect(reader.requests[0]).not.toHaveProperty('syncToken');
  });

  it('does a paginated bounded full sync and creates review candidates', async () => {
    const repository = new MemoryRepository();
    const reader = new FakeReader([
      { events: [appointment('event-1', 'etag-1')], nextPageToken: 'page-2' },
      {
        events: [
          {
            id: 'event-2',
            etag: 'etag-2',
            status: 'confirmed',
            summary: '[忙碌] 會議',
            start: { dateTime: '2026-09-03T14:00:00+08:00' },
            end: { dateTime: '2026-09-03T15:00:00+08:00' }
          }
        ],
        nextSyncToken: 'sync-1'
      }
    ]);

    await expect(
      new CalendarSyncEngine(reader, repository).run(NOW)
    ).resolves.toMatchObject({
      mode: 'full',
      pages: 2,
      seen: 2,
      candidates: 2
    });
    expect(reader.requests[0]).toMatchObject({
      timeMin: '2026-07-29T08:00:00.000Z',
      timeMax: '2026-10-27T08:00:00.000Z'
    });
    expect(reader.requests[1]).toMatchObject({ pageToken: 'page-2' });
    expect(
      repository.commits
        .flatMap((commit) => commit.mutations)
        .map((mutation) => mutation.candidate?.kind)
    ).toEqual(['create_appointment', 'create_block']);
    expect(repository.state.syncToken).toBe('sync-1');
  });

  it('uses the sync token, emits a cancellation review and deduplicates etags', async () => {
    const repository = new MemoryRepository();
    const firstReader = new FakeReader([
      { events: [appointment('event-1', 'etag-1')], nextSyncToken: 'sync-1' }
    ]);
    await new CalendarSyncEngine(firstReader, repository).run(NOW);

    const incremental = new FakeReader([
      {
        events: [
          appointment('event-1', 'etag-1'),
          { id: 'event-1', etag: 'etag-2', status: 'cancelled' }
        ],
        nextSyncToken: 'sync-2'
      }
    ]);
    const summary = await new CalendarSyncEngine(incremental, repository).run(
      '2026-08-28T08:05:00.000Z'
    );

    expect(incremental.requests).toEqual([{ syncToken: 'sync-1' }]);
    expect(summary).toMatchObject({
      mode: 'incremental',
      candidates: 1,
      skipped: 1
    });
    expect(repository.commits.at(-1)?.mutations[0]?.candidate?.kind).toBe(
      'cancel_appointment'
    );
  });

  it('recovers once from a 410 with a non-destructive full rebuild', async () => {
    const repository = new MemoryRepository();
    repository.state = {
      sourceId: 'source_a',
      syncToken: 'expired-token',
      lastFullSyncAt: '2026-08-28T07:00:00.000Z'
    };
    const reader = new FakeReader([
      new CalendarSyncTokenExpiredError('gone'),
      { events: [appointment('event-1', 'etag-1')], nextSyncToken: 'fresh' }
    ]);

    await expect(
      new CalendarSyncEngine(reader, repository).run(NOW)
    ).resolves.toMatchObject({
      mode: 'full',
      rebuiltAfterExpiredToken: true,
      candidates: 1
    });
    expect(repository.cleared).toBe(1);
    expect(reader.requests[0]).toEqual({ syncToken: 'expired-token' });
    expect(reader.requests[1]).toHaveProperty('timeMin');
  });

  it('fails closed after the 30-day expiry', async () => {
    const repository = new MemoryRepository();
    const reader = new FakeReader([]);
    await expect(
      new CalendarSyncEngine(reader, repository).run('2026-09-27T08:00:00.000Z')
    ).rejects.toThrow('expired');
    expect(reader.requests).toEqual([]);
  });

  it('fences a stale source generation before committing a page', async () => {
    const repository = new MemoryRepository();
    const reader = new FakeReader([
      { events: [appointment('event-1', 'etag-1')], nextSyncToken: 'sync-1' }
    ]);
    const originalCommit = repository.commitSync.bind(repository);
    repository.commitSync = (commit) => {
      repository.configuration = {
        ...repository.configuration,
        sourceVersion: 4
      };
      return originalCommit(commit);
    };

    await expect(
      new CalendarSyncEngine(reader, repository).run(NOW)
    ).rejects.toThrow('stale source generation');
  });
});
