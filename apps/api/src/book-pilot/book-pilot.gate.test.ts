import { describe, expect, it } from 'vitest';

import { ServiceUnavailableError } from '../platform/errors/api-error.js';
import { assertBookPilotWritable } from './book-pilot.gate.js';

const FUTURE = '2026-12-01T00:00:00.000Z';
const NOW = '2026-09-09T00:00:00.000Z';
const PAST = '2026-01-01T00:00:00.000Z';

describe('assertBookPilotWritable', () => {
  it('allows a write when the kill switch is on and now is before expiry', () => {
    expect(() =>
      assertBookPilotWritable(NOW, { enabled: true, expiresAtUtc: FUTURE })
    ).not.toThrow();
  });

  it('refuses a write when the kill switch is off', () => {
    expect(() =>
      assertBookPilotWritable(NOW, { enabled: false, expiresAtUtc: FUTURE })
    ).toThrow(ServiceUnavailableError);
  });

  it('refuses a write when expiry is missing', () => {
    expect(() =>
      assertBookPilotWritable(NOW, { enabled: true, expiresAtUtc: undefined })
    ).toThrow(ServiceUnavailableError);
  });

  it('refuses a write when expiry is unparsable', () => {
    expect(() =>
      assertBookPilotWritable(NOW, {
        enabled: true,
        expiresAtUtc: 'not-a-date'
      })
    ).toThrow(ServiceUnavailableError);
  });

  it('refuses a write at the recorded expiry instant', () => {
    expect(() =>
      assertBookPilotWritable(FUTURE, { enabled: true, expiresAtUtc: FUTURE })
    ).toThrow(ServiceUnavailableError);
  });

  it('refuses a write after expiry', () => {
    expect(() =>
      assertBookPilotWritable(NOW, { enabled: true, expiresAtUtc: PAST })
    ).toThrow(ServiceUnavailableError);
  });

  it('refuses a write when nowUtc is unparsable', () => {
    expect(() =>
      assertBookPilotWritable('not-a-date', {
        enabled: true,
        expiresAtUtc: FUTURE
      })
    ).toThrow(ServiceUnavailableError);
  });
});
