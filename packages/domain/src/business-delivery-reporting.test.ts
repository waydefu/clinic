import { describe, expect, it } from 'vitest';

import { DomainError } from './errors.js';
import { summarizeMonthlyBusinessUsage } from './business-delivery-reporting.js';

const runtime = (
  eventId: string,
  kind: 'staff_login' | 'booking_created' | 'major_incident' | 'backup_failure',
  occurredAt: string,
  actorId?: string
) => ({ eventId, kind, occurredAt, eventClass: 'runtime' as const, actorId });

describe('summarizeMonthlyBusinessUsage', () => {
  it('uses Taipei month boundaries and deduplicates a replayed event', () => {
    expect(
      summarizeMonthlyBusinessUsage({
        scope: 'internal_synthetic',
        month: '2030-10',
        completeness: 'complete',
        events: [
          runtime(
            'login_001',
            'staff_login',
            '2030-09-30T16:00:00.000Z',
            'staff_1'
          ),
          runtime(
            'login_001',
            'staff_login',
            '2030-09-30T16:00:00.000Z',
            'staff_1'
          ),
          runtime('booking_001', 'booking_created', '2030-10-31T15:59:59.999Z'),
          runtime('incident_001', 'major_incident', '2030-10-31T16:00:00.000Z')
        ]
      })
    ).toEqual({
      scope: 'internal_synthetic',
      month: '2030-10',
      timeZone: 'Asia/Taipei',
      completeness: 'complete',
      uniqueStaffUsers: 1,
      bookingCreatedCount: 1,
      majorIncidentCount: 0,
      backupSuccessCount: 0,
      backupFailureCount: 0,
      usageClassification: 'used'
    });
  });

  it('excludes maintenance and test activity from usage counts', () => {
    expect(
      summarizeMonthlyBusinessUsage({
        scope: 'internal_synthetic',
        month: '2030-10',
        completeness: 'complete',
        events: [
          {
            eventId: 'test_001',
            occurredAt: '2030-10-05T01:00:00.000Z',
            eventClass: 'test',
            kind: 'staff_login',
            actorId: 'test_actor'
          },
          {
            eventId: 'maintenance_001',
            occurredAt: '2030-10-05T02:00:00.000Z',
            eventClass: 'maintenance',
            kind: 'booking_created'
          },
          runtime('backup_001', 'backup_failure', '2030-10-05T03:00:00.000Z')
        ]
      })
    ).toMatchObject({
      uniqueStaffUsers: 0,
      bookingCreatedCount: 0,
      backupFailureCount: 1,
      usageClassification: 'unused'
    });
  });

  it('does not turn incomplete telemetry into an unused claim', () => {
    expect(
      summarizeMonthlyBusinessUsage({
        scope: 'internal_synthetic',
        month: '2030-10',
        completeness: 'partial',
        events: []
      }).usageClassification
    ).toBe('insufficient_evidence');
  });

  it('rejects conflicting replays and missing actor identity for real staff login', () => {
    expect(() =>
      summarizeMonthlyBusinessUsage({
        scope: 'internal_synthetic',
        month: '2030-10',
        completeness: 'complete',
        events: [
          runtime('event_001', 'booking_created', '2030-10-01T01:00:00.000Z'),
          runtime('event_001', 'major_incident', '2030-10-01T01:00:00.000Z')
        ]
      })
    ).toThrow(DomainError);
    expect(() =>
      summarizeMonthlyBusinessUsage({
        scope: 'internal_synthetic',
        month: '2030-10',
        completeness: 'complete',
        events: [
          runtime('login_001', 'staff_login', '2030-10-01T01:00:00.000Z')
        ]
      })
    ).toThrow(/actorId/);
  });
});
