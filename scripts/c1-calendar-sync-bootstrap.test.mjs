import { describe, expect, it } from 'vitest';

import {
  C1_CALENDAR_SYNC_SOURCE_ID,
  planC1CalendarSyncBootstrap,
  renewC1CalendarSync
} from './c1-calendar-sync-bootstrap.mjs';

const NOW = new Date('2026-09-20T12:00:00.000Z');

function environment(overrides = {}) {
  return {
    GOOGLE_CLOUD_PROJECT: 'beauessence-clinic-stg-c1a01',
    C1_CALENDAR_SYNC_BOOTSTRAP_CONFIRM: 'YES',
    C1_CALENDAR_SYNC_AUTHORITY_SHA: 'a'.repeat(40),
    C1_CALENDAR_SYNC_EXPIRES_AT: '2026-10-20T12:00:00.000Z',
    ...overrides
  };
}

describe('C1 Calendar sync bootstrap gate', () => {
  it.each([
    '2026-02-30T12:00:00Z',
    '2026-02-28T24:00:00Z',
    '2026-02-29T12:00:00Z'
  ])('rejects a normalized rather than real UTC expiry %s', (expiresAt) => {
    expect(() =>
      planC1CalendarSyncBootstrap(
        environment({ C1_CALENDAR_SYNC_EXPIRES_AT: expiresAt }),
        new Date('2026-02-20T12:00:00Z')
      )
    ).toThrow('C1_CALENDAR_SYNC_EXPIRES_AT must be an exact UTC timestamp.');
  });

  it('retains a real leap day and approved fractional UTC precision', () => {
    const expiresAt = '2028-02-29T12:00:00.123456Z';
    expect(
      planC1CalendarSyncBootstrap(
        environment({ C1_CALENDAR_SYNC_EXPIRES_AT: expiresAt }),
        new Date('2028-02-20T12:00:00Z')
      ).configuration.expiresAt
    ).toBe(expiresAt);
  });

  it('plans one bounded synthetic source without credentials', () => {
    const plan = planC1CalendarSyncBootstrap(environment(), NOW);
    expect(plan.configuration).toMatchObject({
      activeSourceId: C1_CALENDAR_SYNC_SOURCE_ID,
      inboundEnabled: true,
      outboundEnabled: true,
      synthetic: true,
      sourceSha: 'a'.repeat(40)
    });
    expect(JSON.stringify(plan)).not.toMatch(
      /SERVICE_ACCOUNT|GOOGLE_APPLICATION_CREDENTIALS|private_key/u
    );
  });

  it('refuses another project, missing confirmation, or an overlong window', () => {
    expect(() =>
      planC1CalendarSyncBootstrap(
        environment({ GOOGLE_CLOUD_PROJECT: 'beauessence-clinic-staging' }),
        NOW
      )
    ).toThrow(/outside the isolated project/u);
    expect(() =>
      planC1CalendarSyncBootstrap(
        environment({ C1_CALENDAR_SYNC_BOOTSTRAP_CONFIRM: 'NO' }),
        NOW
      )
    ).toThrow(/explicit confirmation/u);
    expect(() =>
      planC1CalendarSyncBootstrap(
        environment({
          C1_CALENDAR_SYNC_EXPIRES_AT: '2026-11-20T12:00:00.000Z'
        }),
        NOW
      )
    ).toThrow(/no more than 31 days/u);
  });
});

