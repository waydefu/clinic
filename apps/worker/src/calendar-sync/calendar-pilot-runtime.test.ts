import { describe, expect, it } from 'vitest';

import { calendarWriteEventForMirror } from './calendar-pilot-runtime.js';

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
