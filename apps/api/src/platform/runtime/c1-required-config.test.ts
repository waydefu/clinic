import { describe, expect, it } from 'vitest';

import {
  API_CLOUD_ALWAYS_REQUIRED_ENV,
  apiCloudRequiredConfigPresent
} from './c1-required-config.js';

function presentEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const present: NodeJS.ProcessEnv = {};
  for (const name of API_CLOUD_ALWAYS_REQUIRED_ENV) present[name] = 'set';
  present.GOOGLE_CLOUD_PROJECT = 'beauessence-clinic-stg-c1a01';
  present.INTERNAL_TEST_BOOKING_ENABLED = 'false';
  present.INTERNAL_TEST_SOURCE_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  return { ...present, ...overrides };
}

describe('isolated C1 API required config', () => {
  it('stays open for emulator and non-C1 local processes', () => {
    expect(
      apiCloudRequiredConfigPresent({
        FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080'
      })
    ).toBe(true);
    expect(apiCloudRequiredConfigPresent({})).toBe(true);
  });

  it('fails closed on isolated C1 cloud when a required value is missing', () => {
    expect(
      apiCloudRequiredConfigPresent({
        GOOGLE_CLOUD_PROJECT: 'beauessence-clinic-stg-c1a01'
      })
    ).toBe(false);
    expect(apiCloudRequiredConfigPresent(presentEnv())).toBe(true);
  });

  it('requires booking expiry only when isolated booking writes are enabled', () => {
    expect(
      apiCloudRequiredConfigPresent(
        presentEnv({ INTERNAL_TEST_BOOKING_ENABLED: 'true' })
      )
    ).toBe(false);
    expect(
      apiCloudRequiredConfigPresent(
        presentEnv({
          INTERNAL_TEST_BOOKING_ENABLED: 'true',
          INTERNAL_TEST_BOOKING_EXPIRES_AT_UTC: '2099-01-01T00:00:00.000Z'
        })
      )
    ).toBe(true);
  });
});
