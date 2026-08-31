import { describe, expect, it } from 'vitest';

import {
  formatBusyTitle,
  formatSyntheticAppointmentTitle,
  parseCalendarEntry
} from './calendar-sync.js';

const patients = new Set(['A17', 'B04']);

describe('calendar entry format', () => {
  it('parses the exact synthetic appointment title and clinic grid', () => {
    expect(
      parseCalendarEntry(
        {
          summary: '[預約] A17｜初診｜止鼾',
          start: { dateTime: '2026-09-02T14:00:00+08:00' },
          end: { dateTime: '2026-09-02T14:30:00+08:00' }
        },
        patients
      )
    ).toEqual({
      ok: true,
      kind: 'appointment',
      patientCode: 'A17',
      bookingKind: 'initial',
      serviceId: 'service_snoring',
      displayLabel: 'A17，初診，止鼾',
      startsAt: '2026-09-02T06:00:00.000Z',
      endsAt: '2026-09-02T06:30:00.000Z'
    });
  });

  it('fails closed for an unknown patient, wrong duration or wrong grid', () => {
    expect(
      parseCalendarEntry(
        {
          summary: '[預約] C99｜回診｜醫美',
          start: { dateTime: '2026-09-02T14:00:00+08:00' },
          end: { dateTime: '2026-09-02T15:00:00+08:00' }
        },
        patients
      )
    ).toEqual({
      ok: false,
      errors: [
        'patient_code_unknown',
        'appointment_duration_invalid',
        'appointment_off_grid'
      ]
    });
  });

  it('rejects an otherwise valid grid point outside clinic hours', () => {
    expect(
      parseCalendarEntry(
        {
          summary: '[預約] A17｜初診｜止鼾',
          start: { dateTime: '2026-09-06T14:00:00+08:00' },
          end: { dateTime: '2026-09-06T14:30:00+08:00' }
        },
        patients
      )
    ).toEqual({ ok: false, errors: ['appointment_outside_hours'] });
  });

  it('accepts timed and all-day busy blocks, including multiple days', () => {
    expect(
      parseCalendarEntry(
        {
          summary: '[忙碌] 會議',
          start: { dateTime: '2026-09-02T14:10:00+08:00' },
          end: { dateTime: '2026-09-02T15:40:00+08:00' }
        },
        patients
      )
    ).toMatchObject({ ok: true, kind: 'busy', busyReason: 'meeting' });

    expect(
      parseCalendarEntry(
        {
          summary: '[忙碌] 休假',
          start: { date: '2026-09-02' },
          end: { date: '2026-09-04' }
        },
        patients
      )
    ).toEqual({
      ok: true,
      kind: 'busy',
      busyReason: 'leave',
      displayLabel: '忙碌：休假',
      startsAt: '2026-09-01T16:00:00.000Z',
      endsAt: '2026-09-03T16:00:00.000Z'
    });
  });

  it('never treats an all-day event as an appointment', () => {
    expect(
      parseCalendarEntry(
        {
          summary: '[預約] A17｜初診｜止鼾',
          start: { date: '2026-09-02' },
          end: { date: '2026-09-03' }
        },
        patients
      )
    ).toEqual({
      ok: false,
      errors: ['appointment_all_day', 'time_missing']
    });
  });

  it('rejects arbitrary text and unknown busy reasons', () => {
    expect(
      parseCalendarEntry(
        {
          summary: '王小明 14:00 看診',
          start: { dateTime: '2026-09-02T14:00:00+08:00' },
          end: { dateTime: '2026-09-02T14:30:00+08:00' }
        },
        patients
      )
    ).toEqual({ ok: false, errors: ['title_format_invalid'] });
    expect(
      parseCalendarEntry(
        {
          summary: '[忙碌] 私人行程',
          start: { dateTime: '2026-09-02T14:00:00+08:00' },
          end: { dateTime: '2026-09-02T14:30:00+08:00' }
        },
        patients
      )
    ).toEqual({ ok: false, errors: ['busy_reason_unknown'] });
  });

  it('formats only the approved closed vocabulary', () => {
    expect(
      formatSyntheticAppointmentTitle({
        patientCode: 'A17',
        bookingKind: 'follow_up',
        serviceId: 'service_aesthetic'
      })
    ).toBe('[預約] A17｜回診｜醫美');
    expect(formatBusyTitle('training')).toBe('[忙碌] 教育訓練');
  });
});
