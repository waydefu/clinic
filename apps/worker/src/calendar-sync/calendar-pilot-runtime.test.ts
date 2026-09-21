import { describe, expect, it } from 'vitest';

import {
  C1_SYNTHETIC_CALENDAR_SOURCE_ID,
  calendarWriteEventForMirror,
  resolveCalendarPilotRuntimeConfiguration
} from './calendar-pilot-runtime.js';

describe('calendar pilot runtime configuration', () => {
  const pseudonymKey = 'p'.repeat(32);

  it('uses one synthetic Calendar through keyless ADC in C1', () => {
    expect(
      resolveCalendarPilotRuntimeConfiguration({
        CALENDAR_PILOT_RUNTIME_MODE: 'C1_SYNTHETIC_ADC',
        GOOGLE_CLOUD_PROJECT: 'beauessence-clinic-stg-c1a01',
        CALENDAR_PILOT_PSEUDONYM_KEY: pseudonymKey,
        GOOGLE_CALENDAR_AUTH: 'CLOUD_ADC',
        GOOGLE_CALENDAR_ID: 'synthetic-calendar-id'
      })
    ).toEqual({
      auth: 'cloud_adc',
      pseudonymKey,
      sources: {
        [C1_SYNTHETIC_CALENDAR_SOURCE_ID]: {
          calendarId: 'synthetic-calendar-id'
        }
      }
    });
  });

  it('refuses user-managed service-account credentials in C1', () => {
    expect(() =>
      resolveCalendarPilotRuntimeConfiguration({
        CALENDAR_PILOT_RUNTIME_MODE: 'C1_SYNTHETIC_ADC',
        GOOGLE_CLOUD_PROJECT: 'beauessence-clinic-stg-c1a01',
        CALENDAR_PILOT_PSEUDONYM_KEY: pseudonymKey,
        GOOGLE_CALENDAR_AUTH: 'CLOUD_ADC',
        GOOGLE_CALENDAR_ID: 'synthetic-calendar-id',
        GOOGLE_SERVICE_ACCOUNT_JSON: 'forbidden-secret'
      })
    ).toThrow(/forbids user-managed/u);
  });

  it('fails closed when the pseudonym key is missing or short', () => {
    expect(() =>
      resolveCalendarPilotRuntimeConfiguration({
        CALENDAR_PILOT_RUNTIME_MODE: 'C1_SYNTHETIC_ADC',
        GOOGLE_CLOUD_PROJECT: 'beauessence-clinic-stg-c1a01',
        CALENDAR_PILOT_PSEUDONYM_KEY: 'short',
        GOOGLE_CALENDAR_AUTH: 'CLOUD_ADC',
        GOOGLE_CALENDAR_ID: 'synthetic-calendar-id'
      })
    ).toThrow(/at least 32/u);
  });

  it('refuses C1 mode outside the isolated project and unknown modes', () => {
    expect(() =>
      resolveCalendarPilotRuntimeConfiguration({
        CALENDAR_PILOT_RUNTIME_MODE: 'C1_SYNTHETIC_ADC',
        CALENDAR_PILOT_PSEUDONYM_KEY: pseudonymKey,
        GOOGLE_CLOUD_PROJECT: 'beauessence-clinic-staging',
        GOOGLE_CALENDAR_AUTH: 'CLOUD_ADC',
        GOOGLE_CALENDAR_ID: 'synthetic-calendar-id'
      })
    ).toThrow(/isolated C1 project/u);
    expect(() =>
      resolveCalendarPilotRuntimeConfiguration({
        CALENDAR_PILOT_RUNTIME_MODE: 'unknown',
        CALENDAR_PILOT_PSEUDONYM_KEY: pseudonymKey
      })
    ).toThrow(/Unknown Calendar pilot runtime mode/u);
  });
});

describe('calendar projection restore', () => {
  it('updates the original event and adds only the private opaque link', () => {
    expect(
      calendarWriteEventForMirror(
        {
          externalEventId: 'original_google_event',
          etag: '"etag-001"',
          linkId: 'projection_001',
          parsed: {
            ok: true,
            kind: 'appointment',
            patientCode: 'A17',
            bookingKind: 'initial',
            serviceId: 'service_snoring',
            displayLabel: 'A17，初診，止鼾',
            startsAt: '2026-09-02T06:00:00.000Z',
            endsAt: '2026-09-02T06:30:00.000Z'
          }
        },
        'fallback_link'
      )
    ).toEqual({
      eventId: 'original_google_event',
      title: '[預約] A17｜初診｜止鼾',
      startsAt: '2026-09-02T06:00:00.000Z',
      endsAt: '2026-09-02T06:30:00.000Z',
      linkId: 'projection_001'
    });
  });

  it('preserves all-day and cross-day busy metadata', () => {
    expect(
      calendarWriteEventForMirror(
        {
          externalEventId: 'original_busy_event',
          etag: '"etag-002"',
          parsed: {
            ok: true,
            kind: 'busy',
            busyReason: 'leave',
            displayLabel: '忙碌：休假',
            startsAt: '2026-09-01T16:00:00.000Z',
            endsAt: '2026-09-03T16:00:00.000Z',
            allDay: true,
            startDate: '2026-09-02',
            endDate: '2026-09-04'
          }
        },
        'mirror_001'
      )
    ).toEqual({
      eventId: 'original_busy_event',
      title: '[忙碌] 休假',
      allDay: true,
      startDate: '2026-09-02',
      endDate: '2026-09-04',
      linkId: 'mirror_001'
    });
  });
});
