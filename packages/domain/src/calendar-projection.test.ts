import { describe, expect, it } from 'vitest';

import { calendarEventIdForAppointment } from './calendar-event-id.js';
import {
  assertClinicCalendarPayloadAllowlist,
  buildClinicCalendarEventBody,
  calendarPayloadForbiddenKeys,
  calendarPayloadUsesAllowlistedEventKeys,
  clinicProjectionVersion,
  formatClinicCalendarSummary,
  inboundFieldAllowlist,
  isOnBookingKindGrid,
  isSelfProjectedCalendarEcho,
  resolveCalendarEventIdentity
} from './calendar-projection.js';

const EVENT_ID = calendarEventIdForAppointment('appointment_001');

const body = () =>
  buildClinicCalendarEventBody({
    eventId: EVENT_ID,
    appointmentId: 'appointment_001',
    appointmentStatus: 'confirmed',
    bookingKind: 'initial',
    startsAt: '2030-01-02T04:00:00.000Z',
    endsAt: '2030-01-02T05:00:00.000Z',
    colorId: '10',
    clinicName: '一森渼診所',
    clinicAddress: '臺北市松山區光復北路112號2樓',
    correlationId: 'corr_calendar_001'
  });

describe('clinic Calendar projection allowlist', () => {
  it('keeps confirmed titles on the existing clinic Canon', () => {
    expect(
      formatClinicCalendarSummary({
        clinicName: '一森渼診所',
        bookingKind: 'initial',
        appointmentStatus: 'confirmed'
      })
    ).toBe('一森渼診所 初診');
  });

  it('patches arrived and completed onto the same title family without deleting', () => {
    expect(
      formatClinicCalendarSummary({
        clinicName: '一森渼診所',
        bookingKind: 'follow_up',
        appointmentStatus: 'arrived'
      })
    ).toBe('✅到診｜一森渼診所｜回診');
    expect(
      formatClinicCalendarSummary({
        clinicName: '一森渼診所',
        bookingKind: 'follow_up',
        appointmentStatus: 'completed'
      })
    ).toBe('✅完成｜一森渼診所｜回診');
  });

  it('emits only allowlisted event keys and source markers', () => {
    const payload = body();
    expect(calendarPayloadUsesAllowlistedEventKeys(payload)).toBe(true);
    expect(calendarPayloadForbiddenKeys(payload)).toEqual([]);
    expect(() => assertClinicCalendarPayloadAllowlist(payload)).not.toThrow();
    expect(payload.extendedProperties.private.beauessenceSource).toBe(
      'clinic_db'
    );
    expect(payload.extendedProperties.private.beauessenceLinkId).toBe(
      'appointment_001'
    );
    expect(payload.description).toBe('預約編號 appointment_001');
  });

  it('refuses forbidden clinical, identity-document and money fields', () => {
    const payload = body();
    const smuggled = {
      ...payload,
      extendedProperties: {
        private: {
          ...payload.extendedProperties.private,
          dateOfBirth: '1990-01-01',
          diagnosis: 'synthetic-diagnosis',
          anesthesia: { notes: 'blocked' },
          paymentAmount: 1,
          nationalId: 'A123456789'
        }
      }
    };
    expect(calendarPayloadForbiddenKeys(smuggled)).toEqual(
      expect.arrayContaining([
        'dateOfBirth',
        'diagnosis',
        'anesthesia',
        'paymentAmount',
        'nationalId'
      ])
    );
    expect(() =>
      assertClinicCalendarPayloadAllowlist(
        smuggled as unknown as Record<string, unknown>
      )
    ).toThrow(/forbidden fields/);
  });

  it('ignores Calendar free-text fields that must not overwrite the patient record', () => {
    expect(
      inboundFieldAllowlist(['startsAt', 'description', 'notes', 'title'])
    ).toEqual({
      allowed: ['startsAt'],
      ignored: ['description', 'notes', 'title']
    });
  });
});

describe('clinic Calendar identity and echo skip', () => {
  it('resolves the deterministic appointment mapping from the event id', () => {
    expect(
      resolveCalendarEventIdentity({
        id: EVENT_ID,
        extendedProperties: {
          private: { beauessenceLinkId: 'appointment_001' }
        }
      })
    ).toMatchObject({
      appointmentId: 'appointment_001',
      logicalKind: 'appointment',
      linkId: 'appointment_001'
    });
  });

  it('skips a self-projected outbound patch replay', () => {
    const payload = body();
    expect(
      isSelfProjectedCalendarEcho({
        event: {
          id: payload.id,
          start: payload.start,
          end: payload.end,
          extendedProperties: payload.extendedProperties
        },
        appointmentId: 'appointment_001',
        appointmentStatus: 'confirmed',
        startsAt: '2030-01-02T04:00:00.000Z'
      })
    ).toBe(true);
    expect(
      isSelfProjectedCalendarEcho({
        event: {
          id: payload.id,
          start: { dateTime: '2030-01-02T06:15:00.000Z' },
          end: { dateTime: '2030-01-02T06:45:00.000Z' },
          extendedProperties: payload.extendedProperties
        },
        appointmentId: 'appointment_001',
        appointmentStatus: 'confirmed',
        startsAt: '2030-01-02T04:00:00.000Z'
      })
    ).toBe(false);
    expect(
      clinicProjectionVersion({
        appointmentId: 'appointment_001',
        appointmentStatus: 'arrived',
        startsAt: '2030-01-02T04:00:00.000Z'
      })
    ).not.toBe(
      clinicProjectionVersion({
        appointmentId: 'appointment_001',
        appointmentStatus: 'confirmed',
        startsAt: '2030-01-02T04:00:00.000Z'
      })
    );
  });

  it('keeps follow_up on :15/:45 and rejects :30', () => {
    expect(isOnBookingKindGrid('2030-01-02T06:15:00.000Z', 'follow_up')).toBe(
      true
    );
    expect(isOnBookingKindGrid('2030-01-02T06:30:00.000Z', 'follow_up')).toBe(
      false
    );
    expect(isOnBookingKindGrid('2030-01-02T06:00:00.000Z', 'initial')).toBe(
      true
    );
  });
});
