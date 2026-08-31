import { describe, expect, it } from 'vitest';

import {
  CalendarSourceSwitchError,
  CalendarSourceSwitchService,
  type CalendarSourceConfiguration,
  type CalendarSourcePreflightResult,
  type CalendarSourceRecord,
  type CalendarSourceSwitchRepository,
  type CalendarSourceSwitchResult
} from './source-switch.js';

const NOW = '2026-08-28T08:00:00.000Z';

class MemoryRepository implements CalendarSourceSwitchRepository {
  public configuration: CalendarSourceConfiguration = {
    activeSourceId: 'source_a',
    version: 1,
    expiresAt: '2026-09-27T08:00:00.000Z'
  };
  public readonly sources = new Map<string, CalendarSourceRecord>([
    [
      'source_a',
      { sourceId: 'source_a', displayName: 'CAL-PILOT A', enabled: true }
    ],
    [
      'source_b',
      { sourceId: 'source_b', displayName: 'CAL-PILOT B', enabled: true }
    ]
  ]);
  public readonly preflights = new Map<string, CalendarSourcePreflightResult>();

  public loadConfiguration(): Promise<CalendarSourceConfiguration> {
    return Promise.resolve(this.configuration);
  }
  public findSource(
    sourceId: string
  ): Promise<CalendarSourceRecord | undefined> {
    return Promise.resolve(this.sources.get(sourceId));
  }
  public savePreflight(result: CalendarSourcePreflightResult): Promise<void> {
    this.preflights.set(result.preflightId, result);
    return Promise.resolve();
  }
  public findPreflight(
    preflightId: string
  ): Promise<CalendarSourcePreflightResult | undefined> {
    return Promise.resolve(this.preflights.get(preflightId));
  }
  public activate(input: {
    sourceId: string;
    expectedVersion: number;
  }): Promise<CalendarSourceSwitchResult> {
    if (input.expectedVersion !== this.configuration.version)
      throw new CalendarSourceSwitchError('stale version');
    const previousSourceId = this.configuration.activeSourceId;
    this.configuration = {
      ...this.configuration,
      activeSourceId: input.sourceId,
      previousSourceId,
      version: this.configuration.version + 1
    };
    return Promise.resolve({
      activeSourceId: input.sourceId,
      previousSourceId,
      version: this.configuration.version
    });
  }
}

function service(
  repository: MemoryRepository,
  writable = true
): CalendarSourceSwitchService {
  return new CalendarSourceSwitchService(
    repository,
    {
      probe: () =>
        Promise.resolve({
          readable: true,
          writable,
          scannedEvents: 29,
          validEvents: 27,
          invalidEvents: 2
        })
    },
    () => 'preflight_001'
  );
}

describe('CalendarSourceSwitchService', () => {
  it('keeps the old source active when write preflight fails', async () => {
    const repository = new MemoryRepository();
    const switcher = service(repository, false);
    const preflight = await switcher.preflight('source_b', NOW);

    await expect(
      switcher.activate({
        sourceId: 'source_b',
        expectedVersion: 1,
        preflightId: preflight.preflightId,
        now: NOW
      })
    ).rejects.toThrow('read/write preflight');
    expect(repository.configuration.activeSourceId).toBe('source_a');
  });

  it('activates atomically and retains exactly one previous source', async () => {
    const repository = new MemoryRepository();
    const switcher = service(repository);
    const preflight = await switcher.preflight('source_b', NOW);

    await expect(
      switcher.activate({
        sourceId: 'source_b',
        expectedVersion: 1,
        preflightId: preflight.preflightId,
        now: NOW
      })
    ).resolves.toEqual({
      activeSourceId: 'source_b',
      previousSourceId: 'source_a',
      version: 2
    });
  });

  it('rejects stale activation even when an old preflight passed', async () => {
    const repository = new MemoryRepository();
    const switcher = service(repository);
    const preflight = await switcher.preflight('source_b', NOW);
    repository.configuration = { ...repository.configuration, version: 2 };

    await expect(
      switcher.activate({
        sourceId: 'source_b',
        expectedVersion: 1,
        preflightId: preflight.preflightId,
        now: NOW
      })
    ).rejects.toThrow('changed');
    expect(repository.configuration.activeSourceId).toBe('source_a');
  });

  it('rolls back only after the previous source passes a fresh preflight', async () => {
    const repository = new MemoryRepository();
    const switcher = service(repository);
    const toB = await switcher.preflight('source_b', NOW);
    await switcher.activate({
      sourceId: 'source_b',
      expectedVersion: 1,
      preflightId: toB.preflightId,
      now: NOW
    });

    const later = '2026-08-28T08:05:00.000Z';
    const toA = await switcher.preflight('source_a', later);
    await expect(switcher.rollback(toA.preflightId, 2, later)).resolves.toEqual(
      {
        activeSourceId: 'source_a',
        previousSourceId: 'source_b',
        version: 3
      }
    );
  });
});
