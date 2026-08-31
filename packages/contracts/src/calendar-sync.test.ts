import { describe, expect, it } from 'vitest';

import {
  ActivateCalendarSourceRequestSchema,
  CalendarChangeCandidateSchema,
  AvailabilityBlockSchema,
  CalendarSourceSummarySchema,
  CalendarSyncStatusSchema,
  CorrectCalendarCandidateRequestSchema,
  CreateSyntheticAppointmentRequestSchema
} from './index.js';

const source = {
  sourceId: 'calendar_source_a',
  displayName: 'CAL-PILOT 假來源',
  state: 'active',
  active: true,
  previous: false,
  version: 2,
  lastSyncedAt: '2026-08-28T08:00:00.000Z',
  lastErrorCode: null
};

describe('calendar sync contracts', () => {
  it('exposes only an opaque source summary', () => {
    expect(CalendarSourceSummarySchema.parse(source)).toEqual(source);
    expect(
      CalendarSourceSummarySchema.safeParse({
        ...source,
        calendarId: 'sensitive-calendar-id'
      }).success
    ).toBe(false);
  });

  it('requires optimistic concurrency and idempotency for source changes', () => {
    expect(
      ActivateCalendarSourceRequestSchema.parse({
        idempotencyKey: 'calendar_switch_0001',
        expectedVersion: 2,
        sourceId: 'calendar_source_b'
      }).expectedVersion
    ).toBe(2);
    expect(
      ActivateCalendarSourceRequestSchema.safeParse({
        sourceId: 'calendar_source_b'
      }).success
    ).toBe(false);
  });

  it('keeps raw Google identifiers out of change candidates', () => {
    const candidate = {
      candidateId: 'candidate_001',
      kind: 'create_appointment',
      status: 'pending',
      displayLabel: 'A17，初診，止鼾',
      startsAt: '2026-09-02T06:00:00.000Z',
      endsAt: '2026-09-02T06:30:00.000Z',
      sourceVersion: 2,
      expectedVersion: 0,
      validationErrors: [],
      createdAt: '2026-08-28T08:00:00.000Z',
      before: null
    };
    expect(CalendarChangeCandidateSchema.parse(candidate)).toEqual(candidate);
    expect(
      CalendarChangeCandidateSchema.safeParse({
        ...candidate,
        googleEventId: 'raw-event-id'
      }).success
    ).toBe(false);
  });

  it('describes expiry and pending work without leaking connector state', () => {
    expect(
      CalendarSyncStatusSchema.parse({
        health: 'healthy',
        activeSource: source,
        lastSuccessfulSyncAt: '2026-08-28T08:00:00.000Z',
        nextScheduledSyncAt: '2026-08-28T08:05:00.000Z',
        pendingCandidateCount: 2,
        conflictCount: 1,
        expiresAt: '2026-09-27T08:00:00.000Z'
      }).health
    ).toBe('healthy');
  });

  it('accepts only closed synthetic patient and service values', () => {
    const base = {
      idempotencyKey: 'req_calendar_test_001',
      expectedVersion: 0,
      bookingKind: 'initial',
      serviceId: 'service_snoring',
      startsAt: '2026-08-28T04:00:00.000Z'
    };
    expect(
      CreateSyntheticAppointmentRequestSchema.safeParse({
        ...base,
        patientCode: 'A17'
      }).success
    ).toBe(true);
    expect(
      CreateSyntheticAppointmentRequestSchema.safeParse({
        ...base,
        patientCode: 'A31'
      }).success
    ).toBe(false);
  });

  it('accepts only controlled candidate corrections and rejects clinical text', () => {
    const common = {
      idempotencyKey: 'candidate_correct_0001',
      expectedVersion: 0
    };
    expect(
      CorrectCalendarCandidateRequestSchema.safeParse({
        ...common,
        kind: 'appointment',
        patientCode: 'A30',
        bookingKind: 'follow_up',
        serviceId: 'service_aesthetic',
        startsAt: '2026-09-02T06:15:00.000Z'
      }).success
    ).toBe(true);
    expect(
      CorrectCalendarCandidateRequestSchema.safeParse({
        ...common,
        kind: 'busy',
        busyReason: 'leave',
        timeRange: {
          kind: 'all_day',
          startDate: '2026-09-02',
          endDate: '2026-09-04'
        }
      }).success
    ).toBe(true);
    for (const forbidden of [
      'name',
      'phone',
      'editor',
      'source',
      'anesthesia'
    ]) {
      expect(
        CorrectCalendarCandidateRequestSchema.safeParse({
          ...common,
          kind: 'appointment',
          patientCode: 'A17',
          bookingKind: 'initial',
          serviceId: 'service_snoring',
          startsAt: '2026-09-02T06:00:00.000Z',
          [forbidden]: '不得接受'
        }).success
      ).toBe(false);
    }
  });

  it('marks the capacity line on every public availability block', () => {
    expect(
      AvailabilityBlockSchema.parse({
        blockId: 'block_001',
        kind: 'appointment',
        bookingKind: 'initial',
        startsAt: '2026-09-02T06:00:00.000Z',
        endsAt: '2026-09-02T06:30:00.000Z',
        displayLabel: 'A17，合成預約'
      }).bookingKind
    ).toBe('initial');
  });
});
