import type { Firestore } from 'firebase-admin/firestore';
import { describe, expect, it, vi } from 'vitest';

import { FirestoreCalendarSyncRepository } from './firestore-calendar-sync.repository.js';

function repository(value: unknown) {
  const snapshot = {
    exists: value !== undefined,
    data: () => value,
    updateTime: { seconds: 1, nanoseconds: 0 }
  };
  const writes = vi.fn();
  const db = {
    collection: () => ({
      doc: () => ({ get: () => Promise.resolve(snapshot) })
    }),
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
  it.each(['2030-01-02T00:00:00Z', '2030-01-02T00:00:00.123456789Z'])(
    'preserves a minimal authoritative projection with UTC startsAt %s',
    async (startsAt) => {
      const value = { status: 'confirmed', startsAt, bookingKind: 'initial' };
      const store = repository(value);
      await expect(
        store.repository.loadAuthoritativeAppointment('synthetic_appointment')
      ).resolves.toEqual({
        appointmentId: 'synthetic_appointment',
        ...value,
        readVersion: { seconds: 1, nanoseconds: 0 }
      });
      expect(store.writes).not.toHaveBeenCalled();
    }
  );

  it.each([
    'Jul 25 2030 Z',
    '2030-02-30T00:00:00Z',
    '2030-01-02T24:00:00Z',
    '2030-01-02T00:00:00+08:00',
    '2030-01-02',
    ''
  ])('does not admit stored authoritative startsAt %s', async (startsAt) => {
    const store = repository({
      status: 'confirmed',
      startsAt,
      bookingKind: 'initial'
    });
    await expect(
      store.repository.loadAuthoritativeAppointment('synthetic_appointment')
    ).resolves.toBeUndefined();
    expect(store.writes).not.toHaveBeenCalled();
  });

  it('keeps a missing authoritative appointment absent', async () => {
    await expect(
      repository(undefined).repository.loadAuthoritativeAppointment(
        'synthetic_appointment'
      )
    ).resolves.toBeUndefined();
  });

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

  it.each([{ ids: [] }, { ids: ['synthetic_enabled'] }])(
    'projects only enabled patient references for configuration: %j',
    async ({ ids }) => {
      const data = vi.fn(() => {
        throw new Error('Patient fields must not be consumed.');
      });
      const get = vi.fn().mockResolvedValue({
        docs: ids.map((id) => ({ id, data }))
      });
      const select = vi.fn(() => ({ get }));
      const where = vi.fn(() => ({ select, get }));
      const db = {
        collection: (name: string) =>
          name === 'calendar_pilot_patients'
            ? { where }
            : {
                doc: () => ({
                  get: () =>
                    Promise.resolve({ exists: true, data: () => configuration })
                })
              }
      } as unknown as Firestore;

      const result = await new FirestoreCalendarSyncRepository(
        db,
        'synthetic'.repeat(8)
      ).loadConfiguration();

      expect(where).toHaveBeenCalledExactlyOnceWith('enabled', '==', true);
      expect(select).toHaveBeenCalledExactlyOnceWith();
      expect(get).toHaveBeenCalledOnce();
      expect(data).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        ...configuration,
        sourceVersion: configuration.version,
        knownPatientCodes: new Set(ids)
      });
    }
  );

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
