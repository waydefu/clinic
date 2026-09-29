import { describe, expect, it } from 'vitest';

import {
  BusinessMilestonesResponseSchema,
  MilestoneAcknowledgementRequestSchema,
  MonthlyUsageQuerySchema,
  MonthlyUsageResponseSchema
} from './business-delivery.js';

describe('MonthlyUsageQuerySchema', () => {
  it('accepts only a strict YYYY-MM month', () => {
    expect(MonthlyUsageQuerySchema.parse({ month: '2030-10' })).toEqual({
      month: '2030-10'
    });
    for (const month of ['2030-13', '2030-1', '203010', '']) {
      expect(() => MonthlyUsageQuerySchema.parse({ month })).toThrow();
    }
  });

  it('rejects extra query fields such as a client-chosen scope', () => {
    expect(() =>
      MonthlyUsageQuerySchema.parse({ month: '2030-10', scope: 'production' })
    ).toThrow();
  });
});

describe('MilestoneAcknowledgementRequestSchema', () => {
  const base = {
    idempotencyKey: 'ack-key-0000000001',
    expectedVersion: 0,
    evidenceRef: 'evidence_ref_01'
  };

  it('never accepts a client-supplied actor or timestamp', () => {
    expect(() =>
      MilestoneAcknowledgementRequestSchema.parse({
        ...base,
        acknowledgedBy: 'someone'
      })
    ).toThrow();
    expect(() =>
      MilestoneAcknowledgementRequestSchema.parse({
        ...base,
        acknowledgedAt: '2030-10-01T00:00:00.000Z'
      })
    ).toThrow();
  });

  it('requires an opaque evidence reference', () => {
    expect(() =>
      MilestoneAcknowledgementRequestSchema.parse({
        ...base,
        evidenceRef: 'free text with spaces'
      })
    ).toThrow();
  });

  it('accepts a real launch date and rejects an impossible one', () => {
    expect(
      MilestoneAcknowledgementRequestSchema.parse({
        ...base,
        launchDate: '2030-10-15'
      }).launchDate
    ).toBe('2030-10-15');
    expect(() =>
      MilestoneAcknowledgementRequestSchema.parse({
        ...base,
        launchDate: '2030-02-30'
      })
    ).toThrow();
  });
});

describe('response schemas', () => {
  it('reject any extra field so no event or identity can leak', () => {
    const report = {
      policyVersion: 'BD-POLICY-2026-09-29',
      scope: 'internal_synthetic',
      month: '2030-10',
      timeZone: 'Asia/Taipei',
      completeness: 'complete',
      lockedAt: '2030-11-05T16:00:00.000Z',
      uniqueStaffUsers: 1,
      bookingCreatedCount: 2,
      usageClassification: 'used',
      maintenanceFeeTwd: 1800
    };
    expect(MonthlyUsageResponseSchema.parse(report)).toEqual(report);
    expect(() =>
      MonthlyUsageResponseSchema.parse({ ...report, actorIds: ['a'] })
    ).toThrow();
  });

  it('describes the not-started milestone view', () => {
    expect(
      BusinessMilestonesResponseSchema.parse({
        policyVersion: 'BD-POLICY-2026-09-29',
        scope: 'internal_synthetic',
        revision: 0,
        trial: { status: 'not_started' },
        formalLaunch: { status: 'awaiting_acknowledgement' },
        formalOperation: { status: 'not_started' },
        finalPayment: { status: 'blocked' },
        maintenance: { status: 'not_started' }
      }).finalPayment
    ).toEqual({ status: 'blocked' });
  });
});
