import type { Firestore } from 'firebase-admin/firestore';
import { describe, expect, it, vi } from 'vitest';

import { FirestoreCalendarPilotRepository } from './calendar-pilot.repository.js';

function store(value: unknown, blocks: readonly unknown[] = []) {
  const snapshot = { exists: value !== undefined, data: () => value };
  const query = {
    get: () =>
      Promise.resolve({
        docs: blocks.map((block, index) => ({
          id: `synthetic_block_${index}`,
          exists: true,
          data: () => block
        }))
      })
  };
  const collection = vi.fn((name: string) => ({
    doc: () => ({
      get: () =>
        Promise.resolve(
          name === 'calendar_pilot_sources' ? { exists: false } : snapshot
        )
    }),
    where: () => ({
      orderBy: () => ({ limit: () => query }),
      count: () => ({
        get: () => Promise.resolve({ data: () => ({ count: 0 }) })
      })
    })
  }));
  const runTransaction = vi.fn();
  const db = { collection, runTransaction } as unknown as Firestore;
  return {
    repository: new FirestoreCalendarPilotRepository(db),
    collection,
    runTransaction
  };
}

const configuration = {
  activeSourceId: 'synthetic_source',
  version: 1,
  expiresAt: '2030-01-03T00:00:00Z',
  health: 'healthy',
  lastSuccessfulSyncAt: null,
  nextScheduledSyncAt: null,
  inboundEnabled: true,
  outboundEnabled: true
};
const preflight = {
  preflightId: 'synthetic_preflight',
  sourceId: 'synthetic_source',
  expectedVersion: 1,
  status: 'passed',
  readable: true,
  writable: true,
  scannedEvents: 0,
  validEvents: 0,
  invalidEvents: 0,
  completedAt: '2030-01-02T00:00:00Z',
  expiresAt: '2030-01-02T00:15:00Z'
};

describe('CAL-PILOT API stored read boundary', () => {
  it('accepts the existing configuration and empty availability', async () => {
    const { repository, runTransaction } = store(configuration);
    await expect(
      repository.getAvailability('2030-01-02T00:00:00Z')
    ).resolves.toEqual({
      generatedAt: '2030-01-02T00:00:00Z',
      sourceVersion: 1,
      blocks: []
    });
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it('accepts an existing availability block without rewriting it', async () => {
    const block = {
      kind: 'appointment',
      bookingKind: 'initial',
      startsAt: '2030-01-02T00:00:00Z',
      endsAt: '2030-01-02T00:30:00Z',
      displayLabel: 'Synthetic appointment',
      sourceVersion: 1
    };
    const before = structuredClone(block);
    const { repository, runTransaction } = store(configuration, [block]);
    await expect(
      repository.getAvailability(block.startsAt)
    ).resolves.toMatchObject({
      blocks: [
        {
          blockId: 'synthetic_block_0',
          kind: 'appointment',
          bookingKind: 'initial',
          startsAt: block.startsAt,
          endsAt: block.endsAt,
          displayLabel: block.displayLabel
        }
      ]
    });
    expect(block).toEqual(before);
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it.each([
    {
      kind: 'busy',
      startsAt: '2030-01-02T00:00:00Z',
      endsAt: '2030-02-30T00:00:00Z',
      displayLabel: 'Synthetic busy'
    },
    {
      kind: 'unknown',
      startsAt: '2030-01-02T00:00:00Z',
      endsAt: '2030-01-02T00:30:00Z',
      displayLabel: 'Synthetic busy'
    },
    {
      kind: 'appointment',
      bookingKind: 'unknown',
      startsAt: '2030-01-02T00:00:00Z',
      endsAt: '2030-01-02T00:30:00Z',
      displayLabel: 'Synthetic appointment'
    },
    {
      kind: 'busy',
      startsAt: '2030-01-02T00:00:00Z',
      endsAt: '2030-01-02T00:30:00Z',
      displayLabel: 'Synthetic busy',
      schemaVersion: 2
    }
  ])(
    'refuses malformed availability rather than returning success',
    async (block) => {
      const { repository, runTransaction } = store(configuration, [block]);
      await expect(
        repository.getAvailability('2030-01-02T00:00:00Z')
      ).rejects.toThrow('Unreadable CAL-PILOT record.');
      expect(runTransaction).not.toHaveBeenCalled();
    }
  );

  it.each([
    null,
    [],
    { ...configuration, expiresAt: 'Jul 25 2026 Z' },
    { ...configuration, version: -1 },
    { ...configuration, inboundEnabled: 'true' },
    { ...configuration, schemaVersion: 2 }
  ])('refuses malformed configuration before further reads', async (value) => {
    const { repository, collection, runTransaction } = store(value);
    await expect(
      repository.getAvailability('2030-01-02T00:00:00Z')
    ).rejects.toThrow('Unreadable CAL-PILOT record.');
    expect(collection).toHaveBeenCalledTimes(1);
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it('renders omitted sync clocks as null without a write', async () => {
    const legacy = {
      activeSourceId: configuration.activeSourceId,
      version: configuration.version,
      expiresAt: configuration.expiresAt,
      health: configuration.health,
      inboundEnabled: configuration.inboundEnabled,
      outboundEnabled: configuration.outboundEnabled
    };
    const { repository, runTransaction } = store(legacy);
    const result = await repository.getStatus('2030-01-02T00:00:00Z');
    expect(result.lastSuccessfulSyncAt).toBeNull();
    expect(result.nextScheduledSyncAt).toBeNull();
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it('validates the existing preflight wire shape on read', async () => {
    await expect(
      store(preflight).repository.getSourcePreflight('synthetic_preflight')
    ).resolves.toEqual(preflight);
  });

  it.each([
    { ...preflight, status: 'unknown' },
    { ...preflight, writable: 'true' },
    { ...preflight, expectedVersion: -1 },
    { ...preflight, expiresAt: '2030-02-30T00:00:00Z' }
  ])('refuses malformed preflight instead of success', async (value) => {
    const { repository, runTransaction } = store(value);
    await expect(
      repository.getSourcePreflight('synthetic_preflight')
    ).rejects.toThrow('Unreadable CAL-PILOT record.');
    expect(runTransaction).not.toHaveBeenCalled();
  });
});
