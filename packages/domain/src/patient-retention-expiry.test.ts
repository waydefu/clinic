import { describe, expect, it } from 'vitest';

import {
  planExpiredPatientArchive,
  RETENTION_EXPIRY_REASON_CODE,
  RETENTION_EXPIRY_SYSTEM_ACTOR_REF
} from './business-delivery-retention.js';

const baseInput = {
  scopeId: 'scope_c1',
  resourceId: 'resource_001',
  requestId: 'request_auto_001',
  state: 'active' as const,
  nowAt: '2030-01-01T00:00:00.000Z',
  appointmentStartsAt: ['2028-01-01T00:00:00.000Z'],
  legalHold: false,
  policy: { recoverableDays: 30 }
};

function planExpiry(
  overrides: Partial<Parameters<typeof planExpiredPatientArchive>[0]> = {}
) {
  return planExpiredPatientArchive({ ...baseInput, ...overrides });
}

describe('planExpiredPatientArchive', () => {
  it('archives at the exact two-year UTC anniversary', () => {
    const result = planExpiry();
    expect(result).toMatchObject({
      operation: 'archive',
      resourceId: 'resource_001',
      requestId: 'request_auto_001',
      resultingState: 'archived',
      archivedAt: '2030-01-01T00:00:00.000Z',
      recoverableUntil: '2030-01-31T00:00:00.000Z',
      auditRequired: true,
      backupTreatment: 'unchanged_separate_process',
      dependencyCheck: 'not_required',
      idempotency: 'new_operation',
      actorRef: RETENTION_EXPIRY_SYSTEM_ACTOR_REF,
      reasonCode: RETENTION_EXPIRY_REASON_CODE
    });
    expect(result.operation).toBe('archive');
    expect(result).not.toHaveProperty('proof');
    expect(result).not.toHaveProperty('reauthenticationReference');
  });

  it('rejects before the exact two-year UTC anniversary', () => {
    expect(() => planExpiry({ nowAt: '2029-12-31T23:59:59.999Z' })).toThrow();
  });

  it.each([
    {
      label: 'a later 2029 appointment',
      appointmentStartsAt: [
        '2029-01-01T00:00:00.000Z',
        '2028-01-01T00:00:00.000Z'
      ]
    },
    {
      label: 'a future 2031 appointment',
      appointmentStartsAt: [
        '2031-01-01T00:00:00.000Z',
        '2028-01-01T00:00:00.000Z'
      ]
    }
  ])(
    'rejects unsorted appointments containing $label',
    ({ appointmentStartsAt }: { appointmentStartsAt: readonly unknown[] }) => {
      expect(() => planExpiry({ appointmentStartsAt })).toThrow();
    }
  );

  it('rejects legal hold, an unknown hold value and an unknown state', () => {
    expect(() => planExpiry({ legalHold: true })).toThrow();
    expect(() => planExpiry({ legalHold: undefined as never })).toThrow();
    expect(() => planExpiry({ legalHold: 'false' as never })).toThrow();
    expect(() => planExpiry({ state: 'unknown' as never })).toThrow();
  });

  it.each([
    { label: 'no appointments', appointmentStartsAt: [] },
    {
      label: 'an invalid calendar date',
      appointmentStartsAt: ['2028-02-30T00:00:00.000Z']
    },
    {
      label: 'a non-UTC offset',
      appointmentStartsAt: ['2028-01-01T00:00:00+08:00']
    },
    {
      label: 'an invalid timestamp format',
      appointmentStartsAt: ['not-a-time']
    }
  ])(
    'rejects $label',
    ({ appointmentStartsAt }: { appointmentStartsAt: readonly unknown[] }) => {
      expect(() => planExpiry({ appointmentStartsAt })).toThrow();
    }
  );

  it('rejects a non-UTC nowAt', () => {
    expect(() => planExpiry({ nowAt: '2030-01-01T00:00:00+08:00' })).toThrow();
  });

  it('rejects a permanently deleted resource', () => {
    expect(() => planExpiry({ state: 'permanently_deleted' })).toThrow();
  });

  it('keeps an already archived resource and its original recovery window', () => {
    expect(
      planExpiry({
        state: 'archived',
        archivedAt: '2029-12-01T00:00:00.000Z',
        recoverableUntil: '2029-12-31T00:00:00.000Z'
      })
    ).toMatchObject({
      operation: 'archive',
      resultingState: 'archived',
      archivedAt: '2029-12-01T00:00:00.000Z',
      recoverableUntil: '2029-12-31T00:00:00.000Z',
      auditRequired: true,
      idempotency: 'already_applied',
      actorRef: RETENTION_EXPIRY_SYSTEM_ACTOR_REF,
      reasonCode: RETENTION_EXPIRY_REASON_CODE
    });
  });

  it('rejects a malformed original archive boundary', () => {
    expect(() =>
      planExpiry({
        state: 'archived',
        archivedAt: '2029-12-01T00:00:00.000Z',
        recoverableUntil: '2030-01-01T00:00:00.000Z'
      })
    ).toThrow();
  });

  it('rejects non-opaque identifiers', () => {
    expect(() => planExpiry({ scopeId: 'scope/c1' })).toThrow();
  });

  it('uses the conservative UTC anniversary for a leap-day appointment', () => {
    expect(() =>
      planExpiry({
        nowAt: '2030-02-28T00:00:00.000Z',
        appointmentStartsAt: ['2028-02-29T00:00:00.000Z']
      })
    ).toThrow();
    expect(
      planExpiry({
        nowAt: '2030-03-01T00:00:00.000Z',
        appointmentStartsAt: ['2028-02-29T00:00:00.000Z']
      })
    ).toMatchObject({
      operation: 'archive',
      resultingState: 'archived',
      archivedAt: '2030-03-01T00:00:00.000Z',
      actorRef: RETENTION_EXPIRY_SYSTEM_ACTOR_REF,
      reasonCode: RETENTION_EXPIRY_REASON_CODE
    });
  });
});
