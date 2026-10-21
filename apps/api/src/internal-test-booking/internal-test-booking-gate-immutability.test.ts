import { describe, expect, it } from 'vitest';

import { ServiceUnavailableError } from '../platform/errors/api-error.js';
import {
  assertInternalTestBookingWritable,
  INTERNAL_TEST_BOOKING_FORBIDDEN_PROJECTS,
  INTERNAL_TEST_BOOKING_PROJECT_ALLOWLIST
} from './internal-test-booking.gate.js';

const NOW = '2026-09-13T00:00:00.000Z';
const OPEN = {
  enabled: true,
  expiresAtUtc: '2026-12-01T00:00:00.000Z',
  projectId: 'beauessence-clinic-stg-c1a01',
  emulatorHost: undefined
};

describe('internal booking authority cannot be mutated through exports', () => {
  it('keeps the approved list authoritative if the exported view is changed', () => {
    const original = [...INTERNAL_TEST_BOOKING_PROJECT_ALLOWLIST];
    try {
      INTERNAL_TEST_BOOKING_PROJECT_ALLOWLIST.clear();
      INTERNAL_TEST_BOOKING_PROJECT_ALLOWLIST.add('synthetic_unapproved_project');
      expect(() => assertInternalTestBookingWritable(NOW, OPEN)).not.toThrow();
      expect(() =>
        assertInternalTestBookingWritable(NOW, {
          ...OPEN,
          projectId: 'synthetic_unapproved_project'
        })
      ).toThrow(ServiceUnavailableError);
    } finally {
      INTERNAL_TEST_BOOKING_PROJECT_ALLOWLIST.clear();
      for (const project of original)
        INTERNAL_TEST_BOOKING_PROJECT_ALLOWLIST.add(project);
    }
  });

  it('cannot remove a forbidden project even with an emulator override', () => {
    const original = [...INTERNAL_TEST_BOOKING_FORBIDDEN_PROJECTS];
    try {
      INTERNAL_TEST_BOOKING_FORBIDDEN_PROJECTS.clear();
      expect(() =>
        assertInternalTestBookingWritable(NOW, {
          ...OPEN,
          projectId: 'beauessence-clinic-staging',
          emulatorHost: '127.0.0.1:8080'
        })
      ).toThrow(ServiceUnavailableError);
    } finally {
      for (const project of original)
        INTERNAL_TEST_BOOKING_FORBIDDEN_PROJECTS.add(project);
    }
  });
});
