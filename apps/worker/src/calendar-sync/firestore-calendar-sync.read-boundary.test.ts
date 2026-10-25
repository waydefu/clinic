import type { Firestore } from 'firebase-admin/firestore';
import { describe, expect, it, vi } from 'vitest';

import { FirestoreCalendarSyncRepository } from './firestore-calendar-sync.repository.js';

function repository(value: unknown) {
  const snapshot = { exists: value !== undefined, data: () => value };
  const writes = vi.fn();
  const db = {
    collection: () => ({ doc: () => ({ get: async () => snapshot }) }),
    runTransaction: writes
  } as unknown as Firestore;
  return {
    repository: new FirestoreCalendarSyncRepository(db, 'synthetic'.repeat(8)),
    writes
  };
}

const configuration = {
  activeSourceId: 'synthetic_source',
  version: 1,
  expiresAt: '2030-01-03T00:00:00Z'
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

describe('CAL-PILOT worker stored read boundary', () => {
  it('keeps a missing source distinct from a malformed source', async () => {
    await expect(
      repository(undefined).repository.findSource('synthetic_source')
    ).resolves.toBeUndefined();
    await expect(
      repository({ enabled: true }).repository.findSource('synthetic_source')
    ).rejects.toThrow('Unreadable CAL-PILOT record.');
  });

  it('accepts an allowlisted source without coercing persisted values', async () => {
    const source = { displayName: 'Synthetic source', enabled: true };
    await expect(
      repository(source).repository.findSource('synthetic_source')
    ).resolves.toEqual({ sourceId: 'synthetic_source', ...source });
  });

  it.each([
    { displayName: 'Synthetic source' },
    { syncToken: 'synthetic_token' },
    { lastSyncedAt: '2030-01-02T00:00:00Z' }
  ])('reads sync state without unrelated source fields', async (value) => {
    const result =
      await repository(value).repository.loadSyncState('synthetic_source');
    expect(result.sourceId).toBe('synthetic_source');
    expect(result.syncToken).toBe(
      'syncToken' in value ? value.syncToken : undefined
    );
    expect(result.lastSuccessfulSyncAt).toBe(
      'lastSyncedAt' in value ? value.lastSyncedAt : undefined
    );
  });

  it.each([
    { syncToken: 12 },
    { lastSyncedAt: 'Jul 25 2026 Z' },
    { lastFullSyncAt: '2030-02-30T00:00:00Z' },
    { schemaVersion: 2 }
  ])('still rejects malformed sync state without a write', async (value) => {
    const store = repository(value);
    await expect(
      store.repository.loadSyncState('synthetic_source')
    ).rejects.toThrow('Unreadable CAL-PILOT record.');
    expect(store.writes).not.toHaveBeenCalled();
  });

  it('accepts the existing configuration without a new data version', async () => {
    await expect(
      repository(configuration).repository.loadSourceConfiguration()
    ).resolves.toEqual(configuration);
  });

  it.each([
    null,
    [],
    { ...configuration, version: -1 },
    { ...configuration, expiresAt: 'Jul 25 2026 Z' },
    { ...configuration, schemaVersion: 2 }
  ])('fails closed on malformed configuration', async (value) => {
    const store = repository(value);
    await expect(store.repository.loadSourceConfiguration()).rejects.toThrow(
      'Unreadable CAL-PILOT record.'
    );
    expect(store.writes).not.toHaveBeenCalled();
  });

  it('accepts the same completed preflight as the API', async () => {
    await expect(
      repository(preflight).repository.findPreflight('synthetic_preflight')
    ).resolves.toEqual(preflight);
  });

  it.each([
    { ...preflight, readable: 'true' },
    { ...preflight, expectedVersion: -1 },
    { ...preflight, expiresAt: '2030-01-02T24:00:00Z' },
    { ...preflight, schemaVersion: 2 }
  ])('rejects malformed preflight before any worker write', async (value) => {
    const store = repository(value);
    await expect(
      store.repository.findPreflight('synthetic_preflight')
    ).rejects.toThrow('Unreadable CAL-PILOT record.');
    expect(store.writes).not.toHaveBeenCalled();
  });
});
