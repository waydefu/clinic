import { describe, expect, it } from 'vitest';

import {
  buildClinicCalendarEventBody,
  calendarEventIdForAppointment
} from '@beauessence/domain';

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
  public readonly clinicAppointments = new Map<
    string,
    {
      readonly appointmentId: string;
      readonly status: string;
      readonly startsAt: string;
      readonly bookingKind: 'initial' | 'follow_up';
    }
  >();
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
  public loadAuthoritativeAppointment(appointmentId: string): Promise<
    | {
        readonly appointmentId: string;
        readonly status: string;
        readonly startsAt: string;
        readonly bookingKind: 'initial' | 'follow_up';
      }
    | undefined
  > {
    return Promise.resolve(this.clinicAppointments.get(appointmentId));
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
    expect(
      repository.commits
        .flatMap((commit) => commit.mutations)
        .map((mutation) => mutation.candidate?.expectedEtag)
    ).toEqual(['etag-1', 'etag-2']);
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

  it('does not open a review candidate for a clinic outbound patch replay', async () => {
    const repository = new MemoryRepository();
    const eventId = calendarEventIdForAppointment('appointment_001');
    repository.clinicAppointments.set('appointment_001', {
      appointmentId: 'appointment_001',
      status: 'confirmed',
      startsAt: '2030-01-02T04:00:00.000Z',
      bookingKind: 'initial'
    });
    const payload = buildClinicCalendarEventBody({
      eventId,
      appointmentId: 'appointment_001',
      appointmentStatus: 'confirmed',
      bookingKind: 'initial',
      startsAt: '2030-01-02T04:00:00.000Z',
      endsAt: '2030-01-02T05:00:00.000Z',
      colorId: '10',
      clinicName: '一森渼診所',
      clinicAddress: 'synthetic-location',
      correlationId: 'corr_calendar_001'
    });
    const reader = new FakeReader([
      {
        events: [
          {
            id: eventId,
            etag: 'etag-echo',
            status: 'confirmed',
            summary: payload.summary,
            start: payload.start,
            end: payload.end,
            extendedProperties: payload.extendedProperties
          }
        ],
        nextSyncToken: 'sync-echo'
      }
    ]);
    const summary = await new CalendarSyncEngine(reader, repository).run(NOW);
    expect(summary.candidates).toBe(0);
    expect(repository.commits[0]?.mutations[0]?.candidate).toBeUndefined();
  });

  it('turns a later manual edit of a projected event into a linked review candidate', async () => {
    const repository = new MemoryRepository();
    const appointmentId = 'appointment_001';
    const eventId = calendarEventIdForAppointment(appointmentId);
    repository.clinicAppointments.set(appointmentId, {
      appointmentId,
      status: 'confirmed',
      startsAt: '2030-01-02T04:00:00.000Z',
      bookingKind: 'initial'
    });
    const payload = buildClinicCalendarEventBody({
      eventId,
      appointmentId,
      appointmentStatus: 'confirmed',
      bookingKind: 'initial',
      startsAt: '2030-01-02T04:00:00.000Z',
      endsAt: '2030-01-02T05:00:00.000Z',
      colorId: '10',
      clinicName: '一森渼診所',
      clinicAddress: 'synthetic-location',
      correlationId: 'corr_calendar_001'
    });
    const baseline = {
      id: eventId,
      etag: 'etag-echo',
      status: 'confirmed' as const,
      summary: payload.summary,
      start: payload.start,
      end: payload.end,
      extendedProperties: payload.extendedProperties
    };
    await new CalendarSyncEngine(
      new FakeReader([{ events: [baseline], nextSyncToken: 'sync-echo' }]),
      repository
    ).run(NOW);

    const changed = {
      ...baseline,
      etag: 'etag-manual-edit',
      start: { dateTime: '2030-01-03T04:00:00.000Z' },
      end: { dateTime: '2030-01-03T05:00:00.000Z' }
    };
    const summary = await new CalendarSyncEngine(
      new FakeReader([{ events: [changed], nextSyncToken: 'sync-edit' }]),
      repository
    ).run(NOW);
    expect(summary.candidates).toBe(1);
    expect(repository.commits[1]?.mutations[0]?.candidate).toMatchObject({
      kind: 'update_appointment',
      localRecordId: appointmentId,
      changedFields: expect.arrayContaining(['startsAt'])
    });
  });

  it('marks an unknown manually created Calendar event unmatched', async () => {
    const repository = new MemoryRepository();
    const reader = new FakeReader([
      {
        events: [
          {
            id: 'manual-event',
            etag: 'etag-manual',
            status: 'confirmed',
            summary: 'Lunch with a friend',
            start: { dateTime: '2026-09-02T14:00:00+08:00' },
            end: { dateTime: '2026-09-02T15:00:00+08:00' }
          }
        ],
        nextSyncToken: 'sync-unmatched'
      }
    ]);
    const summary = await new CalendarSyncEngine(reader, repository).run(NOW);
    expect(summary.candidates).toBe(1);
    expect(repository.commits[0]?.mutations[0]?.candidate?.kind).toBe(
      'unmatched'
    );
    expect(repository.clinicAppointments.size).toBe(0);
  });

  it('deduplicates the same change notification to one candidate', async () => {
    const repository = new MemoryRepository();
    const page = {
      events: [appointment('event-1', 'etag-dup')],
      nextSyncToken: 'sync-dup'
    };
    await new CalendarSyncEngine(new FakeReader([page]), repository).run(NOW);
    const second = await new CalendarSyncEngine(
      new FakeReader([
        {
          events: [appointment('event-1', 'etag-dup')],
          nextSyncToken: 'sync-dup-2'
        }
      ]),
      repository
    ).run('2026-08-28T08:05:00.000Z');
    const created = repository.commits.flatMap((commit) =>
      commit.mutations.filter((mutation) => mutation.candidate !== undefined)
    );
    expect(created).toHaveLength(1);
    expect(second.candidates).toBe(0);
  });

  it('keeps the previous sync token when the committing page fails', async () => {
    const repository = new MemoryRepository();
    repository.state = {
      sourceId: 'source_a',
      syncToken: 'old-token',
      lastFullSyncAt: '2026-08-28T07:30:00.000Z'
    };
    const original = repository.commitSync.bind(repository);
    repository.commitSync = (commit) => {
      if (commit.nextSyncToken !== undefined)
        return Promise.reject(new Error('crash before token persist'));
      return original(commit);
    };
    await expect(
      new CalendarSyncEngine(
        new FakeReader([
          {
            events: [appointment('event-1', 'etag-1')],
            nextSyncToken: 'new-token'
          }
        ]),
        repository
      ).run('2026-08-28T08:05:00.000Z')
    ).rejects.toThrow('crash before token persist');
    expect(repository.state.syncToken).toBe('old-token');
  });

  it('rebuilds after 410 without writing authoritative appointments', async () => {
    const repository = new MemoryRepository();
    const live = {
      appointmentId: 'appointment_001',
      status: 'confirmed',
      startsAt: '2030-01-02T04:00:00.000Z',
      bookingKind: 'initial' as const
    };
    repository.clinicAppointments.set('appointment_001', live);
    repository.state = {
      sourceId: 'source_a',
      syncToken: 'expired-token',
      lastFullSyncAt: '2026-08-28T07:00:00.000Z'
    };
    const reader = new FakeReader([
      new CalendarSyncTokenExpiredError('gone'),
      { events: [appointment('event-1', 'etag-1')], nextSyncToken: 'fresh' }
    ]);
    await new CalendarSyncEngine(reader, repository).run(NOW);
    expect(repository.cleared).toBe(1);
    expect(repository.state.syncToken).toBe('fresh');
    expect(repository.clinicAppointments.get('appointment_001')).toEqual(live);
  });
});
