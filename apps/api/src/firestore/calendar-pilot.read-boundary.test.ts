import type { Firestore } from 'firebase-admin/firestore';
import { describe, expect, it, vi } from 'vitest';

import { FirestoreCalendarPilotRepository } from './calendar-pilot.repository.js';

function store(value: unknown) {
  const snapshot = { exists: value !== undefined, data: () => value };
  const query = { get: async () => ({ docs: [] }) };
  const collection = vi.fn(() => ({
    doc: () => ({ get: async () => snapshot }),
    where: () => ({ orderBy: () => ({ limit: () => query }) })
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