describe('C1 Calendar sync renewal', () => {
  const RENEW_NOW = new Date('2026-11-07T12:00:00.000Z');
  const renewEnv = (overrides = {}) =>
    environment({
      C1_CALENDAR_SYNC_EXPIRES_AT: '2026-12-07T12:00:00.000Z',
      C1_CALENDAR_SYNC_OPERATOR: 'operator-a',
      C1_CALENDAR_SYNC_RENEW_REASON: 'owner approved C1 window',
      ...overrides
    });
  const config = (overrides = {}) => ({
    synthetic: true,
    activeSourceId: C1_CALENDAR_SYNC_SOURCE_ID,
    expiresAt: '2026-09-30T00:00:00.000Z',
    workerLeaseOwner: null,
    version: 1,
    health: 'idle',
    ...overrides
  });

  function fakeDb(docs) {
    const writes = [];
    const snap = (key) => ({
      exists: docs[key] !== undefined,
      data: () => docs[key]
    });
    return {
      writes,
      collection: (name) => ({
        doc: (id) => ({ key: `${name}/${id}` })
      }),
      runTransaction: async (callback) =>
        callback({
          get: async (ref) => snap(ref.key),
          update: (ref, data) => writes.push(['update', ref.key, data]),
          create: (ref, data) => writes.push(['create', ref.key, data])
        })
    };
  }
  const state = (configOverrides, source = { synthetic: true }) => ({
    'calendar_pilot_configuration/active': config(configOverrides),
    [`calendar_pilot_sources/${C1_CALENDAR_SYNC_SOURCE_ID}`]: source
  });
  const renew = (db, overrides) =>
    renewC1CalendarSync(renewEnv(overrides), RENEW_NOW, db);

  it('renews only expiry and version, and writes an audit', async () => {
    const db = fakeDb(state());
    await renew(db);
    expect(db.writes).toHaveLength(2);
    expect(db.writes[0]).toEqual([
      'update',
      'calendar_pilot_configuration/active',
      { expiresAt: '2026-12-07T12:00:00.000Z', version: 2 }
    ]);
    expect(db.writes[1][0]).toBe('create');
    expect(db.writes[1][2]).toMatchObject({
      action: 'c1_calendar_sync_renewed',
      previousExpiresAt: '2026-09-30T00:00:00.000Z',
      expiresAt: '2026-12-07T12:00:00.000Z',
      operator: 'operator-a',
      reason: 'owner approved C1 window'
    });
  });

  it.each([
    ['still-active config', { expiresAt: '2026-12-01T00:00:00.000Z' }],
    ['non-synthetic config', { synthetic: false }],
    ['other source', { activeSourceId: 'other' }],
    ['held lease', { workerLeaseOwner: 'worker-1' }]
  ])('refuses %s without writing', async (_name, overrides) => {
    const db = fakeDb(state(overrides));
    await expect(renew(db)).rejects.toThrow();
    expect(db.writes).toEqual([]);
  });

  it('accepts expiry at the exact boundary but refuses malformed expiry', async () => {
    const atBoundary = fakeDb(state({ expiresAt: RENEW_NOW.toISOString() }));
    await renew(atBoundary);
    expect(atBoundary.writes).toHaveLength(2);

    for (const expiresAt of [undefined, '', '2026-02-30T12:00:00Z']) {
      const db = fakeDb(state({ expiresAt }));
      await expect(renew(db)).rejects.toThrow(/unexpired config/u);
      expect(db.writes).toEqual([]);
    }
  });

  it('refuses a non-synthetic source or missing documents', async () => {
    const bad = fakeDb(state({}, { synthetic: false }));
    await expect(renew(bad)).rejects.toThrow(/non-C1 state/u);
    const none = fakeDb({});
    await expect(renew(none)).rejects.toThrow(/existing state/u);
    expect(bad.writes.concat(none.writes)).toEqual([]);
  });

  it('refuses an expiry beyond 31 days or a missing operator', async () => {
    const db = fakeDb(state());
    await expect(
      renew(db, { C1_CALENDAR_SYNC_EXPIRES_AT: '2027-01-07T12:00:00.000Z' })
    ).rejects.toThrow(/no more than 31 days/u);
    await expect(renew(db, { C1_CALENDAR_SYNC_OPERATOR: '' })).rejects.toThrow(
      /OPERATOR/u
    );
    expect(db.writes).toEqual([]);
  });
});
