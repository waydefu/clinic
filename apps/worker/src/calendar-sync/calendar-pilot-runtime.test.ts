import type { Firestore } from 'firebase-admin/firestore';
import { describe, expect, it, vi } from 'vitest';

import {
  assertExpectedMirrorEtag,
  CalendarPilotRuntime,
  claimCalendarPilotJobs,
  C1_SYNTHETIC_CALENDAR_SOURCE_ID,
  calendarWriteEventForConfirmedAppointment,
  calendarWriteEventForMirror,
  resolveCalendarPilotRuntimeConfiguration
} from './calendar-pilot-runtime.js';

describe('calendar pilot canonical runtime clock', () => {
  const environment = {
    CALENDAR_PILOT_RUNTIME_MODE: 'C1_SYNTHETIC_ADC',
    GOOGLE_CLOUD_PROJECT: 'beauessence-clinic-stg-c1a01',
    CALENDAR_PILOT_PSEUDONYM_KEY: 'p'.repeat(32),
    GOOGLE_CALENDAR_AUTH: 'CLOUD_ADC',
    GOOGLE_CALENDAR_ID: 'synthetic-calendar-id'
  };
  function setup() {
    const query = {
      doc: vi.fn(() => ({})),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      get: vi.fn(() => Promise.resolve({ docs: [] }))
    };
    const collection = vi.fn(() => query);
    const runTransaction = vi.fn(() => Promise.resolve(undefined));
    const db = { collection, runTransaction } as unknown as Firestore;
    return { db, collection, runTransaction };
  }

  it.each([
    '2026-02-30T00:00:00Z',
    '2026-02-29T00:00:00Z',
    '2026-01-01T24:00:00Z',
    '2026-01-01T00:00:00',
    '2026-01-01T08:00:00+08:00',
    'Jan 1 2026 GMT'
  ])(
    'rejects noncanonical clock %s before lease or job access',
    async (now) => {
      const { db, collection, runTransaction } = setup();
      const runtime = new CalendarPilotRuntime(db, environment, () => now);
      await expect(runtime.run()).rejects.toThrow(/lease/iu);
      await expect(
        claimCalendarPilotJobs(db, 'synthetic_worker', now)
      ).rejects.toThrow(/lease/iu);
      expect(collection).not.toHaveBeenCalled();
      expect(runTransaction).not.toHaveBeenCalled();
    }
  );

  it.each(['2028-02-29T00:00:00Z', '2028-02-29T00:00:00.123456Z'])(
    'keeps valid leap-day UTC precision %s',
    async (now) => {
      const { db, collection, runTransaction } = setup();
      const runtime = new CalendarPilotRuntime(db, environment, () => now);
      await expect(runtime.run()).resolves.toEqual({
        acquired: false,
        processedJobs: 0,
        failedJobs: 0
      });
      await expect(
        claimCalendarPilotJobs(db, 'synthetic_worker', now)
      ).resolves.toEqual([]);
      expect(collection).toHaveBeenCalledWith('calendar_pilot_configuration');
      expect(collection).toHaveBeenCalledWith('calendar_pilot_outbox');
      expect(runTransaction).toHaveBeenCalledOnce();
    }
  );
});

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
  it('restores the original event from the confirmed appointment source of truth', () => {
    const appointmentId = 'appointment_001';
    const mirror = {
      externalEventId: 'linked_external_event_77',
      etag: '"etag-001"',
      linkId: appointmentId,
      parsed: {
        ok: true as const,
        kind: 'appointment' as const,
        patientCode: 'A18',
        bookingKind: 'follow_up' as const,
        serviceId: 'service_aesthetic' as const,
        displayLabel: 'A18，複診，美學',
        startsAt: '2030-01-02T04:30:00.000Z',
        endsAt: '2030-01-02T05:00:00.000Z'
      }
    };

    expect(
      calendarWriteEventForConfirmedAppointment(
        mirror,
        {
          appointmentId,
          status: 'confirmed',
          patientCode: 'A17',
          bookingKind: 'initial',
          serviceId: 'service_snoring',
          startsAt: '2030-01-02T04:00:00.000Z',
          endsAt: '2030-01-02T04:30:00.000Z'
        },
        appointmentId
      )
    ).toEqual({
      eventId: 'linked_external_event_77',
      title: '[預約] A17｜初診｜止鼾',
      startsAt: '2030-01-02T04:00:00.000Z',
      endsAt: '2030-01-02T04:30:00.000Z',
      linkId: appointmentId
    });
  });

  it('fails closed when the SoT appointment is missing, cancelled, or linked elsewhere', () => {
    const appointmentId = 'appointment_001';
    const mirror = {
      externalEventId: 'linked_external_event_77',
      etag: '"etag-001"',
      linkId: appointmentId,
      parsed: {
        ok: true as const,
        kind: 'appointment' as const,
        patientCode: 'A17',
        bookingKind: 'initial' as const,
        serviceId: 'service_snoring' as const,
        displayLabel: 'A17，初診，止鼾',
        startsAt: '2030-01-02T04:30:00.000Z',
        endsAt: '2030-01-02T05:00:00.000Z'
      }
    };
    const confirmed = {
      appointmentId,
      status: 'confirmed',
      patientCode: 'A17',
      bookingKind: 'initial',
      serviceId: 'service_snoring',
      startsAt: '2030-01-02T04:00:00.000Z',
      endsAt: '2030-01-02T04:30:00.000Z'
    };

    expect(() =>
      calendarWriteEventForConfirmedAppointment(
        mirror,
        undefined,
        appointmentId
      )
    ).toThrow(/link is invalid/u);
    expect(() =>
      calendarWriteEventForConfirmedAppointment(
        mirror,
        { ...confirmed, status: 'cancelled' },
        appointmentId
      )
    ).toThrow(/missing or changed/u);
    expect(() =>
      calendarWriteEventForConfirmedAppointment(
        { ...mirror, linkId: 'another_appointment' },
        confirmed,
        appointmentId
      )
    ).toThrow(/link is invalid/u);
  });

  it('fails closed on mirror ETag drift before updating an existing event', () => {
    const mirror = {
      externalEventId: 'linked_external_event_77',
      etag: '"etag-002"',
      parsed: {
        ok: true as const,
        kind: 'appointment' as const,
        patientCode: 'A17',
        bookingKind: 'initial' as const,
        serviceId: 'service_snoring' as const,
        displayLabel: 'A17，初診，止鼾',
        startsAt: '2030-01-02T04:30:00.000Z',
        endsAt: '2030-01-02T05:00:00.000Z'
      }
    };
    expect(() => assertExpectedMirrorEtag(mirror, '"etag-001"')).toThrow(
      /version is stale/u
    );
    expect(() => assertExpectedMirrorEtag(mirror, undefined)).toThrow(
      /version is stale/u
    );
  });

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
