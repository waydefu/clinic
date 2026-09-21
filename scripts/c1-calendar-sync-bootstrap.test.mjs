import { describe, expect, it } from 'vitest';

import {
  C1_CALENDAR_SYNC_SOURCE_ID,
  planC1CalendarSyncBootstrap
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
