import { describe, expect, it } from 'vitest';

import { ServiceUnavailableError } from '../platform/errors/api-error.js';
import {
  assertInternalTestBookingWritable,
  internalTestBookingSettingsFromEnv,
  type InternalTestBookingSettings
} from './internal-test-booking.gate.js';

const OPEN_NOW = '2026-09-13T00:00:00.000Z';

function settings(
  overrides: Partial<InternalTestBookingSettings> = {}
): InternalTestBookingSettings {
  return {
    enabled: true,
    expiresAtUtc: '2026-12-01T00:00:00.000Z',
    projectId: 'beauessence-clinic-stg-c1a01',
    emulatorHost: undefined,
    ...overrides
  };
}

describe('assertInternalTestBookingWritable', () => {
  it('refuses when the kill switch is off', () => {
    expect(() =>
      assertInternalTestBookingWritable(OPEN_NOW, settings({ enabled: false }))
    ).toThrow(ServiceUnavailableError);
  });

  it('refuses missing expiry, forbidden staging, and unknown projects', () => {
    expect(() =>
      assertInternalTestBookingWritable(
        OPEN_NOW,
        settings({ expiresAtUtc: undefined })
      )
    ).toThrow(ServiceUnavailableError);
    expect(() =>
      assertInternalTestBookingWritable(
        OPEN_NOW,
        settings({ projectId: 'beauessence-clinic-staging' })
      )
    ).toThrow(ServiceUnavailableError);
    expect(() =>
      assertInternalTestBookingWritable(
        OPEN_NOW,
        settings({ projectId: 'some-other-project' })
      )
    ).toThrow(ServiceUnavailableError);
  });

  it('allows the isolated project or the Firestore emulator', () => {
    expect(() =>
      assertInternalTestBookingWritable(OPEN_NOW, settings())
    ).not.toThrow();
    expect(() =>
      assertInternalTestBookingWritable(
        OPEN_NOW,
        settings({
          projectId: undefined,
          emulatorHost: '127.0.0.1:8080'
        })
      )
    ).not.toThrow();
  });

  it('reads fail-closed defaults from env', () => {
    const fromEnv = internalTestBookingSettingsFromEnv({});
    expect(fromEnv.enabled).toBe(false);
    expect(() => assertInternalTestBookingWritable(OPEN_NOW, fromEnv)).toThrow(
      ServiceUnavailableError
    );
  });
});
